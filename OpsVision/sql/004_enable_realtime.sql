-- ============================================
-- ENABLE SUPABASE REALTIME FOR ALL TABLES
-- Run this in Supabase SQL Editor
-- ============================================

DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY['tasks','meetings','meeting_participants','notifications','allocations','employees','employee_schedules','sectors','recurrence_options'];
BEGIN
  -- Ensure the publication exists
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  -- Add each table if not already in the publication
  FOREACH tbl IN ARRAY tbls LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', tbl);
    END IF;
  END LOOP;
END $$;
