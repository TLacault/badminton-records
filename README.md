# U.S. Talence Badminton

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Landing page copy

**Every hand-written word on the public site lives in `app/config/site.ts`.** The
bio, the equipment list, the partner section and the section blurbs are all
plain data there — edit that one file and the landing page follows, no markup
involved. Anything still reading `TODO` is a placeholder waiting for a real
value. Deleting an entry from `gear` or `career` removes its card; the layouts
flow from the array length.

## Design system

Tokens live at the top of `app/assets/css/main.css`.

The palette is deliberately **bichromatic**: the club's crimson against a
neutral ink/paper axis, and nothing else. Two variables carry the brand:

- `--ui-brand` is `#ba0925` exactly as issued, and is only used as a *fill*
  under white text, where it clears 4.5:1.
- `--ui-accent` is what red looks like as *text* or as a glow. Unchanged in
  light mode; lifted to `#f5233f` on the near-black background, where `#ba0925`
  itself only reaches 3:1.

Light and dark are two blocks of `--ui-*` variables (`:root` and `.dark`),
mapped into Tailwind through `@theme inline` so utilities like `bg-panel` follow
the live variable. Components use the semantic name (`text-ink-muted`,
`border-line`, `bg-accent-soft`) and never a raw hex, so neither theme can drift
out of sync with the other.

Reusable effects are Tailwind utilities in the same file: `glass`, `glow`,
`slash`, `btn`/`btn-primary`/`btn-ghost`, `field`, `label`, `eyebrow`.

Rally colour is part of the same two-colour language: `bg-us` is crimson,
`bg-them` is ink. The match page prints a written legend under the timeline,
because colour is never allowed to be the only carrier of meaning.

The theme is chosen by an inline script in `nuxt.config.ts` that runs before
first paint (so a dark-mode reload never flashes white); `useTheme()` syncs to
that class on mount and owns the toggle afterwards.

### Brand assets

`public/brand/` is generated from the club artwork:

- `logo-lockup.png` — the full emblem with its set text. Only legible above
  ~140px tall; used in the footer, the sign-in page and nowhere small.
- `logo-mark.png` — the emblem's crown alone, for the header and the favicon.
- `court.jpg`, `portrait.jpg` — photography, duotoned in CSS rather than baked.

Both logo files are white line art with an alpha channel, inverted in CSS for
light mode so the official shape is never recoloured or redrawn.

### Motion

Scroll reveals (`<UiReveal>`) render hidden and are unhidden by an
IntersectionObserver. Two escape hatches keep that safe: `prefers-reduced-motion`
unhides in CSS, and a `<noscript>` rule unhides when JS never arrives.
`prefers-reduced-motion` is honoured with a blanket rule rather than
per-animation opt-outs, so an animation added later cannot silently escape it.

## Naming

`matches.title` is a YouTube upload name — `JEUX LIBRE - THOMAS X BLUD #1 -
WIN` — and it is not shown anywhere: not on the match page, not on a card, not
in the admin library, not in the browser tab. Every one of those builds the
fixture from the roster instead (`utils/matchSummary.ts`), which means renaming
a player corrects the whole site at once. The stored title is the fallback for
a match with nobody assigned yet, and nothing else.

Side labels come in two lengths: full names for a heading, first names for
anywhere the label sits beside a number — `Tim & Adrien`, never `Us`.

## The match page

Under it, tags carry weight rather than hue, because the palette is two
colours: the match type is a crimson outline, date/format/venue/length are ink
outlines, and the result is the single filled crimson chip.

**Results are spoilers.** The result chip and the whole match-details panel
stay hidden behind one click, remembered per match in localStorage
(`useResultReveal`). Only a *finished* match hides anything — there is nothing
to give away in a half-tagged one. The timeline is deliberately exempt: it is
the navigation control, and blurring it would make the page unusable.

Match types are a table (`match_types`), not an enum, edited at
`/admin/match-types`. `matches.player_info_fields` picks, per match, which
personal details (club, ranks, age, licence) print beside each player — a
tournament sheet wants ranks, a Tuesday evening does not.

Below the details panel, three more matches to watch: same session first,
since an evening is watched as an evening, then the newest of everything else.

### Sets, not games

The BWF rulebook says game; the club says set. The code now says set
everywhere — `setNumber`, `derived.sets`, `match_set_starts.set_number` — so
the schema, the engine and the screen use one word. Migration `0007` carries
the rename, along with the house rules the form now defaults to: sets to 15,
capped at 21.

### Scoreboard

`<PlayerScoreBoard>` lives on the video and nowhere else. A board beside the
rally it describes is a second thing to look at; the point of an overlay is
that you never look away from the court.

It grows a column per set as the match goes, and shows no sets-won total — the
columns are the tally. Scores come from playback, never from the log, so a set
that has not started yet is not printed: its final score would spoil the rally
on screen.

Compact (Us / Opponents) or expanded (all four names, each behind its club
acronym) is a viewer toggle remembered across matches. The acronym is derived,
not stored — initials for a multi-word club, first three letters otherwise.

Legibility over moving video comes from the `legible` utility — a text shadow
hugging the glyphs — rather than from a dark box, which would hide the rally
the board is describing.

### Fullscreen

`useFullscreen` fullscreens the *stage wrapper*, not the iframe. YouTube's own
button fullscreens the iframe alone, which leaves our overlay behind on the
page; the `fullscreenchange` handler catches that and hands fullscreen to the
wrapper instead, so the board survives. The stage's own button skips the
handoff and its one frame of flicker.

It sits bottom-centre, above YouTube's control bar: the corners belong to the
embed — settings and fullscreen on the right, channel chrome on the left — and
covering any of those is worse than sharing the middle with the seek bar.

It fades a second after the pointer stops. "Stops" is approximate on purpose: a
cross-origin iframe swallows every pointer event inside it, so once the cursor
is over the video the parent page cannot see it move. Entering and leaving the
stage are observable, and playback state fills the rest — a paused player keeps
the button, a playing one hides it.

## Clip — the highlight cutter

`/clip` (formerly `/reel`, which still redirects) turns a tagged match into a
highlight film. In the UI the film is the *clip* and its pieces are *shots*;
the code still says `reel` for the film and `clip` for a piece. The tagging
already says where the good rallies are, so the clip starts from that rather than from a
scrub bar: **Build the clip** takes every starred passage, pads it out to the
serve before and the beat after, and lays the clips end to end. From there each
clip can be trimmed, slowed, punched in, graded and captioned; a song is
imported from a YouTube link and trimmed to the length of the film; ffmpeg cuts
the mp4.

Open to guests as well as admins. Nothing about it writes to the database —
a reel is a file, not a row.

### It is one object

Everything on the page reads one `ReelProject` (`shared/reel/types.ts`) and
nothing else, so what you are watching and what would be rendered cannot come
apart. The same object is what `.clip` holds and what `POST /api/reel/render`
is sent.

`shared/reel/project.ts` is pure and framework-free, like `shared/badminton`:
which clips a match offers, how long the film runs once the transitions have
overlapped it, where in the song to start. `timeline()` is the list the preview
plays and the renderer cuts, and it is the reason a crossfaded reel previews
exactly as long as it exports — a join gives back its overlap in both.

### The preview is a rehearsal

There is no film until you export one, so previewing means dragging a single
player along the edit list, jumping it at every boundary. Position is read from
the player rather than counted by a clock of our own, which is what keeps the
picture and the number under it honest.

The grade is CSS, the caption is a `<p>` where drawtext will put it, and a join
is drawn as a dip rather than a real crossfade, which one video element cannot
do to itself. It is accurate enough to decide from. **ffmpeg is the truth**,
and the panel says so.

### Three sources, in order of how well they behave

| Source | Scrubbing | Render |
|---|---|---|
| A file you attach | instant | yes |
| Downloaded by the host (`yt-dlp`) | instant, range requests | yes |
| The YouTube embed | approximate seeks | no |

The download is the "user material" the tool leans on: a YouTube embed cannot
be seeked to a frame, played smoothly at 0.25×, or read by ffmpeg. One download
per video id, cached under `.reel-cache/` (gitignored, and deletable from the
Export panel — these are gigabytes).

### The song

Paste a YouTube link. The host fetches the audio and measures a loudness
envelope — one RMS reading per quarter second — and the window with the most
energy in it, for exactly as long as the reel runs, is the chorus in most of
what anyone cuts to. That is where the song starts, and it is re-picked
whenever the reel changes length. Drag the window on the waveform to overrule
it. A dropped audio file is decoded and measured the same way in the browser,
which is the same feature with no server.

### Intro and outro

Drop `intro.mp4` and `outro.mp4` into `public/brand/reel/`; they are picked up
automatically and appear as two checkboxes. Not `public/clip/` — a directory
there shadows the page and Nitro serves the folder instead of the editor.

### What a host needs

`GET /api/reel/capabilities` reports what the machine can do, and the editor
shapes itself around the answer rather than failing at minute nine of an
export:

- **`yt-dlp` + `ffmpeg` + `ffprobe`** — fetch the match video and the song.
- **`ffmpeg` + `ffprobe`** — render.
- **Neither** (a Vercel deployment) — the editor still cuts, previews against
  the embed, and saves the project. Open the `.clip` file where the binaries
  are and render there.

Downloads and renders are background jobs with a ticket the browser polls, so a
reload does not lose a render and nothing holds a request open for eleven
minutes.

### The filter graph

`server/utils/reelFfmpeg.ts` builds the argv and runs nothing, because an
ffmpeg invocation is the least debuggable thing in this repository: a filter
graph is either exactly right or it fails eighty frames in with a message about
a pad. It is asserted in `reelFfmpeg.test.ts` — offsets, speed in both picture
and sound, a silent bookend given a synthetic track so `concat` still sees
matching pads — and only then handed to a child process.

Two escaping notes, both learned the hard way. Filtergraph quoting is not shell
quoting: inside `'…'` nothing is escaped, so a caption only has to close,
escape and reopen the quote around an apostrophe — and `expansion=none` on
drawtext is what stops `%` and `%{…}` in a caption being read as a directive.
And `ffmpeg --version` exits 8: the capability probe asks for `-version`, or it
answers "no ffmpeg" on a machine that has it.

### Projects

**Save** writes a `.clip` file (`.reel` still opens): plain JSON holding the clips, the effects, the
song and the output settings. JSON because a reel is nested — a music window
and per-clip effects do not fit in a CSV without inventing a second format
inside the first — and plain because a file you cannot open in an editor is a
file you cannot fix. The current project also lives in `localStorage`, so a
reload picks the edit back up; Ctrl+Z steps back through a snapshot stack.

## Admin

Nothing in the admin has a save button any more. The match form writes itself
half a second after you stop typing (`m-autosave` reports the write); the
tagger writes 400ms after the last keypress. Only a match that does not exist
yet keeps a button, because there is no row to write to until it is created.

A new match opens with our half of the court already filled in — `HOME_PAIR` in
`utils/players.ts`, matched by name against the roster so the seed survives a
database reset — plus Talence, 15 points and a cap of 21.

The tagger's **Reset** clears the recording and nothing else: the rally log and
the breaks go, and the roster, venue, type, scoring rules, first server and
court sides all stay, because they were settled before the first point was
tagged and re-entering them to fix a mistagged set is a punishment, not a
feature. Edit those on `/admin/matches/[id]` instead. Reset reloads the page
afterwards rather than refetching: the tagging session still holds the old log
in memory, and its next autosave would write it all back.

The video library filters and sorts through `<VideoFilterBar>`, shared with the
public wall so "longest" cannot come to mean two things. Search covers players,
clubs, types and venues; the dropdowns narrow by result, format, type, tagging
status and whether anything was highlighted. Rows are decorated once — the
scoring engine runs per match, which is not something to redo on every
keystroke — and filtered over that. The public page falls back from
session-grouping to a flat list once you search, since grouping is exactly what
a search asks you to break.

Native controls follow the OS, not the page, so `color-scheme` is inherited
onto every `select` and date input and the option rows are painted from the
palette; a dropdown never opens a white sheet over a dark page.

## Tagging keyboard

Every binding is editable and lives in localStorage
(`ust-tagging-keybinds-v1`, overrides only, so keys added later still arrive
with a default). The cheat sheet under the video is the editor, two columns of
them: click a key, press another, done. `+` gives an action a second key;
hovering a key when there are several offers to remove it. Rebinding onto a
taken key takes it off the other action and says so.

A binding records *how* it wants to be matched, decided when it is captured.
`key` for letters — on AZERTY the A key reports `code: 'KeyQ'`, so matching on
code would put "point for us" under Q. `code` for keys that produce nothing
printable and for the digit row, which on AZERTY produces & é " ' rather than
1 2 3 4. That is also why the scorer digits ship with two bindings each: the
number row and the numpad.

## Tests

```bash
pnpm test        # vitest
```

`shared/badminton` is pure and framework-free, which is the point: the scoring
engine and the statistics derived from it are testable without a browser,
a component or a database. `stats.test.ts` covers the summaries behind the
match-details panel.

## Local database and admin access

```bash
pnpm db:start                                    # boot Supabase in Docker
pnpm db:push                                     # apply new migrations
pnpm db:types                                    # regenerate app/types/database.types.ts
```

`pnpm db:reset` **drops the local database** and replays every migration from
scratch. Use `db:push` to apply new migrations to a database you care about.

There is no self-serve signup — `/login` only signs in, and `profiles` has no
UPDATE policy by design, so no guest can promote themselves. Create the first
admin out of band:

```bash
./scripts/create-admin.sh you@example.com 'your-password'
```

## YouTube import

`POST /api/youtube/import` pulls the channel's uploads into `matches`, one row
per video, and is safe to re-run: it only inserts video ids it does not already
hold, so retitled or part-tagged matches are never clobbered. The admin video
list has an "Import / refresh from YouTube" button for it. Imported rows land
`public` and `untagged` — the video is already public on the channel — so hiding
one is a deliberate act in the admin list.

It needs a YouTube Data API v3 key in `.env`:

```
YOUTUBE_API_KEY=...
YOUTUBE_CHANNEL_HANDLE=timlacault   # optional, defaults to timlacault
```

Each match carries two independent flags: `visibility` (`private` | `public`)
controls whether guests can see it, and `tagging_status` (`untagged` |
`in_progress` | `tagged`) tracks tagging progress and is set automatically by
the tagging tool.

## MyFFBaD player lookup

The roster form (`/admin/players`) has a name search that fills the licence,
club, category, CPPH and the three rankings from the federation's records. Type
a full name, pause a second, pick from the dropdown.

The federation's own web services are **not open to the public** — we asked. So
this reads the public site instead, <https://myffbad.fr/recherche/joueur>, which
answers anonymously. No API key, no login, and locally nothing to configure.

myffbad.fr silently drops connections from AWS, where Vercel runs, so in
production every request goes through a Cloudflare Worker (`relay/`, deployed
at `myffbad-relay.timlacault.dev` with `cd relay && npx wrangler deploy`). It
relays the search page only, and only with the shared key: Vercel holds
`MYFFBAD_RELAY_URL` and `MYFFBAD_RELAY_KEY`, the worker holds the same key as
its `RELAY_KEY` secret. Unset `MYFFBAD_RELAY_URL` and the app goes direct.
`MYFFBAD_ID` / `MYFFBAD_PWD` are not read by the app.

The search widens in three legs, each one reached only when the one before it
found nobody: the **roster** we already hold, then **US Talence** on MyFFBaD,
then **all of France**. Each leg also has a button, so you can widen it by hand
when you can see the current leg is not going to answer.

The club leg is a club-scoped request — `?search=…&league=3301&committee=31&club=830`,
the same URL the site's own filter builds — not a France-wide search filtered
afterwards. That distinction is the whole point: a common surname fills page one
with strangers, and our own licensee never appears on the only page we fetch.
The France-wide leg keeps everyone, ranked by `clubs.priority` so the clubs we
play sit at the top.

Two things it cannot do:

- **Age.** MyFFBaD publishes no birth date, and the roster does not track age at
  all. `category` ("Senior", "Veteran 2") is the closest public stand-in.
- **Deep paging.** A bare surname can match thousands. The lookup reads page one
  and shows ten, then tells you to add a first name.

The same escalation backs the four player slots on a match form — picking a
licensee there adds them to the roster and fills the slot in one go. The
stand-in (`place holder`) sits in the dropdown's header on every leg, since
"I cannot name this person" is an answer you may have before you type and still
have after France has been searched.

## Clubs

`/admin/clubs` holds the Gironde clubs, imported from
<https://badiste.fr/liste-club-badminton/33-gironde.html> with **Refresh from
badiste**. Every row there links to the club's MyFFBaD page, and that id is the
same one MyFFBaD puts on a player, so the two join exactly rather than by name.

`priority` drives the search ranking — ours is seeded at 100, everything else 0.
A refresh carries your priorities through untouched, leaves clubs you added by
hand (`source = 'manual'`) alone, and archives rather than deletes a club
badiste has dropped, since players may still point at it.

The page is served as **iso-8859-15**; decoding it as UTF-8 is what turns
`AMBARÈS-ET-LAGRAVE` into mojibake.

### When it breaks

It will, eventually — it is a scraper. MyFFBaD is a Next.js app and the results
arrive in the React Server Components payload rather than the markup, so
`server/utils/myffbad.ts` reassembles the `self.__next_f.push` chunks and reads
the `"results"` array out of the stream.

The failure is designed to be legible. A page with no results block *and* no
"Aucun résultat" notice raises `MyffbadScrapeError`, and the form says the site
changed rather than claiming nobody matched. To fix it:

```bash
# 1. See what MyFFBaD sends now.
curl '/api/myffbad/search?q=<name>&debug=1'      # normalised + raw records

# 2. Refresh the fixtures and re-run the parser tests.
curl -o server/utils/__fixtures__/myffbad-search-lacault.html \
  'https://myffbad.fr/recherche/joueur?search=Tim+Lacault'
# The club-scoped leg, which is a different URL and can break on its own.
curl 'https://myffbad.fr/recherche/joueur?isFirstLoad=false&search=lacault&league=3301&committee=31&club=830'
pnpm vitest run server/utils/myffbad.test.ts
```

Field names live in `normalisePlayer`, and only there.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.
