# Family Planner

A shared planner for families.

- **My program** — your own next 7 days: your events, family events, activity slots, your tasks and meals.
- **Calendar** — the whole family's week. Parents can add **activity slots**: everyone requests what to do and votes, a parent picks.
- **Roles** — Parent, Child, Other. Parents manage the family, roles, invites, rules and slots.
- **House rules** — parents pause adding/changing things (calendar, tasks, shopping, meals, requests or everything)
  for all children, all "others" or one person, on chosen days, between times and/or between dates. Enforced in the database.
- **Inbox + push notifications** — invites, new slots, requests, decisions, things assigned to you.
- **Invites** — by email (with a role) or with the family code.
- **Tasks** with points, **shopping list** with Checkers Sixty60 search/product links, weekly **meal plan**.

**Live app:** https://damic3.github.io/family-planner/

**Stack:** Next.js 16 (static export) · TypeScript · Tailwind CSS 4 · Supabase (Auth, Postgres, Realtime) · hosted on GitHub Pages.

It's a **PWA**: install it on any phone from the browser.
- **iPhone / iPad (Safari):** Share button → *Add to Home Screen*.
- **Android (Chrome, Samsung Internet, Edge):** tap *Install app* in the planner, or browser menu → *Install app* / *Add to Home screen*.
- **Desktop (Chrome / Edge):** install icon in the address bar.

## Getting started

```bash
cp .env.example .env.local   # values for the shared Supabase project are pre-filled
npm install
npm run dev
```

Open http://localhost:3000, create an account, then create a family.
To build exactly what GitHub Pages serves: `BASE_PATH=/family-planner npm run build` (output in `out/`).

## One-time setup

**GitHub** — Settings → Pages → *Build and deployment* → Source: **GitHub Actions**.
After that, every push to `main` builds and publishes the site (`.github/workflows/deploy.yml`).

**Supabase** (shared **Ideas and equity** project; this app uses its own `family_planner` schema):
1. Project Settings → Data API → *Exposed schemas* → add `family_planner`.
2. Authentication → URL Configuration → *Redirect URLs* → add `https://damic3.github.io/family-planner/**`
   and `http://localhost:3000/**`. Don't change the *Site URL*: it belongs to the other app in this project.

Push notifications use the `send-push` edge function (`supabase/functions/send-push`). It is deployed with
JWT verification off because it checks its own secret; its keys live in Supabase Vault. On iPhone/iPad,
notifications only work after the app is added to the Home Screen (iOS 16.4+).

## Project layout

```
src/
  app/
    page.tsx, login/        # public pages
    onboarding/             # create or join a family
    (app)/                  # signed-in area: dashboard, calendar, tasks, shopping, meals, family
    manifest.ts             # PWA manifest
  components/               # shared UI, session + family providers, install prompt
  lib/
    supabase/               # browser client + DB types
    planner.ts              # all database writes
    use-family-query.ts     # data loading with live (realtime) updates
    dates.ts                # timezone-aware date helpers
supabase/functions/send-push/ # edge function that sends Web Push notifications
public/
  sw.js                     # service worker (installable, offline, push notifications)
  icons/                    # app icons
supabase/migrations/        # SQL schema (already applied to the project)
```

## Database & security

- Every table has row-level security: you can only read or change rows for families you're a member of.
- Families and memberships are only created through the `create_family` / `join_family` database functions.
- Only the family owner can change roles, rename the family or reset the invite code.
- Signed-out visitors have no access to any `family_planner` table.
- When you change the schema, add a new file in `supabase/migrations/` and update `src/lib/supabase/types.ts`.

## How it's built

The whole app runs in the browser (static export), so it can be hosted for free on GitHub Pages.
It talks to Supabase directly with the publishable key; **row-level security in the database** is what
guarantees people only see their own family's data. Changes made by one family member appear on
everyone else's screen straight away (Supabase Realtime).
