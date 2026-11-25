# Badminton Records channel video kit: design

Date: 2026-11-25 · Status: awaiting Tim's approval

## Intent

Tim publishes his scored badminton matches on his own YouTube channel, **Badminton Records** (not the
U.S. Talence club). Today each upload is the raw match video. He wants the channel to look like BWF TV:
a branded intro with a match card, a live scoreboard burned into the video, transitions at breaks and
between sets, a branded outro that frames YouTube's end screen, and a consistent thumbnail per video.

The tagger already knows everything needed: who played, what kind of match, and every rally end, set
end and break with its timestamp. The kit turns that data into a finished video plus everything Tim
needs to upload it by hand.

**Why:** a channel that looks produced, at no per-video editing cost. Success = Tim tags a match, opens
the editor, adjusts trim/crop/text, clicks render, and gets an upload-ready folder in minutes.

## Goals

1. Brand kit (done): `brand/` holds the logo, lockups, mono marks, icons, avatar, banner, and the
   three thumbnail templates. `python3 brand/build.py` regenerates derived files.
2. A per-match **editor** page in the admin, next to the tagger.
3. A local **render** that outputs the edited video.
4. An **upload kit** per match: video, thumbnail PNG, title, description.
5. The app's own branding switches to the new logo.

## Non-goals

- No YouTube API: no upload, no thumbnail set, no end-screen set. Tim uploads and places the end
  screen in YouTube Studio himself.
- The app keeps showing the **raw** scored video (the existing YouTube id and tagging timestamps stay as
  they are). The edited render is a separate YouTube upload. Nothing links the two automatically.
- No rendering on Vercel. Render runs on Tim's machine (`pnpm dev:hosted`), like `/clip` today.
- No player photos on thumbnails.

## Anti-goals (a failure even if it works)

- Editing 30 minutes of manual keyframes per video. Anything that can be derived from the tag data is.
- A scoreboard that ever disagrees with the tag log, or that spoils a set's result early.
- A render that takes hours (rules out rendering the whole match through a browser).
- Templates that drift from Tim's PNGs. His thumbnail templates are the source of truth. The tool only
  draws the two bottom bands.

## Constraints

- Stack: Nuxt 4, Vue 3.5, TypeScript, Tailwind v4, Supabase, Vitest; `ffmpeg`, `yt-dlp`, Node 24 locally.
- Matches last 30–60 min, often 1080p or 4K (`matches.is_4k`).
- Render machinery exists in `server/utils/reel.ts` (cache dirs, capability probe, background job
  registry polled by the browser, local source upload via `PUT /api/reel/source/:id`). Reuse it.
- Scoring is derived by the pure engine in `shared/badminton` (`derive.ts` → per-rally `scoreBefore/
  scoreAfter`, `startsAtSeconds/endsAtSeconds`, `endedSet`; `breaks.ts` for breaks). The video kit reads
  it and never re-implements scoring.
- HyperFrames (`npx hyperframes`, Node 22+) renders HTML+GSAP compositions to MP4/WebM/MOV, with
  **transparency** (`--format mov|webm`) and **per-render variables** (`data-composition-variables` +
  `--variables-file`).

## Approaches considered

1. **ffmpeg assembles, HyperFrames renders only the short animated pieces (chosen).** HyperFrames makes
   the intro (~6 s), outro overlay (~15 s) and transition stings (~2 s) as small clips. The scoreboard
   becomes one transparent PNG per score state, screenshotted from the same HTML. One ffmpeg pass trims
   and crops the source, overlays score PNGs by time range, inserts the transitions, and joins the intro
   and outro. A full match renders in minutes.
2. **Everything in HyperFrames.** The whole match is one composition with the source video inside it.
   One tool and one timeline, but browser frame capture for 30–60 min of 1080p/4K takes hours. Rejected.
3. **Standalone CLI, no editor.** Rejected: Tim wants toggles, trim/crop, and a thumbnail tool with
   preview.

## Decided with Tim

### Families (colour-coded, French copy)

| Family | Colour | Template | Match types mapped (my call) |
|---|---|---|---|
| Tournois | `#CB2543` | `brand/thumbnail/tournois.png` | `tournament`, `championship` |
| Interclub | `#537EFF` | `brand/thumbnail/interclub.png` | `interclubs` |
| Jeux libres | `#9F53FF` | `brand/thumbnail/jeux_libres.png` | `free-play`, `training` |

The family colour drives the thumbnail bands, the intro card, the outro, the transitions and the
scoreboard accent, so a video and its thumbnail match. The editor can override the family per video.

### Thumbnail

- Background = Tim's family template PNG (2560×1440, already has the frame, family tag and logo):
  `brand/thumbnail/{tournois,interclub,jeux_libres}.png`. `brand/thumbnail/background.png` is the bare photo
  they were built from, not a template.
- The tool draws **only the two bottom bands**, measured from his examples in `brand/thumbnail/example/`:
  - band 1 at y≈950–1090, band 2 at y≈1155–1296 (on 2560×1440)
  - right-anchored and running off the right edge, with a slanted left edge (~108 px over the band's height)
  - each band as long as its text
  - band fill = family colour; white text in **Poppins Bold Italic**, wide tracking, uppercase
  - the builder matches the examples pixel-close: overlay a render on an example and compare.
- Default text per family, prefilled and editable, with each band toggleable:
  - Tournois: `{event} {year}` / `{discipline} • {round}`, e.g. `TOURNOIS DES VENDANGES 2026` / `DOUBLES HOMMES • QUARTS DE FINALE`
  - Interclub: `{opponent club}` / `{discipline}`, e.g. `UNION SAINT-BRUNO` / `DOUBLES HOMMES`
  - Jeux libres: `{discipline}` / `{side 1} VS {side 2}`, e.g. `DOUBLES HOMMES` / `TIM & ADRIEN VS THOMAS & ANTHONY`
- The template can be swapped for any PNG in `brand/thumbnail/` (variants Tim adds later show up).
- Output: 1280×720 PNG (YouTube's recommended size, under 2 MB), plus the 2560×1440 master.
- Rendered in the browser on a `<canvas>` (live preview while typing). The same drawing code produces
  the downloaded PNG.
- Tim's examples in `brand/thumbnail/example/` stay until he confirms the tool reproduces them.

### Intro (rendered per video, ~6 s)

1. **Brand sting (~2 s), identical on every video.** Family-colour slashes cut in, the logo slams into
   place, a signature sound plays.
2. **Match card (~3–4 s).**
   - Always: players or pairs, discipline, family tag.
   - When present: event, round, venue, date. Missing fields collapse.
3. Cut to the match.

### Outro (rendered per video, ~15 s)

- Background = Tim's **starred rallies** (`rallies.is_highlight`), slowed down to fill the outro length,
  darkened. The graphics are a transparent overlay on top.
- First a **result card**: players, final score by set, winner highlighted.
- Then the **end-screen frames**, with no score: subscribe circle on the left, two video boxes on the
  right (YouTube's default layout), labels SUBSCRIBE / NEXT MATCH / MORE MATCHES (in French, like the
  thumbnails: S'ABONNER / MATCH SUIVANT / PLUS DE MATCHS), and the logo on top. These frames must sit
  in a fixed layout the builder defines (subscribe circle left, two 16:9 boxes right). Studio lets
  elements be dragged anywhere, so the frames set the positions: Tim aligns the Studio elements to them
  once, then reuses that end screen on later videos with "import from video". (My call.) They hold for at least the last 10 s,
  and YouTube needs at least 5 s.
- If the match has fewer starred rallies than needed, it falls back to the last rallies of the match.

### Editor (toggles)

Intro on/off, outro on/off, crop, trim, transitions on/off, scoreboard on/off. The source is the local
original file, attached as in `/clip` (streamed to `.reel-cache/source/<videoId>.mp4`), so it is never
re-encoded from YouTube's copy.

## The how, as designed (my calls, correct me)

### Where things live

- Page: `app/pages/admin/matches/[id]/publish.vue` (admin-only, like `tag.vue`). Linked from the tagger
  and the admin match list.
- Compositions: `brand/video/` holds HyperFrames projects: `intro/`, `outro/`, `transition/`, and
  `scoreboard/` (a static HTML page used for PNG screenshots, not a video). Each declares its variables
  (players, family colour, event, round, scores…).
- Audio: `brand/audio/`, with a `SOURCES.md` listing every file's origin and licence.
  - Sounds (whoosh, impact, low hit): CC0 from Freesound or Mixkit.
  - Music beds: the **YouTube Audio Library**, which is cleared for YouTube monetisation and never
    triggers Content ID. Pixabay tracks have been known to.
  - Tim picks the tracks. The builder proposes 3 candidates per slot.
- Server: `server/api/publish/*` reusing `server/utils/reel.ts` jobs, capability probe (add
  `hyperframes`), and cache dirs.
- Pure logic in `shared/publish/` (timeline maths, text templates), covered by Vitest.

### Data

Fields the match lacks today, added in one migration on `matches`:

- `event_name text`: tournament or championship name, e.g. "Tournois des Vendanges".
- `round text`: free text with suggestions (Poules, 1/16, 1/8, Quarts de finale, Demi-finale, Finale).
- `category text check in ('men','women','mixed')`: with `format` this gives the discipline
  (Simple/Double × Hommes/Dames/Mixte). Nullable; falls back to "SIMPLE"/"DOUBLE".
- `publish_settings jsonb not null default '{}'`: everything the editor saves (trim in/out, crop rect,
  toggles, family override, thumbnail text overrides and template, title/description overrides).
  Read only by the editor.

These go in `MatchForm.vue` as well (event, round, category).

The interclub opponent club is derived from the side-2 players' `club_id` (the club's name, or its
acronym if the name is too long), and is editable in the tool.

### Render pipeline (one background job, progress polled like `/clip`)

1. **Plan** (pure, tested): from the derived match, the breaks and the settings, build an edit decision
   list in source time, then mapped to output time.
   - **Trim**: in/out points.
   - **Breaks**: each tagged break (`match_breaks`) is **cut out** and replaced by a ~2 s transition
     sting. A break that ends a set gets the set-score transition ("FIN DU SET 1 · 21–17"). Other
     breaks get a plain brand wipe. Per-break toggle "keep the break" in the editor (decided with Tim: cut).
   - **Set ends without a tagged break**: set ends come from the engine's `endedSet`, not from breaks.
     A set end with no break after it gets the set-score sting overlaid at that moment, with no cut. (My call.)
   - **Sync offset**: `publish_settings.sourceOffsetSeconds` (default 0) shifts every tag timestamp in
     case the local original and the YouTube upload differ (e.g. the upload was trimmed). The editor has
     a nudge control, checked against the first rally end. (My call.)
   - **Scoreboard states**: one per score change, active from the rally's `endsAtSeconds` (+ a small
     delay so the point is seen landing) until the next change. It never shows a set before it starts,
     same rule as `ScoreBoard.vue`.
2. **HyperFrames renders**, cached by a hash of their variables:
   - intro → MP4 with audio
   - outro overlay → transparent MOV (ProRes 4444) or WebM
   - transitions → transparent with audio
3. **Scoreboard PNGs**: one transparent PNG per distinct state, screenshotted from
   `brand/video/scoreboard/` (headless Chrome through HyperFrames' snapshot or Playwright, builder's
   choice). A match has ~100–200 states.
4. **Outro background**: ffmpeg cuts the starred rallies, slows them to fill ~15 s, darkens them.
5. **Assembly**, a single ffmpeg `filter_complex`:
   - crop and scale the source to the output size
   - overlay the score PNGs with `enable='between(t,a,b)'`, or the concat demuxer per segment
   - overlay transitions at the cut points
   - prepend the intro; append the outro background with its overlay
   - mix audio: match sound, ducked under the intro and outro music
   - Output: H.264 MP4 at the source resolution (capped at 2160p), AAC audio, `-movflags +faststart`.
     A "draft 720p" option for quick checks.
6. **Upload kit** in `.reel-cache/publish/<matchId>/`:
   - `video.mp4`
   - `thumbnail.png` (1280×720) and `thumbnail@2x.png`
   - `title.txt`, e.g. `Tournois des Vendanges 2026 · DH Quarts · Tim & Adrien vs Thomas & Anthony`,
     ≤ 100 chars
   - `description.txt`: the match line, the final score, YouTube **chapters** (`00:00 Intro`,
     `00:06 Set 1`, … computed from the edit list; 3+ chapters, first at 00:00, each ≥ 10 s), the
     players with club and ranking, a link to the scored match page on the app, and hashtags
   - The editor shows title and description with copy buttons, plus a "open folder" path.

### Scoreboard look

The same structure as the app's `ScoreBoard.vue` (names, set columns, live set, serve dot), restyled in
the brand: ink glass, family-colour accent, Barlow Condensed / Poppins italic, top-left, sized for 1080p
and scaled for 4K. In the editor the user can choose a corner. Doubles show "Tim & Adrien" style side
labels.

### Editor layout

- Left: preview player of the local source with a scrub timeline showing trim handles, break markers
  and set boundaries. The crop rectangle is drawn on the video.
- Right: tabs **Montage** (toggles, family, breaks list), **Miniature** (canvas preview + band fields),
  **Texte** (title and description with copy).
- Bottom: render button with progress and the output path.
- The live preview shows the scoreboard as an HTML overlay. The intro and outro are previewed by
  playing their last rendered clip, or rendering a draft on demand.

### App branding (small, separate commit)

- `BrandLogo.vue`: the new mark (`brand/png/logo.png`, no CSS invert) and the wordmark "Badminton
  Records".
- Favicons and manifest icons from `brand/png/icon-*`, manifest name "Badminton Records".
- `public/brand/logo-mark.png` replaced.

## Left to the builder

- Exact animation choreography within the timings above (follow the brand: angular slashes, slam-in
  logo, esports pace).
- HyperFrames project structure, codec for transparency (MOV ProRes 4444 vs WebM VP9) after testing
  ffmpeg overlay speed.
- Snapshot tool for scoreboard PNGs; caching scheme; job progress granularity.
- Editor component breakdown, reusing `/clip` and player components where they fit.

## Settled after review

- Breaks are **cut** and replaced by a transition (Tim).
- Training matches go in the Jeux libres family (my call; the per-video family override covers exceptions).
