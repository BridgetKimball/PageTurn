# PageTurn — Setup Guide

## Prerequisites

- Node.js 18+ installed
- A free [Supabase](https://supabase.com) account

---

## Step 1 — Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **New Project** and fill in a name (e.g. `pageturn`).
3. Choose a region close to you and set a strong database password.
4. Wait ~2 minutes for the project to provision.

---

## Step 2 — Run the Database Schema

1. In your Supabase dashboard, go to **SQL Editor** → **New Query**.
2. Open `docs/DATABASE_SCHEMA.sql` from this project.
3. Copy the entire contents and paste it into the SQL editor.
4. Click **Run**. You should see "Success. No rows returned."

---

## Step 3 — Get Your API Keys

1. In Supabase, go to **Settings** → **API**.
2. Copy:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **anon / public** key (the shorter one, not the service role key)

---

## Step 4 — Configure Environment Variables

1. In the project root, copy the example file:
   ```
   cp .env.example .env
   ```
2. Open `.env` and fill in your values:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

### Optional: Google Books API Key

Book search tries Google Books first, then automatically falls back to Open Library
(no key ever required there) if Google fails — so search works out of the box either way.
A key is still worth adding for better results: Google's free anonymous quota is shared
globally across everyone using the API without a key, and can run out with no warning
(you'll see a 429 error) — your own key gets its own separate quota.

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Create a project → APIs & Services → Enable "Books API".
3. Credentials → Create API Key.
4. (Recommended) Restrict the key to the Books API only.
5. Add it to `.env`: `VITE_GOOGLE_BOOKS_API_KEY=your-key`
6. For the deployed site, also add it as a GitHub repo secret — see docs/DEPLOYMENT.md.

---

## Step 5 — Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Step 6 — Create Your Account

1. Click **Create one** on the login page.
2. Fill in your name, email, and password.
3. You're in! Three default shelves are created automatically:
   - **Want to Read** (blue)
   - **Currently Reading** (green)
   - **Read** (purple)

---

## Building for Production

```bash
npm run build
```

The output goes to `dist/`. Deploy to Vercel, Netlify, or any static host.
For Vercel: `vercel --prod` after `npm i -g vercel`.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "Missing Supabase environment variables" | Check your `.env` file exists and has the correct values |
| Auth not working | Make sure you ran the SQL schema — especially the `profiles` table |
| Books not saving | Check Row Level Security is enabled (it is by default in the schema) |
| Search shows "Search failed" | Both Google Books and Open Library were unreachable — rare; try again shortly |
| Search results have no covers/details | Likely came from the Open Library fallback (Google's quota ran out) — add a Google Books API key for richer results |
