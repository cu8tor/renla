-- =====================================================================
--  RENLA — catch-up migration #2
--  Run this ONCE in Supabase → SQL Editor → New query → Run.
--
--  Safe to run whether or not you've already run catch-up-migration.sql —
--  it only adds a column if it isn't already there. Nothing is deleted.
--
--  Covers:
--    1. Per-employee, per-day working hours (week_schedule)
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. WEEK SCHEDULE — set specific hours for each day of the week, or
--     mark a day off, per employee. When left null, the employee keeps
--     using their single assigned shift pattern (or the company default)
--     for every day, same as before this feature existed.
--
--     Shape written by the app:
--       { "Mon": {"start":"09:00","end":"17:00"}, "Tue": {"off": true}, ... }
--     Keys are "Mon".."Sun"; a day can be omitted entirely to fall back
--     to the employee's assigned shift pattern for just that day.
-- ---------------------------------------------------------------------
alter table public.employees
  add column if not exists week_schedule jsonb;

-- =====================================================================
--  Done. Now upload supabase.js, sync.js, payrollHelpers.js, App.jsx,
--  attendanceLogic.js, monthInsights.js and EmployeesPage.jsx, and
--  you're current.
-- =====================================================================
