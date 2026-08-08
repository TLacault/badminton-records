# Match Data & Admin Tagging Tool — Design

**Date:** 2026-08-08
**Scope:** Sub-projects A (match & player data) and B (admin tagging tool + scoring engine)
**Stack:** Nuxt 4, Vue 3, Supabase (Postgres + Auth), Tailwind v4

---

## 1. Context and decomposition

`docs/features.md` describes four largely independent subsystems:

| # | Sub-project | Depends on |
|---|---|---|
| A | Match & player data — roster, matches, scores, YouTube linkage, admin CRUD | — |
| B | Admin tagging tool — keyboard point logger, scoring/serve engine | A |
| C | Guest enhanced player — overlay UI, point/set navigation, stats | A, B |
| D | Resources + skill tree | — |

This document covers **A + B only**. They are specified together because the shape of the rally log
that B writes *is* the data model A must store; designing them apart would mean designing the schema
twice.

C and D each get their own spec → plan → implementation cycle.

## 2. Decisions taken

| Decision | Choice | Rationale |
|---|---|---|
| Match formats | Singles **and** doubles | Both get filmed; doubles drives the serve-rotation logic |
| Point time bounds | End marker only, contiguous | One keypress per rally; a point spans `[previous end, this end]` |
| `R` key semantics | **Let** (rally replayed, no score) | Resolved ambiguity in `features.md`; it is a scoring event, not a video annotation |
| Auth scope | Admins only; visitors anonymous | Nothing in A+B stores per-user state; public signup deferred to D |
| Corrections | Editable point list beside the video | Linear undo alone cannot fix a mistake spotted 8 rallies later |
| State architecture | Event-sourced log, derived state | Single source of truth; edit-anywhere and shared admin/guest logic fall out for free |
| Rally persistence | Relational `rallies` table | C's stats features will aggregate across matches in SQL |
| Styling | Tailwind v4, no component library | Admin UI is utilitarian; leaves C's public design unconstrained |
| Tests | **Deferred by user request** | Straight implementation now; tests in a later pass |

## 3. Data model

Nothing derived is ever stored. The rally log is the only truth.

```sql
profiles                          -- 1:1 with auth.users
  id            uuid pk references auth.users
  display_name  text
  role          text not null default 'guest'    -- 'admin' | 'guest'

players                           -- roster, reused across matches
  id            uuid pk
  first_name    text not null
  last_name     text not null
  club          text
  birth_year    int                               -- NOT age
  rank_singles  text                              -- 'D9', 'R6', 'N3'…
  rank_doubles  text
  rank_mixed    text
  ffbad_license text                              -- hook only; no integration
  notes         text
  created_at    timestamptz default now()

matches
  id              uuid pk
  title           text not null
  played_on       date
  venue           text
  format          text not null                   -- 'singles' | 'doubles'
  youtube_video_id text
  status          text not null default 'draft'   -- 'draft' | 'published'
  -- scoring config: unusual formats need no code change
  best_of         int  not null default 3
  points_to_win   int  not null default 21
  win_by          int  not null default 2
  points_cap      int  not null default 30
  -- initial conditions; everything after is derived
  initial_server_side       smallint              -- 1 | 2
  side1_right_court_slot    smallint              -- doubles only; 1 | 2
  side2_right_court_slot    smallint              -- doubles only; 3 | 4
  created_by      uuid references profiles
  created_at, updated_at  timestamptz

match_players                     -- participants + numkey mapping
  match_id  uuid references matches on delete cascade
  player_id uuid references players
  slot      smallint not null check (slot between 1 and 4)   -- & é " '
  side      smallint generated always as
              (case when slot <= 2 then 1 else 2 end) stored
  primary key (match_id, player_id)

rallies                           -- the event log
  id            uuid pk
  match_id      uuid references matches on delete cascade
  idx           int not null                      -- 0-based order
  winner_side   smallint                          -- null iff is_let
  is_let        boolean not null default false
  is_highlight  boolean not null default false
  scored_by_player_id uuid references players     -- numkey slot resolved via match_players
  ended_at_seconds    numeric not null            -- video time of point END
  check ((is_let and winner_side is null)
      or (not is_let and winner_side is not null))
  unique (match_id, idx) deferrable initially deferred

match_game_starts                 -- 0–3 rows per match; doubles overrides only
  match_id     uuid references matches on delete cascade
  game_number  smallint not null
  server_slot            smallint                 -- all nullable overrides
  side1_right_court_slot smallint
  side2_right_court_slot smallint
  primary key (match_id, game_number)
```

Positions are expressed as **slots (1–4), never player ids** — in both `matches` and
`match_game_starts` — so the engine never has to resolve a foreign key to answer a rules question.
`match_players` is the single place slots map to people.

`initial_server_side` plus the two right-court slots fully determine the opening server: at 0–0 the
score is even, so the serving side's right-court player serves. In `match_game_starts`, `server_slot`
overrides only *which partner* of the previous game's winning side serves first; the serving side
itself is always derived and never overridable.

### Modelling notes

**`birth_year`, not `age`.** Age is a fact about today, not about the player. Stored, it silently
rots. Derived at render time, it is always correct.

**Side 1 is always the channel owner's side**, by convention. This is what makes `A` and `Z`
meaningful. `slot` 1–4 maps directly onto the `& é " '` numkeys, so no lookup table is needed.

**Doubles initial positions need two columns, not four.** At 0–0 the first server stands in the right
service court and the receiver is diagonally opposite, so recording who starts on the right for each
side pins down all four positions.

**`unique (match_id, idx)` must be `DEFERRABLE INITIALLY DEFERRED`.** Inserting a missed rally
mid-match renumbers every later rally, passing through transiently duplicate indexes. A
non-deferrable constraint makes that transaction fail, and the failure is invisible until the point
editor is used on real data.

### Row-level security

| Table | Anonymous read | Admin write |
|---|---|---|
| `players` | yes | yes |
| `matches` | only `status = 'published'` | yes |
| `match_players`, `rallies`, `match_game_starts` | only via a published match | yes |
| `profiles` | own row only | own row only |

Writes everywhere require `profiles.role = 'admin'`. Drafts are readable only by admins.

## 4. The scoring engine

A single pure function in `shared/badminton/` — no Vue, no Supabase, no I/O — imported verbatim by
both the admin tool and (later) the guest player, so the two can never disagree about a score.

```ts
deriveMatch(config, rallies) → {
  rallyStates[],   // per rally: game #, score before/after, serving slot,
                   // service court, receiving slot, time range, game/match point
  games[],         // score, winner side, rally range, complete?
  matchWinnerSide,
  complete,
  warnings[]
}
```

### Rules encoded

- **Rally scoring.** Every rally scores a point for its winner.
- **Game.** First to `points_to_win` with a margin of `win_by`, hard-capped at `points_cap` (at
  29–29 the 30th point wins).
- **Match.** First to `ceil(best_of / 2)` games.
- **Service.** The winner of a rally serves the next one. The first rally of the match uses
  `initial_server_side`; the first rally of a later game goes to the winner of the previous game.
- **Lets.** Change nothing: no score, no server, no service court, no positions.
- **Singles service court.** Parity of the server's own score — even → right, odd → left.
- **Doubles service court.** One invariant covers the entire rotation: *the serving side's two
  players swap courts when that side wins a rally; nobody else ever moves.* The server is then
  whichever of the two stands in the court their score's parity requires. Same-server-alternating-
  courts and service-passing-to-the-diagonal both follow from this.
- **Game boundaries are detected, never tagged.** No keypress ends a game; the engine sees 21–19 and
  opens the next game with the correct server. This also yields point/set navigation for C at no
  extra cost.

### The doubles game-start gap

At the start of games 2 and 3 the winning side serves — derivable. But *which partner* serves first
is the team's free choice on the day and cannot be recovered from the rally log. It affects no
point of the score, only serve attribution.

The engine therefore defaults to reusing game 1's arrangement and emits a warning. `match_game_starts`
holds an optional per-game override, editable from the admin match form.

### Warnings, not exceptions

Real footage is messy: streams cut mid-game, players retire, rallies get tagged past match point. The
engine never throws for any rally sequence. It derives what it can and reports:

- `rallies_after_match_complete`
- `final_game_incomplete`
- `missing_initial_server`
- `ambiguous_game_start` (doubles, no override)

The admin UI surfaces these as dismissible amber banners. A tool that refuses to render because the
data is odd is a tool that stops being used.

### Testing

Deferred at the user's request; this build ships without tests. The pure-function boundary exists so
they can be added later without touching the UI or the database. When that pass happens the targets
are: table-driven real scorelines (21–15, 24–22, 30–29, a full three-game match), hand-verified
doubles rotation sequences, and properties — score never exceeds the cap, points sum to rallies minus
lets, the server always belongs to the previous rally's winning side.

## 5. The tagging tool

Route `/admin/matches/[id]/tag`. Video left, live point list right.

### YouTube integration

A focused YouTube iframe swallows every keystroke, so the page would never see `A`. The iframe is
therefore covered by a transparent overlay that absorbs all pointer events and prevents it from ever
taking focus. All playback is driven through the IFrame Player API (`playVideo`, `pauseVideo`,
`seekTo`, `getCurrentTime`) from our own controls, with a `window`-level keydown listener.

That overlay is also the foundation of the custom player chrome C needs — same component, different
controls layered on top.

### Key bindings

| Key | Action |
|---|---|
| `A` / `Z` | rally won by side 1 / side 2 — records a rally at the current video time |
| `R` | let — zero-score rally, nothing changes |
| `P` | toggle highlight on the **last recorded** rally |
| `&` `é` `"` `'` | credit the point to player slot 1–4, applied to the last recorded rally |
| `Ctrl+Z` / `Ctrl+Y` | undo / redo |
| `Space` | play / pause |
| `←` / `→` | seek ∓5 s |

`features.md` says "the current point *was* a highlight" — past tense — so `P` and the numkeys
annotate the rally just logged rather than arming a flag for the next one.

**Keyboard layout.** The user is on AZERTY (`A`/`Z` adjacent; `& é " '` are the unshifted digits).
`event.code` reports physical position, so the AZERTY `A` key reports `KeyQ`. Letters must therefore
be matched on `event.key`; digits on `event.code` (`Digit1`–`Digit4`), which is layout-independent.

### Reaction lag

Keypresses land slightly after the rally ends, so every timestamp runs late by roughly the same
amount. Because points are contiguous, a constant lag shifts both boundaries of a point equally and
the rally still falls inside its window. No correction is applied.

### Undo/redo

Snapshot-based: the rally array is the whole state, so undo pushes copies of it onto a capped stack
(~100 entries, a few kilobytes). Keyboard tagging and point-list editing share one history
automatically — an inverse-command scheme would need reimplementing for every new edit type.

### Persistence

A Pinia store holds the rally array as the working source of truth. A debounced call (~1.5 s) sends
the **entire log** to one Postgres function:

```sql
save_match_rallies(p_match_id uuid, p_rallies jsonb)
```

which replaces the match's rallies inside a single transaction. At ~150 rows this is cheap, atomic,
and avoids diffing an array where a mid-list insert renumbers everything downstream. The deferrable
unique index is what makes the renumber legal.

The UI shows a saving/saved indicator and guards navigation while changes are unsaved.

### Point list

Columns: game, running score, server, timestamp, winner, highlight, scorer. Clicking a row seeks the
video to that point's start. Inline actions: flip winner, toggle highlight, toggle let, set scorer,
delete, insert-before. Every action re-derives the match immediately, so corrections visibly ripple
forward through the score.

### Responsiveness

The tagging tool is **desktop-first by design** — it needs a keyboard and two panels. On mobile it
degrades to a readable, editable point list without the tagging shortcuts. The public site is fully
responsive; the public experience proper is C.

## 6. Routes and structure

```
public
  /                        home — list of published matches
  /matches/[id]            match page: metadata, final score, embedded video
admin (guarded)
  /login
  /admin                   dashboard — drafts and published
  /admin/players           roster CRUD
  /admin/matches/new
  /admin/matches/[id]      metadata, participants, initial serve config
  /admin/matches/[id]/tag  tagging tool
```

The two public pages are deliberately plain — no overlay, no point navigation. They verify the full
path end to end (an anonymous visitor reads exactly the published data and nothing more) and give C a
page to upgrade rather than invent.

```
shared/badminton/          # pure engine — no Vue, no Supabase, no I/O
  types.ts  rules.ts  derive.ts
app/
  components/  player/  tagging/  match/
  composables/ useYouTubePlayer.ts  useTaggingSession.ts
  middleware/  admin.ts
  pages/…
  types/database.types.ts  # generated via supabase gen types
supabase/migrations/
```

`shared/` is a Nuxt 4 convention auto-imported by both the app and the Nitro server, keeping the
engine framework-free while available everywhere.

**Auth.** Supabase Auth, email + password. The two admin accounts are created by hand and promoted
via SQL; there is no self-serve path to admin. Nuxt middleware guards `/admin/**` so users get a
redirect rather than a page of failed queries, but RLS is the actual enforcement. `supabase.redirect`
in `nuxt.config.ts` is re-enabled once `/login` exists — it was disabled during scaffolding precisely
because it did not.

**Schema management.** Versioned migration files in `supabase/migrations/`, applied to the hosted
Supabase project with the CLI. `database.types.ts` is generated from the live schema, never
hand-written.

## 7. Out of scope

Named explicitly so the implementation plan cannot quietly absorb them:

- Guest enhanced player — overlay UI, point/set navigation, stats display → **C**
- Resources and skill tree → **D**
- FFBad / MyFFBad / EBad synchronisation. `ffbad_license` is a column and nothing more.
  `features.md` says "maybe… if they have one"; building against a possibly-nonexistent API is
  speculative work.
- Cross-match player statistics — requires C's aggregation work
- Public signup and per-user state — needed by D, by nothing here
- Video hosting or upload. YouTube only.
- Automated tests (deferred by user request, see §4)
