# Card Games (24 + Memory)

Two card games sharing one codebase:

- **24** — Single-player puzzle. Make 24 from 4 dealt cards using +, -, *, /, ( ).
- **Memory** — Single or multiplayer (up to 4) via Socket.IO room codes.

## Layout

```
games/
  shared/   TypeScript types shared by both apps
  server/   Express + Socket.IO (runs locally)
  web/      Next.js 15 frontend (deployable)
```

## Prerequisites

- Node.js 20+
- npm 10+
- ngrok 3.20+ (https://ngrok.com/download) — to expose your local backend to your deployed frontend

## Install

From the repo root:

```bash
npm install
```

This installs all workspaces.

## Run locally

You'll typically want **three terminals**:

**1. Backend**

```bash
cd server
cp .env.example .env       # edit CORS_ORIGINS if needed
npm run dev
# → http://localhost:4000
```

**2. Frontend**

```bash
cd web
cp .env.local.example .env.local
npm run dev
# → http://localhost:3000
```

**3. ngrok** (only needed when you want your deployed frontend to reach this backend)

```bash
ngrok http 4000
```

ngrok prints something like `https://abc123.ngrok-free.app`. That's your public backend URL.

### Or, from the repo root

```bash
npm run dev        # runs server + web together
npm run ngrok      # opens an ngrok tunnel for the server
```

## Deploy frontend to Vercel (recommended)

1. Push this repo to GitHub.
2. Create a new Vercel project, set the **root directory** to `web`.
3. Add env var: `NEXT_PUBLIC_API_URL=https://YOUR-NGROK-URL.ngrok-free.app`
4. Deploy.
5. Update the backend's `.env` → `CORS_ORIGINS=https://your-app.vercel.app` and restart `npm run dev` in `server/`.

### Ngrok URL changes every restart (free tier)

Free ngrok gives you a new URL each time. Two options:

- Each session: update `NEXT_PUBLIC_API_URL` in Vercel and redeploy (takes ~30s).
- Or: get a [reserved domain](https://ngrok.com/pricing) (~$10/mo) and your URL never changes.

The frontend automatically sends the `ngrok-skip-browser-warning` header so users won't see the free-tier interstitial.

## API surface

REST:

- `POST /api/twenty-four/new` → `{ id, cards[] }`
- `POST /api/twenty-four/validate` → `{ valid, result?, reason? }`
- `GET  /api/twenty-four/hint/:id` → `{ solution }`
- `POST /api/twenty-four/solve` with `{ nums: number[4] }` → `{ solution }`

WebSocket events (memory game): see `shared/src/index.ts` (`ClientToServerEvents` / `ServerToClientEvents`).

## Memory multiplayer flow

1. Player A opens `/memory`, enters their name + pair count, clicks **Create**.
2. The server returns a 5-char room code (e.g. `K3F9P`).
3. Player A shares the code; Player B opens `/memory`, types the code, clicks **Join**.
4. Anyone in the room clicks **Start game**.
5. Players take turns flipping two cards. Matches keep your turn; misses pass it.
6. Game ends when all pairs are matched — winner is whoever has the most pairs.

## Next ideas

- Persist puzzles across server restarts (currently in-memory)
- Spectator mode for memory rooms
- Streak bonuses, daily puzzle for 24
