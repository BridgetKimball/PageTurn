# PageTurn — Architecture Overview

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React 18 + TypeScript | Type-safe, component-based UI |
| Build tool | Vite | Fast dev server, optimized builds |
| Styling | Tailwind CSS | Utility-first, no CSS files to maintain |
| Routing | React Router v6 | Declarative, nested route support |
| Server state | TanStack Query v5 | Caching, background refetch, loading states |
| Backend / DB | Supabase (PostgreSQL) | Auth + database + realtime in one, free tier |
| Book data | Google Books API | 40M+ books, no API key required for basic use |
| Charts | Recharts | Composable chart library for React |

---

## Directory Structure

```
src/
├── components/
│   ├── auth/          LoginForm, RegisterForm
│   ├── books/         BookCard, AddToShelfModal
│   ├── challenges/    ChallengeCard, CreateChallengeModal
│   ├── layout/        Layout, Navbar, Sidebar
│   ├── shelves/       CreateShelfModal
│   └── ui/            Button, Input, Modal, StarRating, Badge, EmptyState
├── contexts/
│   └── AuthContext    Session, user, profile state — wraps entire app
├── lib/
│   ├── supabase.ts    Supabase client singleton
│   └── googleBooks.ts Google Books API fetch helpers
├── pages/             One file per route
│   ├── Dashboard      Stats, charts, current reads, active challenges
│   ├── Search         Google Books search with debounce
│   ├── Library        All user books with filter/sort
│   ├── ShelfView      Books on a shelf + cross-shelf query UI
│   ├── BookDetail     Full book page, sessions log, review editor
│   ├── Challenges     List/create challenges
│   ├── ImportExport   CSV export + Goodreads import
│   └── Profile        Display name, bio editor
└── types/
    └── index.ts       All shared TypeScript interfaces
```

---

## Data Flow

```
Google Books API ──► searchBooks() ──► Search page ──► AddToShelfModal
                                                              │
                                                              ▼
                                                    books table (cached)
                                                              │
                                                              ▼
                                                    user_books (status, page, rating, review)
                                                              │
                                          ┌───────────────────┤
                                          ▼                   ▼
                                    shelf_books         reading_sessions
                                          │
                                          ▼
                                   challenge_books
```

### Key patterns
- **TanStack Query** manages all async data. Each query has a stable `queryKey` array — mutations call `invalidateQueries` on the relevant keys so the UI updates automatically.
- **Supabase RLS** (Row Level Security) means every table is locked to the authenticated user's own rows — no server-side code needed for authorization.
- **AuthContext** holds `session`, `user`, and `profile`. Components import `useAuth()` to access these.
- **Books table is shared** — if two users add the same book, only one row is created. `user_books` holds per-user state.

---

## Authentication Flow

```
Register ──► supabase.auth.signUp()
           ──► INSERT profiles (display_name)
           ──► INSERT default shelves (Want to Read, Currently Reading, Read)
           ──► AuthContext updates session

Login    ──► supabase.auth.signInWithPassword()
           ──► AuthContext updates session
           ──► Redirect to /

All routes behind AuthGuard ──► if no session, redirect to /login
```

---

## Adding a New Feature

1. **New DB table?** Add it to `docs/DATABASE_SCHEMA.sql` and run it in Supabase SQL editor.
2. **New types?** Add to `src/types/index.ts`.
3. **New page?** Create in `src/pages/`, add a `<Route>` in `src/App.tsx`, and add nav in `Sidebar.tsx`.
4. **New data fetch?** Use `useQuery` with a unique `queryKey`. Put Supabase calls inline in the `queryFn`.
5. **New mutation?** Use `useMutation` and call `qc.invalidateQueries` on success.
