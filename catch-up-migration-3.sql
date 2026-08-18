-- =====================================================================
--  RENLA — catch-up migration #3
--  Run this ONCE in Supabase → SQL Editor → New query → Run.
--
--  Safe to run whether or not you've already run migrations #1/#2 — it
--  only adds a column if it isn't already there. Nothing is deleted.
--
--  Covers:
--    1. Branch-level working hours (a branch can follow the company's
--       hours, or have its own)
--    2. Which source of hours an employee follows — standard company
--       hours, their branch's hours, their own custom per-day hours, or
--       a shift pattern
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. BRANCH HOURS
-- ---------------------------------------------------------------------
alter table public.branches
  add column if not exists week_schedule jsonb;
alter table public.branches
  add column if not exists use_company_schedule boolean not null default true;

-- ---------------------------------------------------------------------
--  2. WHICH HOURS AN EMPLOYEE FOLLOWS
--     "pattern"  — their assigned shift pattern, same hours every day
--                  (the original behaviour — this is the default, so
--                  nobody's hours change just from running this migration)
--     "standard" — the company's working hours directly
--     "branch"   — their branch's working hours
--     "custom"   — their own per-day week_schedule (from migration #2)
-- ---------------------------------------------------------------------
alter table public.employees
  add column if not exists schedule_mode text not null default 'pattern';

-- =====================================================================
--  Done. Now upload supabase.js, sync.js, payrollHelpers.js, App.jsx,
--  attendanceLogic.js, monthInsights.js, EmployeesPage.jsx,
--  SettingsPage.jsx and the new WeekScheduleEditor.jsx, and you're
--  current.
-- =====================================================================
