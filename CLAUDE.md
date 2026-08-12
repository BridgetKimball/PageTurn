# CLAUDE.md

Project context for Claude Code. Read this first — it captures things that are expensive to
rediscover (live API behavior, deploy quirks, bugs already found and fixed once). For general
docs, see `README.md` and `docs/` (SETUP, ARCHITECTURE, FEATURES, DEPLOYMENT, MIGRATIONS).

## What this is

PageTurn — a personal reading tracker (better Goodreads). React + TypeScript + Vite + Tailwind,
Supabase (Postgres + Auth) as the backend, deployed as a static site to GitHub Pages via GitHub
Actions. No custom server — everything is client-side calls to Supabase or external book APIs.

Live: https://bridgetkimball.github.io/pageturn/
Repo: https://github.com/BridgetKimball/pageturn

## Do this before touching book-search or cover code

**Google Books' anonymous API quota is exhausted and has been for the entire life of this
project (confirmed via direct `curl` — `quota_limit_value: "0"`, not a daily-reset situation).**
Every unauthenticated request 429s. Don't assume Google Books works when testing — it won't,
unless the user has added `VITE_GOOGLE_BOOKS_API_KEY`. `src/lib/bookSearch.ts` is the actual
entry point for search (tries Google, falls back to Open Library) — don't call
`src/lib/googleBooks.ts` directly, and don't be surprised when Open Library is what's actually
serving every result.

## Hard-won bugs and constraints (read before re-deriving these)

- **`shelf_books` has no FK relationship to `user_books`** — only to `shelves`, `books`, and
  `auth.users`. A PostgREST embedded select like `.select('*, user_book:user_books(*)')` on
  `shelf_books` silently fails (relationship not found) and — if the error isn't checked —
  returns nothing, making every shelf look empty regardless of real data. This was a real,
  shipped bug for a long time before being caught. Fetch `user_books` separately and merge
  client-side (see `ShelfView.tsx`).
- **Open Library's search returns *zero* results for a title with a trailing Goodreads-style
  series suffix** like `"The Scorch Trials (The Maze Runner, #2)"` — confirmed directly against
  the live API. Strip it first (`stripSeriesSuffix` in `src/lib/titleMatch.ts`) or search finds
  nothing for the majority of imported titles.
- **Title matching must use token-overlap confidence, not "same first word" or substring
  checks.** A naive heuristic will confidently match unrelated books by the same author/series
  (e.g. searching "The Queen's Secret" returns exactly one Open Library result — "The Queen's
  Assassin", a *different* book — and a weak matcher accepts it, silently corrupting data with a
  wrong cover). `titleConfidence()` in `titleMatch.ts` scores shared distinctive words
  (stopwords excluded) with a 0.7 threshold; below that, no match beats a wrong match. Any new
  matching logic should reuse this, not reinvent something looser.
- **Books imported from Goodreads under different editions become separate DB rows.** Goodreads
  catalogs hardcover/paperback/reissue as different entries with different ISBNs; the importer
  keys a book's identity off ISBN. Same real book, two `books` rows, duplicate library entries.
  `src/lib/dedupeLibrary.ts` merges these (see it for the resolution strategy — union of shelf
  membership, best-of ratings/reviews/status, never deletes the underlying shared `books` row
  since RLS means we can't confirm another user doesn't still reference it).
- **External fetches need a timeout.** `src/lib/fetchWithTimeout.ts` wraps every Google
  Books/Open Library call (15s). Without it, a hung request stalls an entire batch operation
  (confirmed: real timeouts happen under sustained load, not just fast 429s).
- **Some books genuinely have no cover on any free, keyless source.** Self-published/small-press
  titles are often absent from both Google Books and Open Library entirely. This isn't a bug to
  keep chasing — `src/lib/coverPatch.ts` exists for exactly this: a minimal
  `title, author, cover_url` CSV format (auto-detected by the same Import button) that lets a
  manually-sourced cover (verified via web search, real HTTP 200 checked) get applied to an
  existing book by title/author match, without creating a duplicate book record.

## Deployment gotchas

- Every push to `main` triggers `.github/workflows/deploy.yml` (build → `actions/deploy-pages`).
- **GitHub's Pages CDN lags behind the Actions job completing — by minutes, repeatedly, not a
  one-off.** A job reporting `success` does not mean the new bundle is live yet. Verify with a
  cache-busted fetch of the actual site, not by trusting the Actions UI:
  ```bash
  curl -s "https://bridgetkimball.github.io/pageturn/?v=$(date +%s)" | grep -o 'index-[A-Za-z0-9_-]*\.js'
  ```
  Compare the hash to the previous known one before concluding a change is live.
- **The GitHub Actions web UI (and even the top-level run status from the API) caches/lags too.**
  When checking run status, query the jobs endpoint directly rather than trusting a list view:
  ```bash
  RUN_ID=$(curl -s "https://api.github.com/repos/BridgetKimball/pageturn/actions/runs?per_page=1" | python3 -c "import json,sys; print(json.load(sys.stdin)['workflow_runs'][0]['id'])")
  curl -s "https://api.github.com/repos/BridgetKimball/pageturn/actions/runs/$RUN_ID/jobs" | python3 -c "
  import json,sys
  for j in json.load(sys.stdin)['jobs']: print(j['name'], j['status'], j.get('conclusion'))"
  ```
- `HashRouter` is used deliberately (not `BrowserRouter`) — GitHub Pages can't rewrite arbitrary
  paths back to `index.html`, so a plain path would 404 on refresh.
- `vite.config.ts` sets `base: '/pageturn/'` to match the repo name (served from a subpath).

## Database migrations

`docs/DATABASE_SCHEMA.sql` is for a **brand-new** Supabase project only — it cannot be safely
re-run against a live database (`create policy` has no `if not exists`). Any schema change since
initial setup needs a new incremental migration appended to `docs/MIGRATIONS.md`, run manually by
the user in the Supabase SQL editor. I have no direct DB access — I cannot run migrations or
inspect live data myself; every fix in this project has been validated by (a) reading the schema
file, (b) testing logic against real external APIs directly, and (c) the user running the app and
reporting results/screenshots back.

## Testing constraints

There's no live Supabase project available in this environment — `.env` is placeholder-only
during development here. Verification approach that's actually been reliable:
1. `npx tsc --noEmit` — typecheck.
2. `npm run build` with placeholder env vars — confirms the build succeeds.
3. Browser smoke test of the login page only (via `mcp__Claude_Browser__*` tools) — checks for
   console errors on the parts of the app reachable without auth.
4. For anything requiring real data (search results, cover matching, RLS behavior), test the
   *logic* directly against the live external APIs (`curl`, or `javascript_tool` against the
   deployed site to rule out CORS) rather than assuming — several bugs in this project were only
   caught this way (see "Hard-won bugs" above).
5. Final confirmation always comes from the user actually using the deployed app and reporting
   back — screenshots or plain-text descriptions of what happened.

## Current known gaps (as of last session)

- A meaningful chunk of the user's imported library (self-published/small-press titles) has no
  cover available from Google Books or Open Library. This is a genuine data-availability limit,
  not a bug — see `coverPatch.ts` above for the manual-fix path.
- Adding a real `VITE_GOOGLE_BOOKS_API_KEY` (both `.env` locally and as a GitHub repo secret)
  would meaningfully improve automated cover-matching, since Google's catalog covers small-press
  books far better than Open Library's. Not yet done as of last session.

## Conventions

- No comments unless explaining a non-obvious *why* (a workaround, a constraint, a bug already
  hit once). Several files above have exactly this kind of comment — keep that pattern.
- Prefer fixing root causes over adding fallback/retry logic that masks them — but do add
  timeouts/fallbacks where the underlying constraint (quota, missing data) is real and permanent.
- `src/lib/titleMatch.ts` is the single source of truth for title-matching logic — three
  different features (`backfillCovers.ts`, `dedupeLibrary.ts`, `coverPatch.ts`) share it. Don't
  reintroduce a fourth copy.
