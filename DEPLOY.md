# Flax HR — Deploy

Everything you need to ship from a fresh machine. Works alongside `PHASES.md`.

## Targets

- **Frontend**: Cloudflare Workers (Vite SPA served as static assets).
- **Backend**: Supabase project `fcrwxuyyixozudwyhkcz` (Postgres + Auth + Storage).

## One-time setup on a new machine

1. **Clone**
   ```bash
   git clone https://github.com/gurmeetflax/flaxhr.git
   cd flaxhr
   git checkout claude/show-last-progress-kv3EJ   # or main, whichever is newer
   ```

2. **Node toolchain** — Node 20+ (24 is fine, it's what `@types/node` is pinned to).
   ```bash
   node -v
   npm install
   ```

3. **Env file** — copy `.env.example` to `.env.local` and fill in the Supabase anon key:
   ```bash
   cp .env.example .env.local
   ```
   `VITE_SUPABASE_URL` is already set. Get `VITE_SUPABASE_ANON_KEY` from Supabase → Project Settings → API → `anon public`.

   Both `VITE_*` vars are baked into the built JS bundle at build time, so they must be present before `npm run build`. The anon key is **safe to ship in the bundle** — RLS is what actually protects the data.

4. **Cloudflare login** (once per machine):
   ```bash
   npx wrangler login
   ```
   Pick the Cloudflare account that owns the `flaxhr` Worker.

5. **Supabase CLI** — only needed if you want to push migrations from CLI. Otherwise run them in the dashboard (step below).
   ```bash
   npm i -g supabase           # or: brew install supabase/tap/supabase
   supabase login
   supabase link --project-ref fcrwxuyyixozudwyhkcz
   ```

## Deploy the frontend

```bash
npm run typecheck   # catches TS breakage before upload
npm run build       # emits dist/
npm run deploy      # = build + wrangler deploy
```

`wrangler.jsonc` has `assets.not_found_handling: "single-page-application"` so React Router deep-links work.

Verify: open the `*.workers.dev` URL (printed by wrangler) or your custom domain. Check DevTools → Network → any request → confirm it hits `https://fcrwxuyyixozudwyhkcz.supabase.co`.

## Apply database migrations

The app depends on every `.sql` file in `supabase/migrations/` being applied in filename order. As of this doc the head is `20260421000009_v_employees.sql`.

**Option A — Supabase CLI (preferred)**
```bash
supabase link --project-ref fcrwxuyyixozudwyhkcz   # if not already
supabase db push                                     # applies any pending migrations
```
`supabase db push` is **idempotent by migration filename** — it skips ones already recorded in the project's `supabase_migrations.schema_migrations` table. Safe to re-run.

**Option B — Dashboard SQL editor**
Supabase → SQL Editor → paste each pending migration file in order → Run. Use this if the CLI link fails. Every migration in this repo is written with `create … if not exists` / `drop policy if exists` / `create or replace`, so re-running a file is safe.

**How do I know which migrations are already applied?**
```sql
select version from supabase_migrations.schema_migrations order by version;
```
Anything missing from that list vs. `supabase/migrations/` needs to run.

## First-boot checks

1. **Sign in as admin** on `/login` (Admin/HR tab) — email+password or Google.
2. If this is a brand-new project, your user will land without an `admin` role. Grant yourself admin directly via SQL Editor:
   ```sql
   insert into core.user_roles (user_id, role)
   values ((select id from auth.users where email = 'you@example.com'), 'admin')
   on conflict do nothing;
   ```
3. Refresh — `/admin/*` should now be reachable.

## Rollback

- **Frontend**: `wrangler rollback` (Cloudflare keeps prior versions).
- **Database**: there are no down migrations. If a migration is bad, write a new forward migration that fixes it. Do not hand-edit already-applied migration files — the CLI tracks them by hash.

## Secrets / keys

Nothing sensitive lives in the repo:
- `.env.local` is gitignored.
- Cloudflare doesn't need runtime secrets — env vars are baked into the bundle at build time.
- There are no Supabase Edge Functions yet, so no service-role key is deployed anywhere (the PIN-reset function in `PHASES.md` will need one — plan for `wrangler secret`-free, Supabase-managed secrets via `supabase secrets set`).

## Custom domain (if/when you add one)

1. Cloudflare dashboard → Workers & Pages → `flaxhr` → Settings → Domains & Routes → Add custom domain.
2. Add the domain to the Supabase project's **Authentication → URL Configuration → Site URL** and **Redirect URLs**, otherwise Google OAuth will reject the callback.

## Common gotchas

- **Google sign-in 400** after adding a new domain → you forgot step 2 of "Custom domain".
- **Blank page after deploy** → the build likely failed silently in CI; run `npm run build` locally and check. Also confirm `dist/` ended up at the repo root — `wrangler.jsonc` assumes it.
- **RLS "permission denied"** right after login → the user has no row in `core.user_roles`. Grant a role via SQL.
- **`supabase db push` fails with "already applied"** → not a failure; it's just telling you state. Check `schema_migrations` above.
