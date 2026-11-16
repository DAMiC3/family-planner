# Family Planner

A shared planner for families: calendar, chores/tasks, shopping lists and meal plans.

**Stack:** Next.js 16 (App Router, TypeScript, Tailwind CSS) + Supabase (auth, Postgres, realtime).

## Database

The schema lives in `supabase/migrations/` and uses its own `family_planner` Postgres schema
(in the shared "Ideas and equity" Supabase project), so it never collides with other apps' tables.
Every table has row-level security: users only see data for families they belong to.

> Status: migration written, **not yet applied** to the database.

## Development

```bash
npm install
npm run dev
```

Open http://localhost:3000.
