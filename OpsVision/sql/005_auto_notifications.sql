-- ============================================
-- NOTIFICATIONS AUTO-INCREMENT SEQUENCE
-- + ENABLE REALTIME FOR ALL TABLES
-- ============================================

-- Create a sequence for notifications auto-increment
CREATE SEQUENCE IF NOT EXISTS notifications_id_seq START 100000;

-- Set default value for notifications.id to use the sequence
ALTER TABLE notifications ALTER COLUMN id SET DEFAULT NEXTVAL('notifications_id_seq');

-- Ensure existing rows use the sequence
SELECT SETVAL('notifications_id_seq', COALESCE(MAX(id), 0) + 1) FROM notifications;

-- ============================================
-- ENABLE REALTIME PUBLICATION
-- ============================================
DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY['tasks','meetings','meeting_participants','notifications','allocations','employees','employee_schedules','sectors','recurrence_options'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  FOREACH tbl IN ARRAY tbls LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', tbl);
    END IF;
  END LOOP;
END $$;
