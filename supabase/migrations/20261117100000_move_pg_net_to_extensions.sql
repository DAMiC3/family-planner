-- pg_net was created in `public` by the previous migration; Supabase recommends the `extensions` schema.
-- Its functions live in the `net` schema either way, so the push trigger keeps working.
drop extension if exists pg_net;
create extension pg_net with schema extensions;
