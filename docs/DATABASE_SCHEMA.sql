-- ═══════════════════════════════════════════════════════════════════════════
-- PageTurn — Supabase Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Extensions ─────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Profiles ────────────────────────────────────────────────────────────────
-- Extends the built-in auth.users table with display info
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text,
  avatar_url   text,
  bio          text,
  created_at   timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- ─── Books ───────────────────────────────────────────────────────────────────
-- Cached metadata from Google Books API (shared across all users)
create table if not exists public.books (
  id               uuid primary key default uuid_generate_v4(),
  google_books_id  text unique not null,
  title            text not null,
  authors          text[] default '{}',
  cover_url        text,
  description      text,
  genres           text[] default '{}',
  page_count       integer,
  published_date   text,
  isbn             text,
  publisher        text,
  created_at       timestamptz default now() not null
);

alter table public.books enable row level security;

-- Books are public read (needed to display other users' shelves in future)
create policy "Books are publicly readable"
  on public.books for select using (true);

create policy "Authenticated users can insert books"
  on public.books for insert with check (auth.role() = 'authenticated');

create policy "Authenticated users can update books"
  on public.books for update using (auth.role() = 'authenticated');

-- ─── User Books ───────────────────────────────────────────────────────────────
-- A user's personal relationship with a book (status, progress, rating, review)
create type public.reading_status as enum ('want_to_read', 'reading', 'read');

create table if not exists public.user_books (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  book_id       uuid not null references public.books(id) on delete cascade,
  status        public.reading_status not null default 'want_to_read',
  current_page  integer not null default 0,
  date_started  date,
  date_finished date,
  rating        smallint check (rating >= 1 and rating <= 5),
  review        text,
  is_favorite   boolean not null default false,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null,
  unique (user_id, book_id)
);

alter table public.user_books enable row level security;

create policy "Users manage their own user_books"
  on public.user_books for all using (auth.uid() = user_id);

-- Auto-update updated_at on change
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_books_updated_at
  before update on public.user_books
  for each row execute function public.set_updated_at();

-- ─── Shelves ─────────────────────────────────────────────────────────────────
create table if not exists public.shelves (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  color       text not null default '#3B82F6',
  is_default  boolean not null default false,
  created_at  timestamptz default now() not null
);

alter table public.shelves enable row level security;

create policy "Users manage their own shelves"
  on public.shelves for all using (auth.uid() = user_id);

-- ─── Shelf Books ─────────────────────────────────────────────────────────────
-- Many-to-many: a book can be on multiple shelves
create table if not exists public.shelf_books (
  id        uuid primary key default uuid_generate_v4(),
  shelf_id  uuid not null references public.shelves(id) on delete cascade,
  book_id   uuid not null references public.books(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  added_at  timestamptz default now() not null,
  unique (shelf_id, book_id)
);

alter table public.shelf_books enable row level security;

create policy "Users manage their own shelf_books"
  on public.shelf_books for all using (auth.uid() = user_id);

-- ─── Reading Sessions ─────────────────────────────────────────────────────────
create table if not exists public.reading_sessions (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  user_book_id  uuid not null references public.user_books(id) on delete cascade,
  date          date not null default current_date,
  pages_read    integer not null check (pages_read > 0),
  notes         text,
  created_at    timestamptz default now() not null
);

alter table public.reading_sessions enable row level security;

create policy "Users manage their own reading_sessions"
  on public.reading_sessions for all using (auth.uid() = user_id);

-- ─── Challenges ───────────────────────────────────────────────────────────────
create type public.challenge_length as enum ('week', 'month', 'year', 'custom');
create type public.challenge_status as enum ('active', 'completed', 'failed');

create table if not exists public.challenges (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  description   text,
  length_type   public.challenge_length not null default 'month',
  start_date    date not null default current_date,
  end_date      date not null,
  target_count  integer not null check (target_count > 0),
  genre_filter  text,
  status        public.challenge_status not null default 'active',
  created_at    timestamptz default now() not null,
  check (end_date > start_date)
);

alter table public.challenges enable row level security;

create policy "Users manage their own challenges"
  on public.challenges for all using (auth.uid() = user_id);

-- ─── Challenge Books ──────────────────────────────────────────────────────────
-- Tracks which books count toward a challenge
create table if not exists public.challenge_books (
  id            uuid primary key default uuid_generate_v4(),
  challenge_id  uuid not null references public.challenges(id) on delete cascade,
  user_book_id  uuid not null references public.user_books(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  added_at      timestamptz default now() not null,
  unique (challenge_id, user_book_id)
);

alter table public.challenge_books enable row level security;

create policy "Users manage their own challenge_books"
  on public.challenge_books for all using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Done! All tables, policies, and triggers are set up.
-- ═══════════════════════════════════════════════════════════════════════════
