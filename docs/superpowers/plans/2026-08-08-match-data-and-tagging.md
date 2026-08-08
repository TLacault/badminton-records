# Match Data & Admin Tagging Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the match/player data layer and a keyboard-driven admin tool that logs every rally of a badminton match against a YouTube video, deriving score, server and service court from the rally log alone.

**Architecture:** Event-sourced. The `rallies` table is the only truth; a pure `deriveMatch()` function in `shared/badminton/` computes score, serving slot, service court, game boundaries and warnings on demand. The admin tool holds the rally array in a Pinia-free composable store, mutates it optimistically, and debounce-saves the whole log through one transactional Postgres RPC. Nothing derived is ever persisted.

**Tech Stack:** Nuxt 4.5, Vue 3.5, Supabase (Postgres + Auth), `@nuxtjs/supabase` 2.0, Tailwind CSS v4, TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-08-match-data-and-tagging-design.md`

## Global Constraints

- **No automated tests this pass.** Explicit user decision. Each task ends with a manual verification step and a commit. Do not add a test runner, test files, or CI.
- Package manager is **pnpm**. Never invoke `npm` or `yarn`.
- **Side 1 is always the channel owner's side.** `A` scores for side 1, `Z` for side 2.
- **Positions are slots (1–4), never player ids**, everywhere except `rallies.scored_by_player_id`.
- Slots 1–2 belong to side 1; slots 3–4 to side 2. Singles uses slots 1 and 3 only.
- **The user's keyboard is AZERTY.** Match letters on `event.key`; match digits on `event.code` (`Digit1`–`Digit4`). Never match letters on `event.code`.
- The engine in `shared/badminton/` must import nothing from Vue, Nuxt, or Supabase. Pure TypeScript only.
- The engine **never throws** for any rally sequence. Bad data produces `warnings[]`.
- All derived values are computed, never stored or cached in the database.
- Generated file `app/types/database.types.ts` is never hand-edited.
- Scoring rules come from the `matches` row (`best_of`, `points_to_win`, `win_by`, `points_cap`), never hardcoded in components.

## File Structure

```
shared/badminton/
  types.ts                    domain types, no logic
  rules.ts                    pure rule predicates + slot helpers
  derive.ts                   deriveMatch(): the entire rulebook
app/
  assets/css/main.css         tailwind entry
  layouts/default.vue         public shell
  layouts/admin.vue           admin shell + nav
  middleware/admin.ts         route guard for /admin/**
  composables/
    useCurrentProfile.ts      cached profile + isAdmin
    useYouTubePlayer.ts       IFrame API wrapper
    useTaggingSession.ts      rally array, undo/redo, autosave
  components/
    player/YouTubeStage.vue   iframe + focus-blocking overlay + custom controls
    tagging/ScoreBoard.vue    live derived score/serve display
    tagging/PointList.vue     editable rally list
    tagging/PointRow.vue      one rally row + inline actions
    tagging/KeyHelp.vue       key legend
    match/MatchForm.vue       metadata + participants + serve config
    match/PlayerPicker.vue    slot → player assignment
  pages/
    index.vue                 public match list
    matches/[id].vue          public match page
    login.vue
    admin/index.vue
    admin/players/index.vue
    admin/matches/new.vue
    admin/matches/[id]/index.vue
    admin/matches/[id]/tag.vue
  types/youtube.d.ts          minimal YT IFrame API types
supabase/migrations/
  0001_schema.sql
  0002_rls.sql
  0003_save_match_rallies.sql
scripts/
  derive-sanity.ts            eyeball check for the engine (not a test)
```

---

### Task 1: Tailwind v4 and app shell

**Files:**
- Create: `app/assets/css/main.css`, `app/layouts/default.vue`
- Modify: `nuxt.config.ts`, `app/app.vue`
- Create: `app/pages/index.vue`

**Interfaces:**
- Consumes: nothing
- Produces: a `default` layout wrapping `<slot />`; Tailwind utility classes available app-wide.

- [ ] **Step 1: Install Tailwind v4**

```bash
pnpm add tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Create the CSS entry**

`app/assets/css/main.css`:

```css
@import "tailwindcss";
```

- [ ] **Step 3: Wire Tailwind into nuxt.config.ts**

Replace the whole file:

```ts
import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxtjs/supabase'],
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  supabase: {
    // Route protection is handled by app/middleware/admin.ts, which guards
    // /admin/** only. The module's global redirect would force us to
    // enumerate every public route in `exclude` instead.
    redirect: false,
  },
})
```

- [ ] **Step 4: Replace app/app.vue**

```vue
<template>
  <NuxtRouteAnnouncer />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
```

- [ ] **Step 5: Create the default layout**

`app/layouts/default.vue`:

```vue
<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <header class="border-b border-slate-800">
      <nav class="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <NuxtLink to="/" class="text-lg font-semibold tracking-tight">
          UST Badminton
        </NuxtLink>
        <NuxtLink to="/admin" class="text-sm text-slate-400 hover:text-slate-100">
          Admin
        </NuxtLink>
      </nav>
    </header>
    <main class="mx-auto max-w-5xl px-4 py-8">
      <slot />
    </main>
  </div>
</template>
```

- [ ] **Step 6: Create a placeholder home page**

`app/pages/index.vue`:

```vue
<template>
  <h1 class="text-2xl font-bold">Matches</h1>
  <p class="mt-2 text-slate-400">Nothing published yet.</p>
</template>
```

- [ ] **Step 7: Verify**

Run: `pnpm dev`, open `http://localhost:3000`
Expected: dark slate page, "UST Badminton" header, "Matches" heading. If the background is white, Tailwind is not loading — check the `vite.plugins` entry and the `css` array path.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Tailwind v4 and app shell"
```

---

### Task 2: Supabase project, schema migration, generated types

**Files:**
- Create: `supabase/migrations/0001_schema.sql`
- Create: `app/types/database.types.ts` (generated)
- Modify: `package.json` (scripts), `.env`, `.env.example`

**Interfaces:**
- Consumes: nothing
- Produces: tables `profiles`, `players`, `matches`, `match_players`, `rallies`, `match_game_starts`; TypeScript type `Database` exported from `app/types/database.types.ts`.

**Prerequisite — the user must do this once, interactively:** create a project at https://supabase.com/dashboard, then run `pnpm supabase login` and `pnpm supabase link --project-ref <ref>` in the terminal. Copy the project URL and anon key into `.env`. Ask the user to do this rather than attempting it unattended.

- [ ] **Step 1: Install the Supabase CLI as a dev dependency**

```bash
pnpm add -D supabase
```

- [ ] **Step 2: Initialise the Supabase directory**

```bash
pnpm supabase init
```

Answer "n" if asked about generating VS Code settings or Deno config.

- [ ] **Step 3: Add convenience scripts to package.json**

Add to the `"scripts"` block:

```json
"db:push": "supabase db push",
"db:types": "supabase gen types typescript --linked > app/types/database.types.ts"
```

- [ ] **Step 4: Write the schema migration**

`supabase/migrations/0001_schema.sql`:

```sql
-- profiles: 1:1 with auth.users. Role is set by SQL only; there is no
-- self-serve path to admin.
create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  role         text not null default 'guest' check (role in ('guest', 'admin')),
  created_at   timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- players: the roster, reused across matches.
create table public.players (
  id            uuid primary key default gen_random_uuid(),
  first_name    text not null,
  last_name     text not null,
  club          text,
  birth_year    int check (birth_year between 1900 and 2100),
  rank_singles  text,
  rank_doubles  text,
  rank_mixed    text,
  ffbad_license text,
  notes         text,
  created_at    timestamptz not null default now()
);

create index players_last_name_idx on public.players (last_name, first_name);

-- matches
create table public.matches (
  id                     uuid primary key default gen_random_uuid(),
  title                  text not null,
  played_on              date,
  venue                  text,
  format                 text not null check (format in ('singles', 'doubles')),
  youtube_video_id       text,
  status                 text not null default 'draft'
                           check (status in ('draft', 'published')),
  best_of                int not null default 3 check (best_of in (1, 3, 5)),
  points_to_win          int not null default 21 check (points_to_win > 0),
  win_by                 int not null default 2 check (win_by >= 1),
  points_cap             int not null default 30 check (points_cap >= points_to_win),
  initial_server_side    smallint check (initial_server_side in (1, 2)),
  side1_right_court_slot smallint check (side1_right_court_slot in (1, 2)),
  side2_right_court_slot smallint check (side2_right_court_slot in (3, 4)),
  created_by             uuid references public.profiles on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index matches_status_played_on_idx
  on public.matches (status, played_on desc nulls last);

-- match_players: participants and the AZERTY numkey mapping.
create table public.match_players (
  match_id  uuid not null references public.matches on delete cascade,
  player_id uuid not null references public.players on delete restrict,
  slot      smallint not null check (slot between 1 and 4),
  side      smallint generated always as
              (case when slot <= 2 then 1 else 2 end) stored,
  primary key (match_id, player_id),
  unique (match_id, slot)
);

-- rallies: the event log. The only truth.
create table public.rallies (
  id                  uuid primary key default gen_random_uuid(),
  match_id            uuid not null references public.matches on delete cascade,
  idx                 int not null check (idx >= 0),
  winner_side         smallint check (winner_side in (1, 2)),
  is_let              boolean not null default false,
  is_highlight        boolean not null default false,
  scored_by_player_id uuid references public.players on delete set null,
  ended_at_seconds    numeric not null check (ended_at_seconds >= 0),
  created_at          timestamptz not null default now(),
  constraint rallies_let_has_no_winner check (
    (is_let and winner_side is null) or (not is_let and winner_side is not null)
  ),
  -- Deferrable because inserting a missed rally mid-match renumbers every
  -- later rally, passing through transiently duplicate idx values.
  constraint rallies_match_idx_unique unique (match_id, idx)
    deferrable initially deferred
);

create index rallies_match_idx on public.rallies (match_id, idx);

-- match_game_starts: doubles-only overrides for games 2 and 3.
create table public.match_game_starts (
  match_id               uuid not null references public.matches on delete cascade,
  game_number            smallint not null check (game_number between 1 and 5),
  server_slot            smallint check (server_slot between 1 and 4),
  side1_right_court_slot smallint check (side1_right_court_slot in (1, 2)),
  side2_right_court_slot smallint check (side2_right_court_slot in (3, 4)),
  primary key (match_id, game_number)
);
```

- [ ] **Step 5: Push the migration**

```bash
pnpm db:push
```

Expected: `Finished supabase db push.` If it reports no linked project, the prerequisite step was skipped.

- [ ] **Step 6: Generate TypeScript types**

```bash
pnpm db:types
```

Expected: `app/types/database.types.ts` now exports `Database` with all six tables.

- [ ] **Step 7: Verify**

Run: `pnpm dev`
Expected: server boots with no `@nuxt/supabase` warning about a missing database types file (it warned about exactly this path at scaffold time).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Supabase schema migration and generated types"
```

---

### Task 3: Row-level security

**Files:**
- Create: `supabase/migrations/0002_rls.sql`

**Interfaces:**
- Consumes: tables from Task 2
- Produces: SQL function `public.is_admin() → boolean`, usable from later policies and RPCs.

- [ ] **Step 1: Write the RLS migration**

`supabase/migrations/0002_rls.sql`:

```sql
-- security definer so policies on profiles cannot recurse into themselves
create function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- helper: is this match visible to the caller?
create function public.match_is_visible(p_match_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.matches m
    where m.id = p_match_id
      and (m.status = 'published' or public.is_admin())
  );
$$;

alter table public.profiles          enable row level security;
alter table public.players           enable row level security;
alter table public.matches           enable row level security;
alter table public.match_players     enable row level security;
alter table public.rallies           enable row level security;
alter table public.match_game_starts enable row level security;

-- profiles: read your own row only. No insert/update/delete policies at all,
-- deliberately: an UPDATE policy on your own row would let any guest promote
-- themselves to admin. Roles are changed by SQL only; the trigger inserts.
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

-- players: world-readable (they are referenced by published matches).
create policy players_select_all on public.players
  for select using (true);
create policy players_admin_write on public.players
  for all using (public.is_admin()) with check (public.is_admin());

-- matches: published are public; drafts are admin-only.
create policy matches_select_visible on public.matches
  for select using (status = 'published' or public.is_admin());
create policy matches_admin_write on public.matches
  for all using (public.is_admin()) with check (public.is_admin());

-- child tables inherit their parent match's visibility.
create policy match_players_select on public.match_players
  for select using (public.match_is_visible(match_id));
create policy match_players_admin_write on public.match_players
  for all using (public.is_admin()) with check (public.is_admin());

create policy rallies_select on public.rallies
  for select using (public.match_is_visible(match_id));
create policy rallies_admin_write on public.rallies
  for all using (public.is_admin()) with check (public.is_admin());

create policy game_starts_select on public.match_game_starts
  for select using (public.match_is_visible(match_id));
create policy game_starts_admin_write on public.match_game_starts
  for all using (public.is_admin()) with check (public.is_admin());
```

- [ ] **Step 2: Push**

```bash
pnpm db:push
```

- [ ] **Step 3: Create the admin user and promote them**

Ask the user to create their account in the Supabase dashboard under Authentication → Users → Add user (email + password, "Auto Confirm User" checked). Then run in the dashboard SQL editor:

```sql
update public.profiles set role = 'admin' where id = '<the-new-user-uuid>';
```

- [ ] **Step 4: Verify anonymous access is locked down**

In the Supabase dashboard SQL editor, run:

```sql
set role anon;
select count(*) from public.matches;   -- expect 0 rows, no error
select count(*) from public.profiles;  -- expect 0 rows, no error
reset role;
```

Expected: both return `0` without error. An error here means a policy is malformed; zero rows means RLS is filtering correctly.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add row-level security policies"
```

---

### Task 4: Engine domain types and rule predicates

**Files:**
- Create: `shared/badminton/types.ts`, `shared/badminton/rules.ts`

**Interfaces:**
- Consumes: nothing
- Produces: types `Side`, `Slot`, `Court`, `MatchFormat`, `ScoringRules`, `GameStartOverride`, `MatchConfig`, `RallyInput`, `RallyState`, `GameState`, `Warning`, `WarningCode`, `DerivedMatch`; functions `isGameOver(a, b, rules)`, `wouldEndGame(score, side, rules)`, `gamesNeeded(rules)`, `partnerSlot(slot)`, `sideOfSlot(slot)`, `singlesSlot(side)`, `otherSide(side)`; constant `DEFAULT_RULES`.

- [ ] **Step 1: Write the types**

`shared/badminton/types.ts`:

```ts
export type Side = 1 | 2
export type Slot = 1 | 2 | 3 | 4
export type Court = 'right' | 'left'
export type MatchFormat = 'singles' | 'doubles'

export interface ScoringRules {
  bestOf: number
  pointsToWin: number
  winBy: number
  pointsCap: number
}

export interface GameStartOverride {
  gameNumber: number
  serverSlot: Slot | null
  side1RightCourtSlot: Slot | null
  side2RightCourtSlot: Slot | null
}

export interface MatchConfig {
  format: MatchFormat
  rules: ScoringRules
  initialServerSide: Side | null
  /** doubles only: which of slots 1|2 starts in the right service court */
  side1RightCourtSlot: Slot | null
  /** doubles only: which of slots 3|4 starts in the right service court */
  side2RightCourtSlot: Slot | null
  gameStarts: GameStartOverride[]
}

export interface RallyInput {
  idx: number
  winnerSide: Side | null
  isLet: boolean
  isHighlight: boolean
  scoredByPlayerId: string | null
  /** video time, in seconds, at which this point ENDED */
  endedAtSeconds: number
}

export type WarningCode =
  | 'missing_initial_server'
  | 'rallies_after_match_complete'
  | 'final_game_incomplete'
  | 'ambiguous_game_start'

export interface Warning {
  code: WarningCode
  message: string
  rallyIdx?: number
  gameNumber?: number
}

export interface RallyState {
  idx: number
  gameNumber: number
  scoreBefore: [number, number]
  scoreAfter: [number, number]
  servingSide: Side
  servingSlot: Slot
  receivingSlot: Slot
  serviceCourt: Court
  /** previous rally's end; points are contiguous */
  startsAtSeconds: number
  endsAtSeconds: number
  isGamePoint: boolean
  isMatchPoint: boolean
  endedGame: boolean
  endedMatch: boolean
  isLet: boolean
  isHighlight: boolean
  scoredByPlayerId: string | null
}

export interface GameState {
  number: number
  score: [number, number]
  winnerSide: Side | null
  firstRallyIdx: number | null
  lastRallyIdx: number | null
  complete: boolean
}

export interface DerivedMatch {
  rallyStates: RallyState[]
  games: GameState[]
  gamesWon: [number, number]
  matchWinnerSide: Side | null
  complete: boolean
  warnings: Warning[]
}
```

- [ ] **Step 2: Write the rule predicates**

`shared/badminton/rules.ts`:

```ts
import type { ScoringRules, Side, Slot } from './types'

export const DEFAULT_RULES: ScoringRules = {
  bestOf: 3,
  pointsToWin: 21,
  winBy: 2,
  pointsCap: 30,
}

/** A game is over at pointsToWin with a winBy margin, or immediately at the cap. */
export function isGameOver(a: number, b: number, rules: ScoringRules): boolean {
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  if (hi >= rules.pointsCap) return true
  return hi >= rules.pointsToWin && hi - lo >= rules.winBy
}

/** Would giving `side` one more point end the game? */
export function wouldEndGame(
  score: [number, number],
  side: Side,
  rules: ScoringRules,
): boolean {
  const next: [number, number] = [score[0], score[1]]
  next[side - 1] += 1
  return isGameOver(next[0], next[1], rules)
}

export function gamesNeeded(rules: ScoringRules): number {
  return Math.floor(rules.bestOf / 2) + 1
}

export function otherSide(side: Side): Side {
  return side === 1 ? 2 : 1
}

export function sideOfSlot(slot: Slot): Side {
  return slot <= 2 ? 1 : 2
}

export function partnerSlot(slot: Slot): Slot {
  if (slot === 1) return 2
  if (slot === 2) return 1
  if (slot === 3) return 4
  return 3
}

/** In singles only slots 1 and 3 are used. */
export function singlesSlot(side: Side): Slot {
  return side === 1 ? 1 : 3
}
```

- [ ] **Step 3: Verify it typechecks**

Run: `pnpm exec nuxt typecheck` (if it reports that `vue-tsc` is missing, run `pnpm add -D vue-tsc typescript` first, then re-run)
Expected: no errors in `shared/badminton/`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add badminton domain types and rule predicates"
```

---

### Task 5: The deriveMatch engine

**Files:**
- Create: `shared/badminton/derive.ts`, `shared/badminton/index.ts`
- Create: `scripts/derive-sanity.ts`

**Interfaces:**
- Consumes: everything from Task 4
- Produces: `deriveMatch(config: MatchConfig, rallies: RallyInput[]): DerivedMatch`, re-exported from `shared/badminton/index.ts` alongside all types and rule helpers.

- [ ] **Step 1: Write the engine**

`shared/badminton/derive.ts`:

```ts
import type {
  Court,
  DerivedMatch,
  GameState,
  MatchConfig,
  RallyInput,
  RallyState,
  Side,
  Slot,
  Warning,
} from './types'
import {
  gamesNeeded,
  isGameOver,
  otherSide,
  partnerSlot,
  sideOfSlot,
  singlesSlot,
  wouldEndGame,
} from './rules'

interface Positions {
  right: Slot
  left: Slot
}

function positionsFromRight(rightSlot: Slot): Positions {
  return { right: rightSlot, left: partnerSlot(rightSlot) }
}

/**
 * Derives the complete state of a match from its rally log.
 *
 * The single invariant behind doubles service rotation: the serving side's two
 * players swap courts when that side wins a rally; nobody else ever moves. The
 * server is then whichever of them stands in the court the score's parity
 * requires (even -> right, odd -> left).
 *
 * Never throws. Malformed input produces entries in `warnings`.
 */
export function deriveMatch(
  config: MatchConfig,
  rallies: RallyInput[],
): DerivedMatch {
  const warnings: Warning[] = []
  const rules = config.rules
  const needed = gamesNeeded(rules)
  const isDoubles = config.format === 'doubles'

  let servingSide: Side
  if (config.initialServerSide === 1 || config.initialServerSide === 2) {
    servingSide = config.initialServerSide
  } else {
    servingSide = 1
    warnings.push({
      code: 'missing_initial_server',
      message: 'No initial server recorded; assuming side 1 served first.',
    })
  }

  const baseline: Record<Side, Positions> = {
    1: positionsFromRight((config.side1RightCourtSlot ?? 1) as Slot),
    2: positionsFromRight((config.side2RightCourtSlot ?? 3) as Slot),
  }
  let positions: Record<Side, Positions> = {
    1: { ...baseline[1] },
    2: { ...baseline[2] },
  }

  const rallyStates: RallyState[] = []
  const games: GameState[] = []

  let gameNumber = 1
  let score: [number, number] = [0, 0]
  const gamesWon: [number, number] = [0, 0]
  let matchWinnerSide: Side | null = null
  let complete = false
  let firstRallyIdx: number | null = null
  let lastRallyIdx: number | null = null
  let warnedOverflow = false
  let prevEnd = 0

  const ordered = [...rallies].sort((a, b) => a.idx - b.idx)

  for (const rally of ordered) {
    const startsAtSeconds = prevEnd
    prevEnd = rally.endedAtSeconds

    const serviceCourt: Court = score[servingSide - 1] % 2 === 0 ? 'right' : 'left'
    const receivingSide = otherSide(servingSide)
    const servingSlot: Slot = isDoubles
      ? positions[servingSide][serviceCourt]
      : singlesSlot(servingSide)
    const receivingSlot: Slot = isDoubles
      ? positions[receivingSide][serviceCourt]
      : singlesSlot(receivingSide)

    const scoreBefore: [number, number] = [score[0], score[1]]

    // Rallies logged after the match was already decided: record them frozen
    // rather than inventing a score, and warn once.
    if (complete) {
      if (!warnedOverflow) {
        warnings.push({
          code: 'rallies_after_match_complete',
          message: 'Rallies were logged after the match was already won.',
          rallyIdx: rally.idx,
        })
        warnedOverflow = true
      }
      rallyStates.push({
        idx: rally.idx,
        gameNumber,
        scoreBefore,
        scoreAfter: scoreBefore,
        servingSide,
        servingSlot,
        receivingSlot,
        serviceCourt,
        startsAtSeconds,
        endsAtSeconds: rally.endedAtSeconds,
        isGamePoint: false,
        isMatchPoint: false,
        endedGame: false,
        endedMatch: false,
        isLet: rally.isLet,
        isHighlight: rally.isHighlight,
        scoredByPlayerId: rally.scoredByPlayerId,
      })
      continue
    }

    const gp1 = wouldEndGame(scoreBefore, 1, rules)
    const gp2 = wouldEndGame(scoreBefore, 2, rules)
    const isMatchPoint =
      (gp1 && gamesWon[0] + 1 >= needed) || (gp2 && gamesWon[1] + 1 >= needed)

    if (firstRallyIdx === null) firstRallyIdx = rally.idx
    lastRallyIdx = rally.idx

    let endedGame = false
    let endedMatch = false

    if (!rally.isLet && rally.winnerSide) {
      const winner = rally.winnerSide
      score[winner - 1] += 1

      // Only the serving side rotates, and only when it wins.
      if (isDoubles && winner === servingSide) {
        const p = positions[winner]
        positions[winner] = { right: p.left, left: p.right }
      }
      servingSide = winner

      if (isGameOver(score[0], score[1], rules)) {
        endedGame = true
        gamesWon[winner - 1] += 1
        games.push({
          number: gameNumber,
          score: [score[0], score[1]],
          winnerSide: winner,
          firstRallyIdx,
          lastRallyIdx,
          complete: true,
        })

        if (gamesWon[winner - 1] >= needed) {
          endedMatch = true
          complete = true
          matchWinnerSide = winner
        }
      }
    }

    rallyStates.push({
      idx: rally.idx,
      gameNumber,
      scoreBefore,
      scoreAfter: [score[0], score[1]],
      servingSide,
      servingSlot,
      receivingSlot,
      serviceCourt,
      startsAtSeconds,
      endsAtSeconds: rally.endedAtSeconds,
      isGamePoint: gp1 || gp2,
      isMatchPoint,
      endedGame,
      endedMatch,
      isLet: rally.isLet,
      isHighlight: rally.isHighlight,
      scoredByPlayerId: rally.scoredByPlayerId,
    })

    // Open the next game.
    if (endedGame && !complete) {
      gameNumber += 1
      score = [0, 0]
      firstRallyIdx = null
      lastRallyIdx = null
      // servingSide already equals the previous game's winner, which is correct.

      if (isDoubles) {
        const override = config.gameStarts.find(g => g.gameNumber === gameNumber)
        if (override?.side1RightCourtSlot && override?.side2RightCourtSlot) {
          positions = {
            1: positionsFromRight(override.side1RightCourtSlot),
            2: positionsFromRight(override.side2RightCourtSlot),
          }
        } else {
          positions = { 1: { ...baseline[1] }, 2: { ...baseline[2] } }
          warnings.push({
            code: 'ambiguous_game_start',
            message:
              `Game ${gameNumber}: which partner serves first is a choice made on ` +
              `the day and cannot be derived. Reusing game 1's arrangement.`,
            gameNumber,
          })
        }
        // At 0-0 the score is even, so the right-court player serves. Forcing
        // the chosen slot into the right court makes it serve first.
        if (override?.serverSlot) {
          const side = sideOfSlot(override.serverSlot)
          positions[side] = positionsFromRight(override.serverSlot)
        }
      }
    }
  }

  // A game still in progress at the end of the log.
  if (!complete && rallyStates.length > 0) {
    games.push({
      number: gameNumber,
      score: [score[0], score[1]],
      winnerSide: null,
      firstRallyIdx,
      lastRallyIdx,
      complete: false,
    })
    warnings.push({
      code: 'final_game_incomplete',
      message: `Game ${gameNumber} has no winner yet (${score[0]}-${score[1]}).`,
      gameNumber,
    })
  }

  return {
    rallyStates,
    games,
    gamesWon: [gamesWon[0], gamesWon[1]],
    matchWinnerSide,
    complete,
    warnings,
  }
}
```

- [ ] **Step 2: Write the barrel export**

`shared/badminton/index.ts`:

```ts
export * from './types'
export * from './rules'
export * from './derive'
```

- [ ] **Step 3: Write the sanity script**

This is an eyeball check, not a test — it prints, it does not assert.

`scripts/derive-sanity.ts`:

```ts
import { deriveMatch } from '../shared/badminton/derive.ts'
import { DEFAULT_RULES } from '../shared/badminton/rules.ts'
import type { MatchConfig, RallyInput, Side } from '../shared/badminton/types.ts'

/** Builds a rally log from a string like "AAZAZZ" (A = side 1, Z = side 2). */
function log(pattern: string): RallyInput[] {
  return [...pattern].map((c, i) => ({
    idx: i,
    winnerSide: (c === 'A' ? 1 : 2) as Side,
    isLet: false,
    isHighlight: false,
    scoredByPlayerId: null,
    endedAtSeconds: (i + 1) * 30,
  }))
}

const doublesConfig: MatchConfig = {
  format: 'doubles',
  rules: DEFAULT_RULES,
  initialServerSide: 1,
  side1RightCourtSlot: 1,
  side2RightCourtSlot: 3,
  gameStarts: [],
}

// Side 1 wins 21-0: a clean sweep, so side 1 serves throughout and its two
// players must alternate courts on every point.
const sweep = deriveMatch(doublesConfig, log('A'.repeat(21)))
console.log('--- doubles 21-0 sweep ---')
console.log('final:', sweep.games[0]?.score, 'winner side:', sweep.matchWinnerSide)
console.log(
  'serving slot per rally:',
  sweep.rallyStates.map(r => r.servingSlot).join(''),
)
console.log(
  'service court per rally:',
  sweep.rallyStates.map(r => r.serviceCourt[0]).join(''),
)

// Alternating points: service passes every rally, nobody ever rotates.
const alternating = deriveMatch(doublesConfig, log('AZ'.repeat(10)))
console.log('\n--- doubles alternating ---')
console.log(
  'serving slot per rally:',
  alternating.rallyStates.map(r => r.servingSlot).join(''),
)

// Singles to the cap.
const singlesConfig: MatchConfig = { ...doublesConfig, format: 'singles' }
const marathon = deriveMatch(singlesConfig, log('AZ'.repeat(29) + 'AA'))
console.log('\n--- singles marathon ---')
console.log('games:', marathon.games.map(g => g.score.join('-')).join(', '))
console.log('warnings:', marathon.warnings.map(w => w.code).join(', ') || 'none')
```

- [ ] **Step 4: Run the sanity script and read the output**

Run: `node scripts/derive-sanity.ts`

Expected, and check each line by hand:
- **21-0 sweep:** final `[21, 0]`, winner side `1`. Serving slot alternates `121212…` — the same *side* keeps serving, and its two players swap courts on every won rally. Service court alternates `rlrlrl…` — even score serves right, odd serves left.
- **Alternating:** serving slot reads `1313…`. Service passes on every rally and nobody rotates, so each side keeps serving from its right-court player at score 0, then its left at 1, and so on.
- **Singles marathon:** the game reaches the 30-point cap and stops there rather than running on.

If serving slots do not alternate in the sweep, the rotation swap is on the wrong branch — it must fire only when the winner *is* the serving side.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add deriveMatch scoring engine"
```

---

### Task 6: Auth, profile composable, admin guard

**Files:**
- Create: `app/pages/login.vue`, `app/middleware/admin.ts`, `app/composables/useCurrentProfile.ts`, `app/layouts/admin.vue`, `app/pages/admin/index.vue`

**Interfaces:**
- Consumes: `profiles` table, `is_admin()` from Task 3
- Produces: `useCurrentProfile()` returning `{ profile, isAdmin, pending, refresh }`; a named route middleware `admin` usable via `definePageMeta({ middleware: 'admin', layout: 'admin' })`.

- [ ] **Step 1: Write the profile composable**

`app/composables/useCurrentProfile.ts`:

```ts
import type { Database } from '~/types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

export function useCurrentProfile() {
  const user = useSupabaseUser()
  const client = useSupabaseClient<Database>()

  const profile = useState<Profile | null>('current-profile', () => null)
  const pending = useState<boolean>('current-profile-pending', () => false)

  async function refresh() {
    if (!user.value) {
      profile.value = null
      return
    }
    pending.value = true
    const { data } = await client
      .from('profiles')
      .select('*')
      .eq('id', user.value.id)
      .maybeSingle()
    profile.value = data ?? null
    pending.value = false
  }

  const isAdmin = computed(() => profile.value?.role === 'admin')

  return { profile, isAdmin, pending, refresh }
}
```

- [ ] **Step 2: Write the admin middleware**

`app/middleware/admin.ts`:

```ts
export default defineNuxtRouteMiddleware(async (to) => {
  const user = useSupabaseUser()
  if (!user.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }

  const { profile, isAdmin, refresh } = useCurrentProfile()
  if (!profile.value) await refresh()

  if (!isAdmin.value) {
    return navigateTo('/')
  }
})
```

- [ ] **Step 3: Write the login page**

`app/pages/login.vue`:

```vue
<script setup lang="ts">
const client = useSupabaseClient()
const route = useRoute()

const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

async function submit() {
  busy.value = true
  error.value = null
  const { error: authError } = await client.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  })
  busy.value = false
  if (authError) {
    error.value = authError.message
    return
  }
  const { refresh } = useCurrentProfile()
  await refresh()
  await navigateTo((route.query.redirect as string) || '/admin')
}
</script>

<template>
  <div class="mx-auto max-w-sm">
    <h1 class="text-2xl font-bold">Sign in</h1>
    <form class="mt-6 space-y-4" @submit.prevent="submit">
      <input
        v-model="email"
        type="email"
        required
        placeholder="Email"
        class="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
      >
      <input
        v-model="password"
        type="password"
        required
        placeholder="Password"
        class="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
      >
      <p v-if="error" class="text-sm text-red-400">{{ error }}</p>
      <button
        type="submit"
        :disabled="busy"
        class="w-full rounded bg-emerald-600 px-3 py-2 font-medium disabled:opacity-50"
      >
        {{ busy ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>
  </div>
</template>
```

- [ ] **Step 4: Write the admin layout**

`app/layouts/admin.vue`:

```vue
<script setup lang="ts">
const client = useSupabaseClient()
const { profile } = useCurrentProfile()

async function signOut() {
  await client.auth.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <header class="border-b border-slate-800">
      <nav class="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 text-sm">
        <NuxtLink to="/admin" class="font-semibold">Admin</NuxtLink>
        <NuxtLink to="/admin/matches/new" class="text-slate-400 hover:text-slate-100">
          New match
        </NuxtLink>
        <NuxtLink to="/admin/players" class="text-slate-400 hover:text-slate-100">
          Players
        </NuxtLink>
        <span class="ml-auto text-slate-500">{{ profile?.display_name }}</span>
        <button class="text-slate-400 hover:text-slate-100" @click="signOut">
          Sign out
        </button>
      </nav>
    </header>
    <main class="mx-auto max-w-6xl px-4 py-6">
      <slot />
    </main>
  </div>
</template>
```

- [ ] **Step 5: Write the admin dashboard**

`app/pages/admin/index.vue`:

```vue
<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ middleware: 'admin', layout: 'admin' })

const client = useSupabaseClient<Database>()
const { data: matches } = await useAsyncData('admin-matches', async () => {
  const { data } = await client
    .from('matches')
    .select('id, title, played_on, format, status')
    .order('played_on', { ascending: false, nullsFirst: false })
  return data ?? []
})
</script>

<template>
  <h1 class="text-2xl font-bold">Matches</h1>
  <ul class="mt-6 divide-y divide-slate-800">
    <li v-for="m in matches" :key="m.id" class="flex items-center gap-4 py-3">
      <span
        class="rounded px-2 py-0.5 text-xs"
        :class="m.status === 'published' ? 'bg-emerald-900 text-emerald-300' : 'bg-slate-800 text-slate-400'"
      >{{ m.status }}</span>
      <NuxtLink :to="`/admin/matches/${m.id}`" class="font-medium hover:underline">
        {{ m.title }}
      </NuxtLink>
      <span class="text-sm text-slate-500">{{ m.played_on }} · {{ m.format }}</span>
      <NuxtLink
        :to="`/admin/matches/${m.id}/tag`"
        class="ml-auto rounded bg-slate-800 px-3 py-1 text-sm hover:bg-slate-700"
      >
        Tag
      </NuxtLink>
    </li>
  </ul>
  <p v-if="!matches?.length" class="mt-6 text-slate-400">No matches yet.</p>
</template>
```

- [ ] **Step 6: Verify**

Run: `pnpm dev`
1. Visit `/admin` while signed out → redirected to `/login?redirect=%2Fadmin`.
2. Sign in with the admin account from Task 3 → lands on `/admin`, header shows the display name, "No matches yet."
3. Sign out → visiting `/admin` redirects to login again.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add admin auth, profile composable and route guard"
```

---

### Task 7: Player roster CRUD

**Files:**
- Create: `app/pages/admin/players/index.vue`

**Interfaces:**
- Consumes: `players` table, `admin` middleware
- Produces: nothing consumed by later tasks beyond rows in `players`.

- [ ] **Step 1: Write the roster page**

`app/pages/admin/players/index.vue`:

```vue
<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ middleware: 'admin', layout: 'admin' })

type PlayerInsert = Database['public']['Tables']['players']['Insert']

const client = useSupabaseClient<Database>()

const { data: players, refresh } = await useAsyncData('players', async () => {
  const { data } = await client.from('players').select('*').order('last_name')
  return data ?? []
})

const blank = (): PlayerInsert => ({
  first_name: '',
  last_name: '',
  club: '',
  birth_year: null,
  rank_singles: '',
  rank_doubles: '',
  rank_mixed: '',
  ffbad_license: '',
  notes: '',
})

const form = ref<PlayerInsert>(blank())
const editingId = ref<string | null>(null)
const error = ref<string | null>(null)

function edit(p: Database['public']['Tables']['players']['Row']) {
  editingId.value = p.id
  form.value = { ...p }
}

function cancel() {
  editingId.value = null
  form.value = blank()
}

async function save() {
  error.value = null
  const payload = { ...form.value }
  const { error: dbError } = editingId.value
    ? await client.from('players').update(payload).eq('id', editingId.value)
    : await client.from('players').insert(payload)
  if (dbError) {
    error.value = dbError.message
    return
  }
  cancel()
  await refresh()
}

async function remove(id: string) {
  const { error: dbError } = await client.from('players').delete().eq('id', id)
  // A player referenced by a match is blocked by the FK; surface that plainly.
  if (dbError) {
    error.value = `${dbError.message} — this player is used by a match.`
    return
  }
  await refresh()
}

function age(birthYear: number | null) {
  return birthYear ? new Date().getFullYear() - birthYear : '—'
}
</script>

<template>
  <h1 class="text-2xl font-bold">Players</h1>

  <form class="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4" @submit.prevent="save">
    <input v-model="form.first_name" required placeholder="First name" class="rounded border border-slate-700 bg-slate-900 px-3 py-2">
    <input v-model="form.last_name" required placeholder="Last name" class="rounded border border-slate-700 bg-slate-900 px-3 py-2">
    <input v-model="form.club" placeholder="Club" class="rounded border border-slate-700 bg-slate-900 px-3 py-2">
    <input v-model.number="form.birth_year" type="number" placeholder="Birth year" class="rounded border border-slate-700 bg-slate-900 px-3 py-2">
    <input v-model="form.rank_singles" placeholder="Rank S (D9…)" class="rounded border border-slate-700 bg-slate-900 px-3 py-2">
    <input v-model="form.rank_doubles" placeholder="Rank D" class="rounded border border-slate-700 bg-slate-900 px-3 py-2">
    <input v-model="form.rank_mixed" placeholder="Rank Mx" class="rounded border border-slate-700 bg-slate-900 px-3 py-2">
    <input v-model="form.ffbad_license" placeholder="FFBad licence" class="rounded border border-slate-700 bg-slate-900 px-3 py-2">
    <div class="col-span-2 flex gap-2 md:col-span-4">
      <button type="submit" class="rounded bg-emerald-600 px-4 py-2 font-medium">
        {{ editingId ? 'Save changes' : 'Add player' }}
      </button>
      <button v-if="editingId" type="button" class="rounded bg-slate-800 px-4 py-2" @click="cancel">
        Cancel
      </button>
    </div>
  </form>

  <p v-if="error" class="mt-3 text-sm text-red-400">{{ error }}</p>

  <table class="mt-8 w-full text-left text-sm">
    <thead class="text-slate-400">
      <tr>
        <th class="py-2">Name</th><th>Club</th><th>Age</th><th>S / D / Mx</th><th></th>
      </tr>
    </thead>
    <tbody class="divide-y divide-slate-800">
      <tr v-for="p in players" :key="p.id">
        <td class="py-2 font-medium">{{ p.first_name }} {{ p.last_name }}</td>
        <td class="text-slate-400">{{ p.club || '—' }}</td>
        <td class="text-slate-400">{{ age(p.birth_year) }}</td>
        <td class="text-slate-400">
          {{ p.rank_singles || '—' }} / {{ p.rank_doubles || '—' }} / {{ p.rank_mixed || '—' }}
        </td>
        <td class="text-right">
          <button class="text-slate-400 hover:text-slate-100" @click="edit(p)">Edit</button>
          <button class="ml-3 text-red-400 hover:text-red-300" @click="remove(p.id)">Delete</button>
        </td>
      </tr>
    </tbody>
  </table>
</template>
```

- [ ] **Step 2: Verify**

Run: `pnpm dev`, go to `/admin/players`
1. Add a player with a birth year → row appears, Age column shows the derived age (not the year).
2. Click Edit, change the club, Save changes → the row updates and the form clears.
3. Delete the player → the row disappears.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add player roster CRUD"
```

---

### Task 8: Match CRUD with participants and serve configuration

**Files:**
- Create: `app/components/match/PlayerPicker.vue`, `app/components/match/MatchForm.vue`
- Create: `app/pages/admin/matches/new.vue`, `app/pages/admin/matches/[id]/index.vue`

**Interfaces:**
- Consumes: `players`, `matches`, `match_players`, `match_game_starts`
- Produces: `<MatchForm :match-id="string | null" />`, which handles both create and edit and emits nothing; it navigates on save. `<PlayerPicker v-model="slotMap" :format="MatchFormat" />` where `slotMap` is `Record<1|2|3|4, string | null>` of player ids.

- [ ] **Step 1: Write the player picker**

`app/components/match/PlayerPicker.vue`:

```vue
<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { MatchFormat, Slot } from '~~/shared/badminton'

type Player = Database['public']['Tables']['players']['Row']

const props = defineProps<{
  modelValue: Record<number, string | null>
  format: MatchFormat
  players: Player[]
}>()
const emit = defineEmits<{ 'update:modelValue': [Record<number, string | null>] }>()

const slots = computed<Slot[]>(() =>
  props.format === 'singles' ? [1, 3] : [1, 2, 3, 4],
)

const labels: Record<number, string> = {
  1: 'Slot 1 (&) — your side',
  2: 'Slot 2 (é) — your side',
  3: 'Slot 3 (") — opponents',
  4: "Slot 4 (') — opponents",
}

function set(slot: number, value: string) {
  emit('update:modelValue', { ...props.modelValue, [slot]: value || null })
}
</script>

<template>
  <div class="grid gap-3 md:grid-cols-2">
    <label v-for="slot in slots" :key="slot" class="block">
      <span class="text-sm text-slate-400">{{ labels[slot] }}</span>
      <select
        :value="modelValue[slot] ?? ''"
        class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
        @change="set(slot, ($event.target as HTMLSelectElement).value)"
      >
        <option value="">—</option>
        <option v-for="p in players" :key="p.id" :value="p.id">
          {{ p.first_name }} {{ p.last_name }}
        </option>
      </select>
    </label>
  </div>
</template>
```

- [ ] **Step 2: Write the match form**

`app/components/match/MatchForm.vue`:

```vue
<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { MatchFormat } from '~~/shared/badminton'

const props = defineProps<{ matchId: string | null }>()

const client = useSupabaseClient<Database>()
const user = useSupabaseUser()

const { data: players } = await useAsyncData('picker-players', async () => {
  const { data } = await client.from('players').select('*').order('last_name')
  return data ?? []
})

const form = reactive({
  title: '',
  played_on: '' as string | null,
  venue: '',
  format: 'doubles' as MatchFormat,
  youtube_video_id: '',
  status: 'draft' as 'draft' | 'published',
  best_of: 3,
  points_to_win: 21,
  win_by: 2,
  points_cap: 30,
  initial_server_side: 1 as 1 | 2,
  side1_right_court_slot: 1 as 1 | 2,
  side2_right_court_slot: 3 as 3 | 4,
})

const slotMap = ref<Record<number, string | null>>({ 1: null, 2: null, 3: null, 4: null })
const error = ref<string | null>(null)
const busy = ref(false)

if (props.matchId) {
  const { data: match } = await client
    .from('matches').select('*').eq('id', props.matchId).single()
  if (match) Object.assign(form, match)

  const { data: mp } = await client
    .from('match_players').select('slot, player_id').eq('match_id', props.matchId)
  for (const row of mp ?? []) slotMap.value[row.slot] = row.player_id
}

async function save() {
  busy.value = true
  error.value = null

  const payload = { ...form, created_by: user.value?.id ?? null }
  if (!payload.played_on) payload.played_on = null

  const { data: saved, error: dbError } = props.matchId
    ? await client.from('matches').update(payload).eq('id', props.matchId).select('id').single()
    : await client.from('matches').insert(payload).select('id').single()

  if (dbError || !saved) {
    busy.value = false
    error.value = dbError?.message ?? 'Save failed'
    return
  }

  // Participants: replace wholesale, it is at most four rows.
  await client.from('match_players').delete().eq('match_id', saved.id)
  const rows = Object.entries(slotMap.value)
    .filter(([, playerId]) => Boolean(playerId))
    .map(([slot, playerId]) => ({
      match_id: saved.id,
      slot: Number(slot),
      player_id: playerId as string,
    }))
  if (rows.length) await client.from('match_players').insert(rows)

  busy.value = false
  await navigateTo(`/admin/matches/${saved.id}`)
}
</script>

<template>
  <form class="space-y-6" @submit.prevent="save">
    <div class="grid gap-3 md:grid-cols-2">
      <input v-model="form.title" required placeholder="Title" class="rounded border border-slate-700 bg-slate-900 px-3 py-2">
      <input v-model="form.played_on" type="date" class="rounded border border-slate-700 bg-slate-900 px-3 py-2">
      <input v-model="form.venue" placeholder="Venue" class="rounded border border-slate-700 bg-slate-900 px-3 py-2">
      <input v-model="form.youtube_video_id" placeholder="YouTube video ID (e.g. dQw4w9WgXcQ)" class="rounded border border-slate-700 bg-slate-900 px-3 py-2">
      <select v-model="form.format" class="rounded border border-slate-700 bg-slate-900 px-3 py-2">
        <option value="singles">Singles</option>
        <option value="doubles">Doubles</option>
      </select>
      <select v-model="form.status" class="rounded border border-slate-700 bg-slate-900 px-3 py-2">
        <option value="draft">Draft</option>
        <option value="published">Published</option>
      </select>
    </div>

    <fieldset>
      <legend class="text-sm font-semibold text-slate-300">Players</legend>
      <PlayerPicker v-model="slotMap" :format="form.format" :players="players ?? []" class="mt-2" />
    </fieldset>

    <fieldset>
      <legend class="text-sm font-semibold text-slate-300">Scoring</legend>
      <div class="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
        <label class="text-sm text-slate-400">Best of
          <input v-model.number="form.best_of" type="number" class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"></label>
        <label class="text-sm text-slate-400">Points to win
          <input v-model.number="form.points_to_win" type="number" class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"></label>
        <label class="text-sm text-slate-400">Win by
          <input v-model.number="form.win_by" type="number" class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"></label>
        <label class="text-sm text-slate-400">Cap
          <input v-model.number="form.points_cap" type="number" class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"></label>
      </div>
    </fieldset>

    <fieldset>
      <legend class="text-sm font-semibold text-slate-300">Opening serve</legend>
      <div class="mt-2 grid gap-3 md:grid-cols-3">
        <label class="text-sm text-slate-400">First server side
          <select v-model.number="form.initial_server_side" class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100">
            <option :value="1">Side 1 (us)</option>
            <option :value="2">Side 2 (them)</option>
          </select></label>
        <template v-if="form.format === 'doubles'">
          <label class="text-sm text-slate-400">Our right-court player
            <select v-model.number="form.side1_right_court_slot" class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100">
              <option :value="1">Slot 1</option>
              <option :value="2">Slot 2</option>
            </select></label>
          <label class="text-sm text-slate-400">Their right-court player
            <select v-model.number="form.side2_right_court_slot" class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100">
              <option :value="3">Slot 3</option>
              <option :value="4">Slot 4</option>
            </select></label>
        </template>
      </div>
    </fieldset>

    <p v-if="error" class="text-sm text-red-400">{{ error }}</p>
    <button type="submit" :disabled="busy" class="rounded bg-emerald-600 px-4 py-2 font-medium disabled:opacity-50">
      {{ busy ? 'Saving…' : 'Save match' }}
    </button>
  </form>
</template>
```

- [ ] **Step 3: Write the two pages**

`app/pages/admin/matches/new.vue`:

```vue
<script setup lang="ts">
definePageMeta({ middleware: 'admin', layout: 'admin' })
</script>

<template>
  <h1 class="text-2xl font-bold">New match</h1>
  <MatchForm :match-id="null" class="mt-6" />
</template>
```

`app/pages/admin/matches/[id]/index.vue`:

```vue
<script setup lang="ts">
definePageMeta({ middleware: 'admin', layout: 'admin' })
const route = useRoute()
const id = route.params.id as string
</script>

<template>
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold">Edit match</h1>
    <NuxtLink :to="`/admin/matches/${id}/tag`" class="rounded bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700">
      Open tagging tool
    </NuxtLink>
  </div>
  <MatchForm :match-id="id" class="mt-6" />
</template>
```

- [ ] **Step 4: Verify**

Run: `pnpm dev`
1. `/admin/matches/new` → fill in a title, pick doubles, assign four players, set the YouTube video ID of a real badminton video, Save → redirected to the edit page with all values populated.
2. Switch format to singles → the picker collapses to slots 1 and 3, and the right-court selects disappear.
3. Reload the edit page → participants and serve config persist.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add match CRUD with participants and serve configuration"
```

---

### Task 9: save_match_rallies RPC

**Files:**
- Create: `supabase/migrations/0003_save_match_rallies.sql`
- Modify: `app/types/database.types.ts` (regenerated)

**Interfaces:**
- Consumes: `rallies` table, `is_admin()`
- Produces: RPC `save_match_rallies(p_match_id uuid, p_rallies jsonb) → void`. The JSON array elements use camelCase keys matching `RallyInput`: `idx`, `winnerSide`, `isLet`, `isHighlight`, `scoredByPlayerId`, `endedAtSeconds`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0003_save_match_rallies.sql`:

```sql
-- Replaces a match's entire rally log in one transaction. Whole-log replacement
-- avoids diffing an array where a mid-list insert renumbers everything after it;
-- the deferrable unique index on (match_id, idx) is what makes that legal.
--
-- security invoker: RLS on public.rallies is the real enforcement. The explicit
-- is_admin() check just turns a silent no-op into a clear error.
create function public.save_match_rallies(p_match_id uuid, p_rallies jsonb)
returns void
language plpgsql
security invoker
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden: admin role required';
  end if;

  if jsonb_typeof(p_rallies) is distinct from 'array' then
    raise exception 'p_rallies must be a JSON array';
  end if;

  delete from public.rallies where match_id = p_match_id;

  insert into public.rallies (
    match_id, idx, winner_side, is_let, is_highlight,
    scored_by_player_id, ended_at_seconds
  )
  select
    p_match_id,
    (r->>'idx')::int,
    nullif(r->>'winnerSide', '')::smallint,
    coalesce((r->>'isLet')::boolean, false),
    coalesce((r->>'isHighlight')::boolean, false),
    nullif(r->>'scoredByPlayerId', '')::uuid,
    (r->>'endedAtSeconds')::numeric
  from jsonb_array_elements(p_rallies) as r;

  update public.matches set updated_at = now() where id = p_match_id;
end;
$$;
```

- [ ] **Step 2: Push and regenerate types**

```bash
pnpm db:push && pnpm db:types
```

- [ ] **Step 3: Verify in the dashboard SQL editor**

Using the ID of the match created in Task 8:

```sql
select public.save_match_rallies(
  '<match-id>'::uuid,
  '[{"idx":0,"winnerSide":1,"isLet":false,"isHighlight":false,
     "scoredByPlayerId":null,"endedAtSeconds":30.5},
    {"idx":1,"winnerSide":2,"isLet":false,"isHighlight":true,
     "scoredByPlayerId":null,"endedAtSeconds":58}]'::jsonb
);
select idx, winner_side, is_highlight, ended_at_seconds
from public.rallies where match_id = '<match-id>' order by idx;
```

Expected: two rows, idx 0 and 1. Run the same `save_match_rallies` call a second time — still exactly two rows, proving replacement rather than accumulation.

Then confirm the type made it into the client:

```bash
grep -c save_match_rallies app/types/database.types.ts
```

Expected: at least 1.

- [ ] **Step 4: Clean up the probe rows**

```sql
delete from public.rallies where match_id = '<match-id>';
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add save_match_rallies transactional RPC"
```

---

### Task 10: YouTube player wrapper with focus-blocking overlay

**Files:**
- Create: `app/types/youtube.d.ts`, `app/composables/useYouTubePlayer.ts`, `app/components/player/YouTubeStage.vue`

**Interfaces:**
- Consumes: nothing
- Produces: `useYouTubePlayer(host: Ref<HTMLElement | null>, videoId: Ref<string | null>)` returning `{ ready, isPlaying, currentTime, duration, getTime(), play(), pause(), toggle(), seekTo(s), seekBy(d) }` where `getTime()` reads the player synchronously and is what the tagger must use for timestamps. `<YouTubeStage :video-id="string | null" />` exposes the same controls via `defineExpose`.

- [ ] **Step 1: Declare the IFrame API types**

`app/types/youtube.d.ts`:

```ts
export {}

declare global {
  namespace YT {
    interface Player {
      playVideo(): void
      pauseVideo(): void
      seekTo(seconds: number, allowSeekAhead: boolean): void
      getCurrentTime(): number
      getDuration(): number
      getPlayerState(): number
      destroy(): void
    }
    interface PlayerEvent { target: Player }
    interface OnStateChangeEvent { target: Player, data: number }
  }

  interface Window {
    YT?: {
      Player: new (el: HTMLElement, options: {
        videoId?: string
        playerVars?: Record<string, string | number>
        events?: {
          onReady?: (e: YT.PlayerEvent) => void
          onStateChange?: (e: YT.OnStateChangeEvent) => void
        }
      }) => YT.Player
      PlayerState: { PLAYING: number, PAUSED: number, ENDED: number }
    }
    onYouTubeIframeAPIReady?: () => void
  }
}
```

- [ ] **Step 2: Write the composable**

`app/composables/useYouTubePlayer.ts`:

```ts
let apiPromise: Promise<void> | null = null

function loadIframeApi(): Promise<void> {
  if (apiPromise) return apiPromise
  apiPromise = new Promise<void>((resolve) => {
    if (window.YT?.Player) {
      resolve()
      return
    }
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve()
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(script)
  })
  return apiPromise
}

export function useYouTubePlayer(
  host: Ref<HTMLElement | null>,
  videoId: Ref<string | null>,
) {
  const player = shallowRef<YT.Player | null>(null)
  const ready = ref(false)
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  let frame = 0

  function tick() {
    const p = player.value
    if (p?.getCurrentTime) currentTime.value = p.getCurrentTime()
    frame = requestAnimationFrame(tick)
  }

  async function mount() {
    if (!import.meta.client || !host.value || !videoId.value) return
    await loadIframeApi()
    if (!window.YT || !host.value) return

    player.value = new window.YT.Player(host.value, {
      videoId: videoId.value,
      playerVars: {
        // controls:0 + disablekb:1 because all playback is driven from our own
        // UI; the overlay stops the iframe from ever taking keyboard focus.
        controls: 0,
        disablekb: 1,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
      },
      events: {
        onReady: (e) => {
          ready.value = true
          duration.value = e.target.getDuration()
          frame = requestAnimationFrame(tick)
        },
        onStateChange: (e) => {
          isPlaying.value = e.data === window.YT?.PlayerState.PLAYING
        },
      },
    })
  }

  onMounted(mount)
  onBeforeUnmount(() => {
    cancelAnimationFrame(frame)
    player.value?.destroy()
    player.value = null
  })

  /** Synchronous read — use this for rally timestamps, not `currentTime`. */
  function getTime(): number {
    return player.value?.getCurrentTime?.() ?? 0
  }

  function play() { player.value?.playVideo() }
  function pause() { player.value?.pauseVideo() }
  function toggle() { isPlaying.value ? pause() : play() }
  function seekTo(seconds: number) {
    player.value?.seekTo(Math.max(0, seconds), true)
  }
  function seekBy(delta: number) { seekTo(getTime() + delta) }

  return { ready, isPlaying, currentTime, duration, getTime, play, pause, toggle, seekTo, seekBy }
}
```

- [ ] **Step 3: Write the stage component**

`app/components/player/YouTubeStage.vue`:

```vue
<script setup lang="ts">
const props = defineProps<{ videoId: string | null }>()

const host = ref<HTMLElement | null>(null)
const videoId = toRef(props, 'videoId')
const api = useYouTubePlayer(host, videoId)

defineExpose(api)

function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
</script>

<template>
  <div>
    <div class="relative aspect-video w-full overflow-hidden rounded bg-black">
      <div ref="host" class="h-full w-full" />
      <!--
        This overlay is the whole reason keyboard tagging works. A focused
        YouTube iframe swallows every keystroke, so we cover it and absorb all
        pointer events; the iframe can then never take focus.
      -->
      <div class="absolute inset-0 cursor-default" @click.prevent />
      <p v-if="!videoId" class="absolute inset-0 grid place-items-center text-slate-500">
        No YouTube video ID set for this match.
      </p>
    </div>

    <div class="mt-2 flex items-center gap-3 text-sm">
      <button class="rounded bg-slate-800 px-3 py-1 hover:bg-slate-700" @click="api.toggle()">
        {{ api.isPlaying.value ? 'Pause' : 'Play' }}
      </button>
      <button class="rounded bg-slate-800 px-3 py-1 hover:bg-slate-700" @click="api.seekBy(-5)">
        −5s
      </button>
      <button class="rounded bg-slate-800 px-3 py-1 hover:bg-slate-700" @click="api.seekBy(5)">
        +5s
      </button>
      <span class="tabular-nums text-slate-400">
        {{ formatTime(api.currentTime.value) }} / {{ formatTime(api.duration.value) }}
      </span>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Verify**

Temporarily add `<YouTubeStage video-id="dQw4w9WgXcQ" />` to `app/pages/admin/index.vue`, run `pnpm dev`, open `/admin`, then:
1. Click Play → the video plays and the timer counts up.
2. Click directly on the video → nothing happens, no YouTube controls appear, and the video does not pause. This confirms the overlay is absorbing pointer events.
3. After clicking the video, press the spacebar → the page scrolls (or nothing happens), but the video does **not** react. This is the critical check: the iframe never took focus.
4. Click −5s / +5s → the timer jumps.

Remove the temporary `<YouTubeStage>` from `/admin` before committing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add YouTube player wrapper with focus-blocking overlay"
```

---

### Task 11: Tagging session composable

**Files:**
- Create: `app/composables/useTaggingSession.ts`

**Interfaces:**
- Consumes: `deriveMatch` (Task 5), `save_match_rallies` RPC (Task 9)
- Produces: `useTaggingSession(matchId: string, config: Ref<MatchConfig>, initial: RallyInput[])` returning `{ rallies, derived, saveState, saveError, dirty, canUndo, canRedo, addRally, addLet, toggleHighlightOnLast, setScorerOnLast, flipWinner, toggleLet, toggleHighlight, setTimestamp, setScorer, deleteRally, insertBefore, undo, redo, saveNow }`. Every one of these is a ref or a function — the consuming page must write `session.derived.value`, not `session.derived`.

- [ ] **Step 1: Write the composable**

`app/composables/useTaggingSession.ts`:

```ts
import type { Database } from '~/types/database.types'
import type { MatchConfig, RallyInput, Side } from '~~/shared/badminton'
import { deriveMatch } from '~~/shared/badminton'

const UNDO_LIMIT = 100
const SAVE_DEBOUNCE_MS = 1500

function clone(rallies: RallyInput[]): RallyInput[] {
  return rallies.map(r => ({ ...r }))
}

export function useTaggingSession(
  matchId: string,
  config: Ref<MatchConfig>,
  initial: RallyInput[],
) {
  const client = useSupabaseClient<Database>()

  const rallies = ref<RallyInput[]>(clone(initial))
  const undoStack = ref<RallyInput[][]>([])
  const redoStack = ref<RallyInput[][]>([])
  const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveError = ref<string | null>(null)
  const dirty = ref(false)

  const derived = computed(() => deriveMatch(config.value, rallies.value))
  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  let timer: ReturnType<typeof setTimeout> | null = null

  function scheduleSave() {
    dirty.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(saveNow, SAVE_DEBOUNCE_MS)
  }

  async function saveNow() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    saveState.value = 'saving'
    const payload = rallies.value.map(r => ({
      idx: r.idx,
      winnerSide: r.winnerSide,
      isLet: r.isLet,
      isHighlight: r.isHighlight,
      scoredByPlayerId: r.scoredByPlayerId,
      endedAtSeconds: r.endedAtSeconds,
    }))
    const { error } = await client.rpc('save_match_rallies', {
      p_match_id: matchId,
      p_rallies: payload,
    })
    if (error) {
      saveState.value = 'error'
      saveError.value = error.message
      return
    }
    saveState.value = 'saved'
    saveError.value = null
    dirty.value = false
  }

  /** Snapshot for undo, apply the mutation, renumber, then queue a save. */
  function mutate(fn: () => void) {
    undoStack.value.push(clone(rallies.value))
    if (undoStack.value.length > UNDO_LIMIT) undoStack.value.shift()
    redoStack.value = []
    fn()
    rallies.value.forEach((r, i) => { r.idx = i })
    scheduleSave()
  }

  function addRally(winnerSide: Side, endedAtSeconds: number) {
    mutate(() => {
      rallies.value.push({
        idx: rallies.value.length,
        winnerSide,
        isLet: false,
        isHighlight: false,
        scoredByPlayerId: null,
        endedAtSeconds,
      })
    })
  }

  function addLet(endedAtSeconds: number) {
    mutate(() => {
      rallies.value.push({
        idx: rallies.value.length,
        winnerSide: null,
        isLet: true,
        isHighlight: false,
        scoredByPlayerId: null,
        endedAtSeconds,
      })
    })
  }

  function toggleHighlightOnLast() {
    const last = rallies.value.at(-1)
    if (!last) return
    mutate(() => { last.isHighlight = !last.isHighlight })
  }

  function setScorerOnLast(playerId: string | null) {
    const last = rallies.value.at(-1)
    if (!last) return
    mutate(() => { last.scoredByPlayerId = playerId })
  }

  function flipWinner(idx: number) {
    const r = rallies.value[idx]
    if (!r || r.isLet) return
    mutate(() => { r.winnerSide = r.winnerSide === 1 ? 2 : 1 })
  }

  function toggleLet(idx: number) {
    const r = rallies.value[idx]
    if (!r) return
    mutate(() => {
      if (r.isLet) {
        r.isLet = false
        r.winnerSide = 1
      } else {
        r.isLet = true
        r.winnerSide = null
      }
    })
  }

  function toggleHighlight(idx: number) {
    const r = rallies.value[idx]
    if (!r) return
    mutate(() => { r.isHighlight = !r.isHighlight })
  }

  function setTimestamp(idx: number, seconds: number) {
    const r = rallies.value[idx]
    if (!r) return
    mutate(() => { r.endedAtSeconds = Math.max(0, seconds) })
  }

  function setScorer(idx: number, playerId: string | null) {
    const r = rallies.value[idx]
    if (!r) return
    mutate(() => { r.scoredByPlayerId = playerId })
  }

  function deleteRally(idx: number) {
    mutate(() => { rallies.value.splice(idx, 1) })
  }

  function insertBefore(idx: number, winnerSide: Side, endedAtSeconds: number) {
    mutate(() => {
      rallies.value.splice(idx, 0, {
        idx,
        winnerSide,
        isLet: false,
        isHighlight: false,
        scoredByPlayerId: null,
        endedAtSeconds,
      })
    })
  }

  function undo() {
    const previous = undoStack.value.pop()
    if (!previous) return
    redoStack.value.push(clone(rallies.value))
    rallies.value = previous
    scheduleSave()
  }

  function redo() {
    const next = redoStack.value.pop()
    if (!next) return
    undoStack.value.push(clone(rallies.value))
    rallies.value = next
    scheduleSave()
  }

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer)
  })

  return {
    rallies, derived, saveState, saveError, dirty, canUndo, canRedo,
    addRally, addLet, toggleHighlightOnLast, setScorerOnLast,
    flipWinner, toggleLet, toggleHighlight, setTimestamp, setScorer,
    deleteRally, insertBefore, undo, redo, saveNow,
  }
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm exec nuxt typecheck`
Expected: no errors. If `client.rpc('save_match_rallies', …)` errors on the argument type, `pnpm db:types` was not re-run after Task 9.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add tagging session composable with undo/redo and autosave"
```

---

### Task 12: Tagging page with keyboard bindings

**Files:**
- Create: `app/components/tagging/ScoreBoard.vue`, `app/components/tagging/KeyHelp.vue`, `app/pages/admin/matches/[id]/tag.vue`

**Interfaces:**
- Consumes: `useTaggingSession`, `YouTubeStage`, `deriveMatch`
- Produces: a working tagging page. `<ScoreBoard :derived="DerivedMatch" :names="Record<number, string>" />` renders the live score and serve indicator.

- [ ] **Step 1: Write the scoreboard**

`app/components/tagging/ScoreBoard.vue`:

```vue
<script setup lang="ts">
import type { DerivedMatch } from '~~/shared/badminton'

const props = defineProps<{
  derived: DerivedMatch
  names: Record<number, string>
}>()

const last = computed(() => props.derived.rallyStates.at(-1) ?? null)
const currentGame = computed(() => props.derived.games.at(-1) ?? null)

// Score to show: the state after the last rally, or 0-0 before any.
const score = computed<[number, number]>(() => last.value?.scoreAfter ?? [0, 0])

// Who serves the NEXT rally: the winner of the last one.
const nextServer = computed(() => {
  if (!last.value) return null
  return { side: last.value.servingSide, slot: last.value.servingSlot }
})
</script>

<template>
  <div class="rounded border border-slate-800 bg-slate-900 p-4">
    <div class="flex items-baseline justify-between">
      <span class="text-sm text-slate-400">
        Game {{ currentGame?.number ?? 1 }}
        · {{ derived.gamesWon[0] }}–{{ derived.gamesWon[1] }} games
      </span>
      <span v-if="last?.isMatchPoint" class="text-sm font-semibold text-amber-400">
        MATCH POINT
      </span>
      <span v-else-if="last?.isGamePoint" class="text-sm font-semibold text-emerald-400">
        GAME POINT
      </span>
    </div>

    <div class="mt-2 flex items-center gap-4 text-4xl font-bold tabular-nums">
      <span :class="nextServer?.side === 1 ? 'text-emerald-400' : ''">{{ score[0] }}</span>
      <span class="text-slate-600">–</span>
      <span :class="nextServer?.side === 2 ? 'text-emerald-400' : ''">{{ score[1] }}</span>
    </div>

    <p v-if="nextServer" class="mt-2 text-sm text-slate-400">
      Serving next: <span class="text-slate-100">{{ names[nextServer.slot] ?? `Slot ${nextServer.slot}` }}</span>
    </p>
    <p v-else class="mt-2 text-sm text-slate-500">No rallies logged yet.</p>

    <p v-if="derived.complete" class="mt-2 text-sm font-semibold text-emerald-400">
      Match complete — side {{ derived.matchWinnerSide }} wins.
    </p>

    <ul v-if="derived.warnings.length" class="mt-3 space-y-1">
      <li v-for="(w, i) in derived.warnings" :key="i" class="rounded bg-amber-950 px-2 py-1 text-xs text-amber-300">
        {{ w.message }}
      </li>
    </ul>
  </div>
</template>
```

- [ ] **Step 2: Write the key legend**

`app/components/tagging/KeyHelp.vue`:

```vue
<template>
  <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-400">
    <dt class="font-mono text-slate-200">A</dt><dd>point for us</dd>
    <dt class="font-mono text-slate-200">Z</dt><dd>point for them</dd>
    <dt class="font-mono text-slate-200">R</dt><dd>let (replayed)</dd>
    <dt class="font-mono text-slate-200">P</dt><dd>highlight last point</dd>
    <dt class="font-mono text-slate-200">&amp; é " '</dt><dd>scorer = slot 1–4</dd>
    <dt class="font-mono text-slate-200">Ctrl+Z / Y</dt><dd>undo / redo</dd>
    <dt class="font-mono text-slate-200">Space</dt><dd>play / pause</dd>
    <dt class="font-mono text-slate-200">← →</dt><dd>seek ∓5s</dd>
  </dl>
</template>
```

- [ ] **Step 3: Write the tagging page**

`app/pages/admin/matches/[id]/tag.vue`:

```vue
<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { MatchConfig, RallyInput, Slot } from '~~/shared/badminton'

definePageMeta({ middleware: 'admin', layout: 'admin' })

const route = useRoute()
const matchId = route.params.id as string
const client = useSupabaseClient<Database>()

const { data: bundle } = await useAsyncData(`tag-${matchId}`, async () => {
  const [match, participants, rallies, gameStarts] = await Promise.all([
    client.from('matches').select('*').eq('id', matchId).single(),
    client.from('match_players')
      .select('slot, player_id, players(first_name, last_name)')
      .eq('match_id', matchId),
    client.from('rallies').select('*').eq('match_id', matchId).order('idx'),
    client.from('match_game_starts').select('*').eq('match_id', matchId),
  ])
  return {
    match: match.data,
    participants: participants.data ?? [],
    rallies: rallies.data ?? [],
    gameStarts: gameStarts.data ?? [],
  }
})

const match = computed(() => bundle.value?.match ?? null)

const names = computed<Record<number, string>>(() => {
  const out: Record<number, string> = {}
  for (const p of bundle.value?.participants ?? []) {
    const player = p.players as { first_name: string, last_name: string } | null
    out[p.slot] = player ? `${player.first_name} ${player.last_name}` : `Slot ${p.slot}`
  }
  return out
})

const slotToPlayerId = computed<Record<number, string>>(() => {
  const out: Record<number, string> = {}
  for (const p of bundle.value?.participants ?? []) out[p.slot] = p.player_id
  return out
})

const config = computed<MatchConfig>(() => ({
  format: (match.value?.format ?? 'doubles') as MatchConfig['format'],
  rules: {
    bestOf: match.value?.best_of ?? 3,
    pointsToWin: match.value?.points_to_win ?? 21,
    winBy: match.value?.win_by ?? 2,
    pointsCap: match.value?.points_cap ?? 30,
  },
  initialServerSide: (match.value?.initial_server_side ?? null) as MatchConfig['initialServerSide'],
  side1RightCourtSlot: (match.value?.side1_right_court_slot ?? null) as Slot | null,
  side2RightCourtSlot: (match.value?.side2_right_court_slot ?? null) as Slot | null,
  gameStarts: (bundle.value?.gameStarts ?? []).map(g => ({
    gameNumber: g.game_number,
    serverSlot: g.server_slot as Slot | null,
    side1RightCourtSlot: g.side1_right_court_slot as Slot | null,
    side2RightCourtSlot: g.side2_right_court_slot as Slot | null,
  })),
}))

const initialRallies: RallyInput[] = (bundle.value?.rallies ?? []).map(r => ({
  idx: r.idx,
  winnerSide: r.winner_side as 1 | 2 | null,
  isLet: r.is_let,
  isHighlight: r.is_highlight,
  scoredByPlayerId: r.scored_by_player_id,
  endedAtSeconds: Number(r.ended_at_seconds),
}))

const session = useTaggingSession(matchId, config, initialRallies)
const stage = ref<{ getTime: () => number, toggle: () => void, seekBy: (d: number) => void, seekTo: (s: number) => void } | null>(null)

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

  // Undo/redo first: they are the only bindings that use a modifier.
  if (event.ctrlKey || event.metaKey) {
    const key = event.key.toLowerCase()
    if (key === 'z') {
      event.preventDefault()
      session.undo()
    } else if (key === 'y') {
      event.preventDefault()
      session.redo()
    }
    return
  }

  const time = stage.value?.getTime() ?? 0

  // Digits are matched on event.code because on AZERTY the unshifted digit row
  // produces & é " ' rather than 1 2 3 4.
  if (event.code.startsWith('Digit')) {
    const slot = Number(event.code.slice(5))
    if (slot >= 1 && slot <= 4) {
      event.preventDefault()
      session.setScorerOnLast(slotToPlayerId.value[slot] ?? null)
    }
    return
  }

  // Letters are matched on event.key: event.code reports physical position, so
  // the AZERTY A key would report KeyQ.
  switch (event.key.toLowerCase()) {
    case 'a':
      event.preventDefault()
      session.addRally(1, time)
      break
    case 'z':
      event.preventDefault()
      session.addRally(2, time)
      break
    case 'r':
      event.preventDefault()
      session.addLet(time)
      break
    case 'p':
      event.preventDefault()
      session.toggleHighlightOnLast()
      break
    case ' ':
      event.preventDefault()
      stage.value?.toggle()
      break
    case 'arrowleft':
      event.preventDefault()
      stage.value?.seekBy(-5)
      break
    case 'arrowright':
      event.preventDefault()
      stage.value?.seekBy(5)
      break
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// Unsaved-changes guards.
onBeforeRouteLeave(() => {
  if (!session.dirty.value) return true
  return confirm('You have unsaved tagging changes. Leave anyway?')
})

onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload)
})
function beforeUnload(event: BeforeUnloadEvent) {
  if (session.dirty.value) event.preventDefault()
}
</script>

<template>
  <div v-if="match">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold">{{ match.title }}</h1>
      <div class="flex items-center gap-3 text-sm">
        <span
          class="text-slate-400"
          :class="{ 'text-amber-400': session.saveState.value === 'error' }"
        >
          {{
            session.saveState.value === 'saving' ? 'Saving…'
            : session.saveState.value === 'error' ? `Save failed: ${session.saveError.value}`
            : session.dirty.value ? 'Unsaved' : 'Saved'
          }}
        </span>
        <button class="rounded bg-slate-800 px-3 py-1 disabled:opacity-40" :disabled="!session.canUndo.value" @click="session.undo()">
          Undo
        </button>
        <button class="rounded bg-slate-800 px-3 py-1 disabled:opacity-40" :disabled="!session.canRedo.value" @click="session.redo()">
          Redo
        </button>
        <button class="rounded bg-emerald-600 px-3 py-1" @click="session.saveNow()">
          Save now
        </button>
      </div>
    </div>

    <div class="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div>
        <YouTubeStage ref="stage" :video-id="match.youtube_video_id" />
        <ScoreBoard class="mt-4" :derived="session.derived.value" :names="names" />
        <KeyHelp class="mt-4" />
      </div>
      <PointList
        :rallies="session.rallies.value"
        :derived="session.derived.value"
        :names="names"
        :slot-to-player-id="slotToPlayerId"
        @seek="(s: number) => stage?.seekTo(s)"
        @flip="session.flipWinner"
        @toggle-let="session.toggleLet"
        @toggle-highlight="session.toggleHighlight"
        @set-scorer="session.setScorer"
        @delete="session.deleteRally"
      />
    </div>
  </div>
  <p v-else class="text-slate-400">Match not found.</p>
</template>
```

- [ ] **Step 4: Verify (PointList does not exist yet — expect one error)**

This page references `<PointList>`, built in Task 13. Before running, create a temporary stub so the page mounts:

`app/components/tagging/PointList.vue`:

```vue
<template>
  <div class="rounded border border-slate-800 p-4 text-slate-500">
    Point list — Task 13
  </div>
</template>
```

Run: `pnpm dev`, open `/admin/matches/<id>/tag` for the match from Task 8.
1. Press **A** three times, **Z** twice → the scoreboard reads 3–2 and "Serving next" names a player.
2. Press **A** and watch the doubles serve indicator alternate between your two players while your side keeps winning.
3. Press **Ctrl+Z** → the score steps back one point.
4. Wait ~2 s → the indicator flips from "Unsaved" to "Saved".
5. Reload the page → the rallies you tagged are still there.
6. Click on the video, then press **A** → a rally is still recorded, proving the overlay kept focus off the iframe.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add keyboard tagging page with live scoreboard"
```

---

### Task 13: Editable point list

**Files:**
- Create: `app/components/tagging/PointRow.vue`
- Modify: `app/components/tagging/PointList.vue` (replace the Task 12 stub)

**Interfaces:**
- Consumes: `RallyInput[]`, `DerivedMatch`
- Produces: `<PointList>` emitting `seek(seconds)`, `flip(idx)`, `toggle-let(idx)`, `toggle-highlight(idx)`, `set-scorer(idx, playerId | null)`, `delete(idx)` — the exact events Task 12's page already wires up.

- [ ] **Step 1: Write the row component**

`app/components/tagging/PointRow.vue`:

```vue
<script setup lang="ts">
import type { RallyInput, RallyState } from '~~/shared/badminton'

defineProps<{
  rally: RallyInput
  state: RallyState | null
  names: Record<number, string>
  slotToPlayerId: Record<number, string>
}>()

const emit = defineEmits<{
  seek: [number]
  flip: [number]
  'toggle-let': [number]
  'toggle-highlight': [number]
  'set-scorer': [number, string | null]
  delete: [number]
}>()

function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
</script>

<template>
  <li class="flex items-center gap-2 border-b border-slate-800 py-1.5 text-xs">
    <button
      class="w-12 shrink-0 text-left font-mono text-slate-500 hover:text-slate-200"
      :title="`Seek to ${formatTime(state?.startsAtSeconds ?? 0)}`"
      @click="emit('seek', state?.startsAtSeconds ?? 0)"
    >
      {{ formatTime(state?.startsAtSeconds ?? 0) }}
    </button>

    <span class="w-4 shrink-0 text-slate-600">G{{ state?.gameNumber ?? '?' }}</span>

    <button
      class="w-12 shrink-0 rounded px-1 font-mono tabular-nums"
      :class="rally.isLet ? 'bg-slate-800 text-slate-400' : 'bg-slate-800 text-slate-100'"
      title="Click to flip the winner"
      @click="emit('flip', rally.idx)"
    >
      {{ rally.isLet ? 'let' : `${state?.scoreAfter[0]}-${state?.scoreAfter[1]}` }}
    </button>

    <span class="w-6 shrink-0 text-center" :class="rally.winnerSide === 1 ? 'text-emerald-400' : rally.winnerSide === 2 ? 'text-sky-400' : 'text-slate-600'">
      {{ rally.isLet ? '·' : rally.winnerSide === 1 ? 'A' : 'Z' }}
    </span>

    <span class="min-w-0 flex-1 truncate text-slate-500">
      {{ state ? names[state.servingSlot] ?? `Slot ${state.servingSlot}` : '' }}
      <span class="text-slate-700">{{ state?.serviceCourt === 'right' ? '▸R' : '▸L' }}</span>
    </span>

    <select
      class="w-24 shrink-0 rounded border border-slate-800 bg-slate-900 px-1 py-0.5 text-slate-300"
      :value="rally.scoredByPlayerId ?? ''"
      @change="emit('set-scorer', rally.idx, ($event.target as HTMLSelectElement).value || null)"
    >
      <option value="">scorer</option>
      <option v-for="(playerId, slot) in slotToPlayerId" :key="slot" :value="playerId">
        {{ names[Number(slot)] }}
      </option>
    </select>

    <button
      class="shrink-0"
      :class="rally.isHighlight ? 'text-amber-400' : 'text-slate-700 hover:text-slate-400'"
      title="Toggle highlight"
      @click="emit('toggle-highlight', rally.idx)"
    >
      ★
    </button>
    <button
      class="shrink-0 text-slate-700 hover:text-slate-400"
      title="Toggle let"
      @click="emit('toggle-let', rally.idx)"
    >
      ↺
    </button>
    <button
      class="shrink-0 text-slate-700 hover:text-red-400"
      title="Delete rally"
      @click="emit('delete', rally.idx)"
    >
      ✕
    </button>
  </li>
</template>
```

- [ ] **Step 2: Replace the PointList stub**

`app/components/tagging/PointList.vue`:

```vue
<script setup lang="ts">
import type { DerivedMatch, RallyInput } from '~~/shared/badminton'

const props = defineProps<{
  rallies: RallyInput[]
  derived: DerivedMatch
  names: Record<number, string>
  slotToPlayerId: Record<number, string>
}>()

const emit = defineEmits<{
  seek: [number]
  flip: [number]
  'toggle-let': [number]
  'toggle-highlight': [number]
  'set-scorer': [number, string | null]
  delete: [number]
}>()

const stateByIdx = computed(() => {
  const map = new Map<number, DerivedMatch['rallyStates'][number]>()
  for (const s of props.derived.rallyStates) map.set(s.idx, s)
  return map
})

const list = ref<HTMLElement | null>(null)

// Keep the newest rally in view while tagging.
watch(() => props.rallies.length, async () => {
  await nextTick()
  list.value?.scrollTo({ top: list.value.scrollHeight })
})
</script>

<template>
  <div class="rounded border border-slate-800 bg-slate-900">
    <div class="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-sm">
      <span class="font-semibold">Points</span>
      <span class="text-slate-500">{{ rallies.length }}</span>
    </div>
    <ul ref="list" class="max-h-[70vh] overflow-y-auto px-3">
      <PointRow
        v-for="rally in rallies"
        :key="rally.idx"
        :rally="rally"
        :state="stateByIdx.get(rally.idx) ?? null"
        :names="names"
        :slot-to-player-id="slotToPlayerId"
        @seek="(s: number) => emit('seek', s)"
        @flip="(i: number) => emit('flip', i)"
        @toggle-let="(i: number) => emit('toggle-let', i)"
        @toggle-highlight="(i: number) => emit('toggle-highlight', i)"
        @set-scorer="(i: number, p: string | null) => emit('set-scorer', i, p)"
        @delete="(i: number) => emit('delete', i)"
      />
    </ul>
    <p v-if="!rallies.length" class="px-3 py-4 text-xs text-slate-500">
      Press A or Z to log the first point.
    </p>
  </div>
</template>
```

- [ ] **Step 3: Verify**

Run: `pnpm dev`, open the tagging page and tag about 10 points including one **A** streak.
1. Every row shows a running score, the serving player and `▸R`/`▸L`.
2. Click the score chip on row 3 → the winner flips and **every later row's score changes**. This is the whole point of deriving rather than storing.
3. In doubles, after flipping row 3, confirm the serving player column also changed for later rows.
4. Click a timestamp → the video seeks to that point's start.
5. Click ★ on a row → it turns amber; reload → it is still amber.
6. Click ✕ on a middle row → it disappears and later scores shift down by one.
7. Press **Ctrl+Z** → the deleted row returns.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add editable point list with live re-derivation"
```

---

### Task 14: Public match pages

**Files:**
- Modify: `app/pages/index.vue`
- Create: `app/pages/matches/[id].vue`

**Interfaces:**
- Consumes: `matches`, `match_players`, `rallies`, `deriveMatch`
- Produces: the public read path. Deliberately plain — no overlay, no point navigation; sub-project C upgrades this page.

- [ ] **Step 1: Write the public match list**

`app/pages/index.vue`:

```vue
<script setup lang="ts">
import type { Database } from '~/types/database.types'

const client = useSupabaseClient<Database>()
const { data: matches } = await useAsyncData('published-matches', async () => {
  const { data } = await client
    .from('matches')
    .select('id, title, played_on, venue, format')
    .eq('status', 'published')
    .order('played_on', { ascending: false, nullsFirst: false })
  return data ?? []
})
</script>

<template>
  <h1 class="text-2xl font-bold">Matches</h1>
  <ul class="mt-6 space-y-3">
    <li v-for="m in matches" :key="m.id" class="rounded border border-slate-800 p-4 hover:border-slate-700">
      <NuxtLink :to="`/matches/${m.id}`" class="font-semibold hover:underline">
        {{ m.title }}
      </NuxtLink>
      <p class="mt-1 text-sm text-slate-400">
        {{ m.played_on || 'Date unknown' }} · {{ m.format }}{{ m.venue ? ` · ${m.venue}` : '' }}
      </p>
    </li>
  </ul>
  <p v-if="!matches?.length" class="mt-6 text-slate-400">Nothing published yet.</p>
</template>
```

- [ ] **Step 2: Write the public match page**

`app/pages/matches/[id].vue`:

```vue
<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { MatchConfig, Slot } from '~~/shared/badminton'
import { deriveMatch } from '~~/shared/badminton'

const route = useRoute()
const matchId = route.params.id as string
const client = useSupabaseClient<Database>()

const { data: bundle } = await useAsyncData(`match-${matchId}`, async () => {
  const [match, participants, rallies, gameStarts] = await Promise.all([
    client.from('matches').select('*').eq('id', matchId).maybeSingle(),
    client.from('match_players')
      .select('slot, players(first_name, last_name)').eq('match_id', matchId),
    client.from('rallies').select('*').eq('match_id', matchId).order('idx'),
    client.from('match_game_starts').select('*').eq('match_id', matchId),
  ])
  return {
    match: match.data,
    participants: participants.data ?? [],
    rallies: rallies.data ?? [],
    gameStarts: gameStarts.data ?? [],
  }
})

const match = computed(() => bundle.value?.match ?? null)

const names = computed<Record<number, string>>(() => {
  const out: Record<number, string> = {}
  for (const p of bundle.value?.participants ?? []) {
    const player = p.players as { first_name: string, last_name: string } | null
    out[p.slot] = player ? `${player.first_name} ${player.last_name}` : `Slot ${p.slot}`
  }
  return out
})

const sideNames = computed(() => ({
  1: [names.value[1], names.value[2]].filter(Boolean).join(' / ') || 'Us',
  2: [names.value[3], names.value[4]].filter(Boolean).join(' / ') || 'Them',
}))

const derived = computed(() => {
  if (!match.value) return null
  const config: MatchConfig = {
    format: match.value.format as MatchConfig['format'],
    rules: {
      bestOf: match.value.best_of,
      pointsToWin: match.value.points_to_win,
      winBy: match.value.win_by,
      pointsCap: match.value.points_cap,
    },
    initialServerSide: match.value.initial_server_side as MatchConfig['initialServerSide'],
    side1RightCourtSlot: match.value.side1_right_court_slot as Slot | null,
    side2RightCourtSlot: match.value.side2_right_court_slot as Slot | null,
    gameStarts: (bundle.value?.gameStarts ?? []).map(g => ({
      gameNumber: g.game_number,
      serverSlot: g.server_slot as Slot | null,
      side1RightCourtSlot: g.side1_right_court_slot as Slot | null,
      side2RightCourtSlot: g.side2_right_court_slot as Slot | null,
    })),
  }
  return deriveMatch(config, (bundle.value?.rallies ?? []).map(r => ({
    idx: r.idx,
    winnerSide: r.winner_side as 1 | 2 | null,
    isLet: r.is_let,
    isHighlight: r.is_highlight,
    scoredByPlayerId: r.scored_by_player_id,
    endedAtSeconds: Number(r.ended_at_seconds),
  })))
})

const highlightCount = computed(
  () => derived.value?.rallyStates.filter(r => r.isHighlight).length ?? 0,
)
</script>

<template>
  <div v-if="match">
    <h1 class="text-2xl font-bold">{{ match.title }}</h1>
    <p class="mt-1 text-sm text-slate-400">
      {{ match.played_on || 'Date unknown' }} · {{ match.format }}{{ match.venue ? ` · ${match.venue}` : '' }}
    </p>

    <div v-if="match.youtube_video_id" class="mt-6 aspect-video w-full overflow-hidden rounded">
      <iframe
        class="h-full w-full"
        :src="`https://www.youtube.com/embed/${match.youtube_video_id}`"
        title="Match video"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
      />
    </div>

    <div class="mt-6 rounded border border-slate-800 p-4">
      <div class="flex items-center justify-between">
        <span class="font-medium">{{ sideNames[1] }}</span>
        <span class="font-mono text-lg tabular-nums">
          {{ derived?.games.map(g => `${g.score[0]}-${g.score[1]}`).join('  ') || '—' }}
        </span>
        <span class="font-medium">{{ sideNames[2] }}</span>
      </div>
      <p v-if="derived?.complete" class="mt-2 text-center text-sm text-emerald-400">
        Winner: {{ sideNames[derived.matchWinnerSide as 1 | 2] }}
      </p>
      <p class="mt-2 text-center text-xs text-slate-500">
        {{ derived?.rallyStates.length ?? 0 }} rallies · {{ highlightCount }} highlights
      </p>
    </div>
  </div>
  <p v-else class="text-slate-400">Match not found.</p>
</template>
```

- [ ] **Step 3: Verify the full public path**

1. In `/admin/matches/<id>`, set status to **Published** and save.
2. Open a private/incognito window (signed out) at `http://localhost:3000/`.
3. Expected: the match is listed; opening it shows the video, per-game scores and rally count — all derived client-side from rallies an anonymous user is allowed to read.
4. Set the match back to **Draft**, reload the incognito window → the match disappears from the list and its page reads "Match not found." This confirms RLS, not just UI filtering.
5. Resize to a phone width → both pages remain readable with no horizontal scroll.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add public match list and match detail pages"
```

---

## Deferred to later sub-projects

Do not implement these here:

- Guest enhanced player: overlay UI, point/set navigation, per-point stats → **C**
- Resources and skill tree → **D**
- FFBad / MyFFBad / EBad sync — `ffbad_license` stays an unused column
- Cross-match player statistics
- Public signup and per-user state
- Editing `match_game_starts` from the UI. The table, its RLS and engine support all exist; only the admin form control is missing. Until it is built, doubles games 2 and 3 reuse game 1's arrangement and the scoreboard shows an `ambiguous_game_start` warning — which is correct behaviour, not a bug.
- Automated tests (explicit user decision)
