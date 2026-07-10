-- OPS Vision - Migration 002
-- Drop the check constraint on allocations.area
-- so any area identifier (text or numeric) is accepted.
-- The app manages valid area IDs via the sectors table.

ALTER TABLE allocations DROP CONSTRAINT IF EXISTS allocations_area_check;