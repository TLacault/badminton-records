# Tagging UX Fixes — Design

**Date:** 2026-08-09
**Scope:** Slice A of the 2026-08-09 feature request — frontend-only fixes to the admin tagging tool
**Stack:** Nuxt 4, Vue 3, Supabase, Tailwind v4

---

## 1. Context and decomposition

A feature request on 2026-08-09 covered four independent subsystems. They are specified and built
separately; this document covers **slice A only**.

| # | Slice | Touches | Depends on |
|---|---|---|---|
| **A** | **Tagging UX fixes** — click-to-play, full-width tag layout, win/loss icons, nav labels | frontend only | — |
| B | Video library & lifecycle — channel import, refresh button, YouTube feed, tagged/untagged + public/private states | schema, server route, YouTube API key | — |
| C | Guest enhanced player — points/sets/highlights modes, colour-coded timeline, score overlay, 4 names + serving side | frontend, reads `deriveMatch` | B (status semantics) |
| D | FFBaD autocomplete — search by name → licence → ranks/age | external data source | research spike first |

Slice A is specified alone because it changes no schema, no data flow, and no shared contract. It is
a batch of independent corrections to existing components, each verifiable by eye.

Build order agreed with the user: **A → B → C → D**. B precedes C because B redefines what
`matches.status` means, and C's match list reads it.

**D carries known risk:** FFBaD publishes no public API. Any implementation means scraping
myffbad/Poona/Badnet, which can break without warning and raises terms-of-use questions. It needs a
research spike before it can be specified honestly.

## 2. Decisions taken

| Decision | Choice | Rationale |
|---|---|---|
| Click on player | Single click toggles play/pause | Universal video convention; no double-click-for-fullscreen (YAGNI) |
| Focus shield | **Kept**, now handles the click instead of discarding it | It is what stops the iframe swallowing tagging keystrokes |
| Full-width opt-in | Page meta `wide: true`, read by the admin layout | Only `tag.vue` needs it; other admin pages stay readable |
| Video sizing when wide | Capped by **height** (~60vh), not width | `aspect-video` at `2fr` of a 2560px screen is 956px tall and pushes the point list off-screen |
| Icon source | `@lucide/vue` | User asked for Lucide. `lucide-vue-next` is deprecated in favour of this package; direct Vue components, no Nuxt module config, no runtime deps |
| Winner column framing | Win/loss (green check / red cross) | Replaces side-neutral emerald/sky; user asked for "win & loose" |
| Guest nav | Keep "UST Badminton" as brand, add "Videos" as nav item | Losing the site name from the guest header is a regression |
| Tests | **Deferred**, consistent with the 2026-08-08 spec | Straight implementation; tests in a later pass |

## 3. Changes

### 3.1 Click on the player toggles play/pause

**File:** `app/components/player/YouTubeStage.vue`

The focus shield (line 26) stays exactly where it is. It changes from discarding the click to
acting on it:

```diff
-<div data-testid="focus-shield" class="absolute inset-0 cursor-default" @click.prevent />
+<div data-testid="focus-shield" class="absolute inset-0 cursor-pointer" @click="api.toggle()" />
```

**Why keybinds survive:** a `<div>` is not focusable without `tabindex`, so clicking the shield
leaves `document.activeElement` on `<body>`. The keydown listener is registered on `window`
(`tag.vue:152`) and its guard only skips `INPUT`/`TEXTAREA`/`SELECT` targets, so it keeps firing.
The iframe still never receives a pointer event and so can never take focus.

**Out of scope:** the guest page (`app/pages/matches/[id].vue:88`) renders a bare `<iframe>`, not
`YouTubeStage`, and does not benefit. Slice C moves it onto the shared component.

### 3.2 Full-width tagging layout

**Files:** `app/layouts/admin.vue`, `app/pages/admin/matches/[id]/tag.vue`,
`app/components/tagging/PointList.vue`

The width constraint lives in the layout, not the page — `admin.vue:30` wraps every admin page in
`max-w-6xl`. Add an opt-in rather than removing it:

- `admin.vue` reads `route.meta.wide` and applies `max-w-none` when set, `max-w-6xl` otherwise.
- `tag.vue` declares `definePageMeta({ middleware: 'admin', layout: 'admin', wide: true })`.
- No other admin page sets it, so `/admin`, `/admin/players`, `/admin/matches/new` are unchanged.

The tag page grid rebalances so the video cannot grow unboundedly tall:

- The `aspect-video` stage box is bounded by `max-w-[calc(60vh*16/9)]` and centred in its column.
  Bounding the *width* to 60vh worth of height keeps the 16:9 ratio intact; a bare `max-h` would
  hold the box full-width and letterbox the video inside it.
- The grid becomes `lg:grid-cols-[minmax(0,1fr)_minmax(30rem,42rem)]` — the point list gets the
  generous fixed column and the video takes what is left, since width past its cap is only padding.
- `PointList`'s `max-h-[70vh]` (line 41) becomes `max-h-[calc(100vh-12rem)]`, subtracting the
  chrome above it (nav, page padding, title row, panel header) so the list scrolls internally and
  the page itself never does.

Net effect: point rows are wider (the server name at `PointRow.vue:56` stops truncating) and more
rows are visible at once — the stated goal.

### 3.3 Lucide icons in the points table

**Files:** `package.json`, `app/components/tagging/PointRow.vue`,
`app/components/tagging/KeyHelp.vue`

Add the dependency:

```
pnpm add @lucide/vue
```

In `PointRow.vue`, the winner column (line 53) currently renders the literal letters `A` / `Z`
coloured emerald/sky by side. It becomes outcome-framed:

| Rally | Icon | Colour |
|---|---|---|
| Side 1 wins (us) | `Check` | emerald |
| Side 2 wins (them) | `X` | red |
| Let | `Minus` | muted slate |

The three other unicode glyphs in the same row go with them, for visual consistency:

| Line | Was | Becomes |
|---|---|---|
| 81 | `★` | `Star` |
| 88 | `↺` | `RotateCcw` |
| 95 | `✕` | `Trash2` |

Behaviour, emitted events, and every `data-testid` are unchanged — this is presentation only.

`KeyHelp.vue` keeps `A` and `Z` as its key labels, because those are the physical keys pressed, and
gains the matching icon beside each entry so the help and the table agree.

### 3.4 Nav labels

**Files:** `app/layouts/admin.vue`, `app/layouts/default.vue`

Both headers link to a video/match list under a label that does not say so.

- `admin.vue:16`: `Admin` → `Videos`. The header's inner width follows the same `wide` flag as
  `<main>`, so the nav lines up with the content on the tagging page.
- `default.vue:5`: the brand keeps reading `UST Badminton` and continues to link to `/`; a `Videos`
  nav item is added beside it. The site name is not removed.

## 4. Verification

No automated tests (see §2). Each change is confirmed by hand in `pnpm dev`:

1. **Click-to-play** — click the video on `/admin/matches/:id/tag`; playback toggles. Then press
   `A`, `Z`, `R`, `P`, `Ctrl+Z`, `Ctrl+Y` and confirm each still registers after clicking.
2. **Full-width** — `/admin/matches/:id/tag` spans the viewport; `/admin`, `/admin/players` and
   `/admin/matches/new` are unchanged at `max-w-6xl`. On a wide screen the player and the point
   list both fit without page scroll.
3. **Icons** — a tagged match shows green checks for our points, red crosses for theirs, a muted
   dash for lets. Star, let and delete buttons still function.
4. **Nav** — the admin header reads `Videos`; the guest header reads `UST Badminton` with a
   `Videos` item beside it.
5. `pnpm typecheck` passes.

## 5. Out of scope

Everything in slices B, C and D, specifically: YouTube channel import and the refresh button,
public/private and processed/unprocessed states, the guest mode switch, the custom colour-coded
timeline, the score overlay with player names and serving side, and FFBaD autocomplete. Each gets
its own spec.
