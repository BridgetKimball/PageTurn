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
