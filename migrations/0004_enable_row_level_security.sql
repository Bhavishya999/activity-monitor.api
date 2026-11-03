-- Supabase (and PostgREST in general) exposes every table in the public schema to its Data API. Enable Row Level
-- Security on all of them with no policies, so only the table owner (this backend) can read or write.
-- Every future migration that creates a table must also enable RLS; tests/rls.test.ts fails if one is missed.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
