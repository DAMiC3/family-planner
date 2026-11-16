# Family Planner

A shared planner for families: calendar, chores/tasks (with points), a shared shopping list and a weekly meal plan.
One person creates a family and shares an invite code; everyone who joins sees the same planner.

**Stack:** Next.js 16 (App Router, Server Actions, Cache Components) · TypeScript · Tailwind CSS 4 · Supabase (Auth + Postgres).

## Getting started

```bash
cp .env.example .env.local   # values for the shared Supabase project are pre-filled
npm install
npm run dev
```

Open http://localhost:3000, create an account, then create a family.

## One-time Supabase setup (dashboard)

The database lives in the shared **Ideas and equity** project, in its own `family_planner` schema.

1. **Expose the schema** — Project Settings → Data API → *Exposed schemas* → add `family_planner`.
   Without this, every page fails with "Invalid schema: family_planner".
2. **Allow redirect URLs** — Authentication → URL Configuration → *Redirect URLs* → add
   `http://localhost:3000/**` and your deployed URL (e.g. `https://<your-site>.netlify.app/**`).
   Don't change the *Site URL*: it belongs to the other app in this project.

## Project layout

```
src/
  proxy.ts                  # refreshes the auth session, guards private pages
  app/
    page.tsx, login/        # public pages
    onboarding/             # create or join a family
    (app)/                  # signed-in area: dashboard, calendar, tasks, shopping, meals, family
    actions/                # Server Actions (all writes go through here)
    auth/confirm/route.ts   # email-confirmation link handler
  components/               # shared UI
  lib/
    supabase/               # server/browser clients + DB types
    family.ts               # requireUser / requireFamily helpers
    dates.ts                # timezone-aware date helpers
supabase/migrations/        # SQL schema (already applied to the project)
```

## Database & security

- Every table has row-level security: you can only read or change rows for families you're a member of.
- Families and memberships are only created through the `create_family` / `join_family` database functions.
- Only the family owner can change roles, rename the family or reset the invite code.
- Signed-out visitors have no access to any `family_planner` table.
- When you change the schema, add a new file in `supabase/migrations/` and update `src/lib/supabase/types.ts`.

## Deploying (Netlify)

Netlify detects Next.js automatically. Set the three variables from `.env.example` in the site's environment settings
(`NEXT_PUBLIC_SITE_URL` = your site's URL), and add the site URL to Supabase redirect URLs (step 2 above).
