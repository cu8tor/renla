-- =====================================================================
--  RENLA — catch-up migration 13: leave entitlements
--
--  Run ONCE in Supabase → SQL Editor → New query → Run.
--  Safe to re-run: `if not exists` throughout, and the backfill only
--  touches rows that haven't been backfilled yet.
--
--  WARNING NOTE: Supabase flags this as "destructive" because it
--  contains `alter` and `update`. It adds two columns and fills one of
--  them. Nothing is dropped and no existing column is modified — in
--  particular `employees.balances` is left exactly as it is.
--
--  ---------------------------------------------------------------------
--  WHAT CHANGES
--
--  Renla stored only what was LEFT, as a counter decremented when leave
--  was approved, so "9 of 20 days" could not be shown honestly — there
--  was no 20 anywhere. Worse, the counter drifted: a request declined
--  after approval never gave the days back.
--
--  From here, what's left is derived:
--
--      left = entitlement + carried in from last year − taken this year
--
--  `company_settings.leave_policy`  the company's default allowance,
--                                   whether unused days roll over, the
--                                   cap when they do, and whether a
--                                   joiner's first year is pro-rated.
--  `employees.entitlement`          optional per-person override, for
--                                   someone on different terms.
--
--  Rollover defaults to OFF, per the decision taken: unused days expire
--  unless a company deliberately turns carry-over on.
--
--  ---------------------------------------------------------------------
--  THE BACKFILL, AND THE ONE ASSUMPTION IT MAKES
--
--  Switching to a derived balance would, on its own, change what
--  everyone sees: somebody showing 11 days left under the old counter
--  would suddenly show 20 minus whatever they'd taken.
--
--  So each employee's entitlement is reconstructed from the two things
--  we know:
--
--      entitlement = balance showing now + days already taken
--
--  which reproduces their current figure exactly.
--
--  ASSUMPTION: that the days they've taken were all taken THIS year.
--  That holds for a company in its first year of using Renla, which is
--  every company on it today. For one with leave recorded in an earlier
--  year, this understates the entitlement by whatever was taken then —
--  so check a few people afterwards if that applies, and correct them
--  on the employee form.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. COMPANY POLICY
-- ---------------------------------------------------------------------
alter table public.company_settings
  add column if not exists leave_policy jsonb not null
  default '{"annual": 20, "sick": 10, "comp": 5, "rollover": false, "rolloverCap": 5, "proRateFirstYear": true}'::jsonb;

-- Existing rows got the default above only if the column was just
-- created; this makes sure none are left null either way.
update public.company_settings
   set leave_policy = '{"annual": 20, "sick": 10, "comp": 5, "rollover": false, "rolloverCap": 5, "proRateFirstYear": true}'::jsonb
 where leave_policy is null;


-- ---------------------------------------------------------------------
--  2. PER-EMPLOYEE OVERRIDE
-- ---------------------------------------------------------------------
alter table public.employees
  add column if not exists entitlement jsonb;


-- ---------------------------------------------------------------------
--  3. BACKFILL — reconstruct entitlement so no balance visibly changes
-- ---------------------------------------------------------------------
with taken as (
  select
    e.id as employee_id,
    coalesce(sum(l.days) filter (where l.leave_type = 'Annual'), 0)        as annual,
    coalesce(sum(l.days) filter (where l.leave_type = 'Sick'), 0)          as sick,
    coalesce(sum(l.days) filter (where l.leave_type = 'Compassionate'), 0) as comp
  from public.employees e
  left join public.leave_requests l
    on l.employee_id = e.id
   and l.status = 'approved'
   and extract(year from l.from_date) = extract(year from current_date)
  group by e.id
)
update public.employees e
   set entitlement = jsonb_build_object(
         'annual', coalesce((e.balances->>'annual')::numeric, 20) + t.annual,
         'sick',   coalesce((e.balances->>'sick')::numeric,   10) + t.sick,
         'comp',   coalesce((e.balances->>'comp')::numeric,    5) + t.comp
       )
  from taken t
 where t.employee_id = e.id
   and e.entitlement is null;        -- re-running this leaves corrections alone


-- Check the result: everyone's reconstructed entitlement beside the old
-- counter it was derived from. For anyone who has taken no leave this
-- year the two should match exactly.
select full_name,
       balances->>'annual' as old_annual_left,
       entitlement->>'annual' as reconstructed_annual_entitlement,
       entitlement->>'sick' as sick,
       entitlement->>'comp' as comp
  from public.employees
 order by full_name;
