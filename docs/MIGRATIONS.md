# Database Migrations

`docs/DATABASE_SCHEMA.sql` is the schema for a **brand-new** Supabase project — it can't be
safely re-run against a database that already has it applied (`create policy` has no
`if not exists` in Postgres, so it would error on every policy that already exists).

If you already ran the original schema, apply new changes incrementally instead. Run each
migration below once, in order, in **Supabase Dashboard → SQL Editor → New Query**.

## 001 — Favorite books

Adds a favorite flag to `user_books`, backing the "favorite books" feature on Profile.

```sql
alter table public.user_books
  add column if not exists is_favorite boolean not null default false;
```

## 002 — Absolute page tracking on reading sessions

`reading_sessions.pages_read` only ever stored a delta ("pages read since last
log"), which can't be edited meaningfully after the fact — editing a past
entry needs to know what page it actually recorded. Adds a `current_page`
column holding that absolute value; existing rows stay `null` (their
`pages_read` delta still displays fine, just without an editable page number).

```sql
alter table public.reading_sessions
  add column if not exists current_page integer;
```
