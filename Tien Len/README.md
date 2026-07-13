# Lantern Table — Tien Len

A static, responsive multiplayer Tien Len website. It uses Supabase Auth, Postgres Row Level Security, private Storage, Realtime, and one server-authoritative Edge Function. There is no secret in the frontend: the publishable key is expected to be public; the service-role key is used only inside Supabase.

## What is included

- Email/password accounts with confirmation support and private profiles.
- A WebP avatar pipeline: the browser downsizes the selected image to a maximum 320px before a private upload. The bucket accepts only JPEG/PNG/WebP and caps files at 1 MB.
- Public/private lobby creation, six-character room invites, host-only start, and automatic bots to complete four seats.
- Hidden hands: `game_hands` is protected by RLS so a browser can read only the row matching its own user id. Deals, moves, bot moves, and win state are handled by `game-action` with the service role.
- Basic Tien Len combinations: singles, pairs, triples, four-of-a-kind, straights, consecutive pairs, flushes, full houses, and four-plus-one. The first play must include 3♣. Four-of-a-kind and three consecutive pairs can beat a single 2.
- A service worker caches the static app shell. Bump `CACHE` in `sw.js` whenever you deploy changed client assets.

## Deploy

1. Create a Supabase project. In **Authentication → Providers → Email**, keep email confirmation enabled and configure your deployed site URL plus allowed redirect URLs.
2. Run [`supabase/schema.sql`](./supabase/schema.sql) once in **SQL Editor**. It creates the tables, policies, private avatar bucket, and Realtime publications.
   If an earlier run stopped with `operator does not exist: text = uuid`, run [`supabase/fix-storage-owner-id.sql`](./supabase/fix-storage-owner-id.sql) once instead of restarting the full schema; it repairs the affected private-avatar policies.
   If a query reports `infinite recursion detected in policy for relation room_members`, run [`supabase/fix-recursive-policies.sql`](./supabase/fix-recursive-policies.sql) once.
3. Install/login to the Supabase CLI, link the project, then deploy the authoritative endpoint:

   ```sh
   supabase functions deploy game-action
   ```

   Supabase automatically provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to deployed Edge Functions. Never add the service-role key to the static site.
4. Edit the included `supabase-config.js` (or copy over `supabase-config.example.js`), adding the **Project URL** and **publishable/anon** key from **Project Settings → API**. Do not commit a real configuration file to a public repository if it includes environment-specific values, even though the publishable key itself is safe to expose.
5. Host this directory on any HTTPS static host (Netlify, Cloudflare Pages, Vercel static output, GitHub Pages, etc.). The host must serve `index.html` for the root route. No Node server is required.

## Security model

| Data | Who can read it |
| --- | --- |
| `profiles` (account profile) | That account only |
| `game_hands` | The matching human player only |
| `room_members` / `game_players` | Players sharing the room/game |
| avatar object | Owner, or a player currently sharing a room/game with its owner |
| public lobby directory | Authenticated users, limited to waiting public rooms |

The UI never treats itself as authority. The Edge Function checks the authenticated user, turn, selected card ids, combination legality, and comparison before it mutates a game. Keep Supabase RLS enabled; do not add broad client write policies to the game tables.

## Before going live

- Set an SMTP provider in Supabase Auth so confirmation/recovery email is deliverable.
- Add your production hostname to Auth redirect URLs and review password strength/rate limits in Auth settings.
- Turn on Supabase backups and review the database advisor after deployment.
- For a competitive production game, add a database transaction/RPC lock around game mutations and rate-limit the Edge Function at your CDN/WAF. This project validates actions server-side, but locking is the next hardening step for simultaneous double-click/race traffic.
