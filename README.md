# PageTurn

A personal reading tracker built to be everything Goodreads should be — fast, private, and actually useful.

## Features

- **Custom Shelves** — create unlimited book lists with cross-shelf querying
- **Book Search** — 40M+ books via Google Books API
- **Reading Progress** — track current page, log sessions, view reading history
- **Star Ratings & Reviews** — rate and annotate every book privately
- **Reading Challenges** — set weekly, monthly, or yearly goals with optional genre filters
- **Statistics Dashboard** — charts, streaks, genre breakdowns, pages read
- **Import / Export** — export as CSV, import from Goodreads
- **Accounts** — data syncs across all devices

## Quick Start

See **[docs/SETUP.md](docs/SETUP.md)** for the full setup walkthrough.

```bash
cp .env.example .env   # add your Supabase keys
npm install
npm run dev
```

## Docs

| Document | Description |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | Installation and configuration |
| [docs/FEATURES.md](docs/FEATURES.md) | Full feature reference |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Tech stack and code structure |
| [docs/DATABASE_SCHEMA.sql](docs/DATABASE_SCHEMA.sql) | Supabase SQL to run once |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Hosting on GitHub Pages |

## Stack

React · TypeScript · Vite · Tailwind CSS · Supabase · Google Books API
