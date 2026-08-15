# Deploying to GitHub Pages

PageTurn deploys automatically via a GitHub Actions workflow (`.github/workflows/deploy.yml`)
every time you push to `main`. You only need to do the one-time setup below.

## 1. Add your Supabase keys as repository secrets

GitHub Pages serves static files only — your `.env` values need to be baked into the
build at compile time, and that build happens on GitHub's servers, not yours. So your
keys need to live as **repository secrets** rather than in the code.

1. Go to your repo: `https://github.com/BridgetKimball/PageTurn`
2. **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add each of these (same values as your local `.env`):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_GOOGLE_BOOKS_API_KEY` (optional — leave the secret out entirely if you don't have one)

> The Supabase **anon** key is safe to expose in a client bundle — it only grants access
> allowed by your Row Level Security policies. Never use the **service role** key here.

## 2. Switch the Pages source to "GitHub Actions"

Your repo is currently set to **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
Change that:

1. **Settings** → **Pages**
2. Under **Build and deployment → Source**, change the dropdown from
   **Deploy from a branch** to **GitHub Actions**
3. That's it — no branch/folder picker needed anymore; the workflow handles it.

## 3. Push to trigger the first deploy

```bash
git push origin main
```

Go to the **Actions** tab in your repo — you'll see a "Deploy to GitHub Pages" run in progress.
Once it's green, go back to **Settings → Pages** and you'll see your live URL:

```
https://bridgetkimball.github.io/PageTurn/
```

## 4. Add the Pages URL to Supabase's allowed redirect URLs

1. In your Supabase project: **Authentication** → **URL Configuration**
2. Set **Site URL** to `https://bridgetkimball.github.io/PageTurn/`
3. Under **Redirect URLs**, add the same URL

This matters for password-reset links and email confirmations to point back to the right place.

## 5. (Optional) Deploy the account-deletion Edge Function

The "Delete Account" button on the Profile page always wipes all of a user's reading
data. To also delete the underlying login itself (full account removal, not just data),
deploy the included Edge Function — this requires the Supabase CLI on your own machine,
since it needs your Supabase login:

```bash
npx supabase login
npx supabase link --project-ref tafroactmrxbchdyzbgj
npx supabase functions deploy delete-account
```

(Replace the project ref with your own — find it in your Supabase project URL or
**Settings → General → Reference ID**.) No secrets need configuring: Supabase automatically
injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` into every
Edge Function at runtime.

Without this step, "Delete Account" still works — it deletes every book, shelf, session,
and challenge — but the login itself remains (an empty account someone could sign back into).

## Notes on this setup

- **Routing:** the app uses `HashRouter` (URLs look like `.../PageTurn/#/library`) instead of
  `BrowserRouter`, because GitHub Pages can't rewrite arbitrary paths back to `index.html`.
  A plain path-based URL would 404 on refresh; the hash avoids that entirely.
- **Base path:** `vite.config.ts` sets `base: '/PageTurn/'` to match the repo name, since the
  site is served from a subpath (`username.github.io/PageTurn/`), not the domain root.
- **Redeploying:** every push to `main` re-runs the workflow automatically. No manual build/upload step.
