# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

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
list has an "Import / refresh from YouTube" button for it.

It needs a YouTube Data API v3 key in `.env`:

```
YOUTUBE_API_KEY=...
YOUTUBE_CHANNEL_HANDLE=timlacault   # optional, defaults to timlacault
```

Each match carries two independent flags: `visibility` (`private` | `public`)
controls whether guests can see it, and `tagging_status` (`untagged` |
`in_progress` | `tagged`) tracks tagging progress and is set automatically by
the tagging tool.

## FFBaD player lookup

The roster form (`/admin/players`) has a surname search that fills every field
from the federation's records — licence, club, birth year and the three
rankings. It goes through the **official** FFBaD web services
(<https://apitest.ffbad.org/>), not a scraper.

Credentials are issued by the federation and must be requested from them:

```
FFBAD_LOGIN=...
FFBAD_PASSWORD=...
FFBAD_API_URL=https://apitest.ffbad.org/rest/   # optional; this is the default
```

Without them `/api/ffbad/search` returns 503 and the form stays fully usable by
hand. The credentials never reach the browser — the search goes through a
server route because FFBaD authenticates with a login and password.

The field names inside the API's `Retour` payload are undocumented and could
not be observed without credentials, so `normalisePlayer` in
`server/utils/ffbad.ts` matches against several plausible spellings. If a field
comes back empty once you have access, call
`/api/ffbad/search?q=<name>&debug=1` to see the raw payload and correct the
candidate lists — they are all in that one function.

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
