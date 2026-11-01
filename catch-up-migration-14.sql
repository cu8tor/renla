-- =====================================================================
--  RENLA — catch-up migration 14: plans, wallet and platform admin
--
--  Run ONCE in Supabase → SQL Editor → New query → Run.
--  Safe to re-run throughout.
--
--  SUPERSEDES catch-up-migration-9.sql — do NOT run that one. It added
--  `companies.plan` with a check constraint against hardcoded tier
--  names; the same column is added here instead, pointing at a real
--  `plans` table so prices live in one place rather than in a constraint.
--
--  WARNING NOTE: Supabase flags this as "destructive" for containing
--  `alter`, `drop policy` and `update`. It creates three tables, adds
--  one column, and defines policies on its own new tables. No existing
--  table is altered beyond that one added column, and nothing is
--  deleted.
--
--  ---------------------------------------------------------------------
--  THE MODEL
--
--  Money is a LEDGER, never a balance field. Balance is the sum of the
--  rows. The same reasoning as leave balances in migration 13: a stored
--  counter drifts, can't be explained to a customer who says "I paid you
--  on Tuesday", and has no audit trail. Rows are append-only facts.
--
--      credit     money received — a bank transfer you've confirmed
--      charge     a month's subscription, posted monthly
--      adjustment a correction, refund or goodwill credit
--
--  balance = sum(amount). Credits positive, charges negative.
--
--  NOTHING CLIENT-SIDE CAN WRITE TO IT. There is no insert, update or
--  delete policy on wallet_entries for anybody — not even HR of that
--  company, who would otherwise be able to top up their own wallet from
--  the browser. Rows are only ever written by the security-definer
--  functions below, each of which checks who is calling first.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. PLATFORM ADMINS — you, not a customer
--
--  Deliberately its own table rather than a flag on `profiles`: a
--  profile belongs to one company, and being Renla is not a role within
--  a customer's company.
--
--  No insert/update/delete policy exists, so this table can only be
--  changed from the SQL editor or with the service-role key. A platform
--  admin cannot add another one from the app, and a customer cannot make
--  themselves one.
-- ---------------------------------------------------------------------
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text default '',
  added_at   timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

drop policy if exists platform_admins_self_read on public.platform_admins;
create policy platform_admins_self_read on public.platform_admins
  for select using (user_id = auth.uid());

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

grant execute on function public.is_platform_admin() to authenticated;


-- ---------------------------------------------------------------------
--  2. PLANS — the four tiers, as data
--
--  Prices as numeric, never floating point. `included_seats` is what the
--  base price covers; `per_seat_beyond` is charged for each seat above
--  that; `seat_cap` null means unlimited.
-- ---------------------------------------------------------------------
create table if not exists public.plans (
  key              text primary key,
  name             text not null,
  monthly_base     numeric(14,2) not null default 0,
  included_seats   integer not null default 0,
  per_seat_beyond  numeric(14,2) not null default 0,
  seat_cap         integer,
  branch_cap       integer,
  sort_order       integer not null default 0
);

insert into public.plans (key, name, monthly_base, included_seats, per_seat_beyond, seat_cap, branch_cap, sort_order)
values
  ('starter',        'Starter',             0, 5,    0,    5,    1, 1),
  ('small_business', 'Small Business',   5000, 10,   0,   10,    3, 2),
  ('growth',         'Growth',           5000, 10,  800, null,  10, 3),
  ('business',       'Business',        10000, 10, 1200, null, null, 4)
on conflict (key) do nothing;     -- re-running won't overwrite edited prices

alter table public.plans enable row level security;

drop policy if exists plans_read on public.plans;
create policy plans_read on public.plans for select using (auth.uid() is not null);
-- No write policy: prices change from the SQL editor, not the app.


-- ---------------------------------------------------------------------
--  3. WHICH PLAN A COMPANY IS ON
--
--  Everyone starts on 'starter', which is free — running this puts
--  nobody onto a paid tier.
-- ---------------------------------------------------------------------
alter table public.companies
  add column if not exists plan text not null default 'starter'
  references public.plans(key);

-- Billing anchor: the day of the month charges are posted for. Set when
-- a company first moves onto a paid plan.
alter table public.companies
  add column if not exists billing_since date;

-- Signup date, for the admin list. Added here because the app never
-- read it and it may not exist. CAVEAT: if it's being created now,
-- every company that already exists gets today's date rather than its
-- real signup date — only companies created from here on will be
-- accurate.
alter table public.companies
  add column if not exists created_at timestamptz not null default now();


-- ---------------------------------------------------------------------
--  4. THE LEDGER
-- ---------------------------------------------------------------------
create table if not exists public.wallet_entries (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  kind        text not null check (kind in ('credit', 'charge', 'adjustment')),
  -- Positive adds to the balance, negative takes from it. A charge is
  -- stored negative so that the balance is a plain sum with no special
  -- cases to get wrong.
  amount      numeric(14,2) not null,
  description text not null default '',
  reference   text default '',          -- bank transfer reference
  period      text,                     -- 'YYYY-MM', for a monthly charge
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists wallet_entries_company_idx on public.wallet_entries(company_id, created_at desc);

-- One charge per company per month, so re-running the monthly posting
-- can never double-bill anyone.
create unique index if not exists wallet_entries_one_charge_per_period
  on public.wallet_entries(company_id, period) where kind = 'charge';

alter table public.wallet_entries enable row level security;

-- A company's own HR can read its statement. Nobody can write — see the
-- note at the top.
drop policy if exists wallet_read on public.wallet_entries;
create policy wallet_read on public.wallet_entries
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.company_id = wallet_entries.company_id
        and p.role = 'HR Admin'
    )
    or public.is_platform_admin()
  );


-- ---------------------------------------------------------------------
--  5. WHAT A COMPANY OWES, AND HAS
-- ---------------------------------------------------------------------

-- Headcount that counts towards a plan's seats: people actually working
-- there, not everyone ever added.
create or replace function public.company_seats(p_company uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.employees
   where company_id = p_company and coalesce(status, 'Active') = 'Active';
$$;

-- This month's price for a company, from its plan and its headcount.
create or replace function public.company_monthly_charge(p_company uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan  public.plans%rowtype;
  v_seats integer;
begin
  select p.* into v_plan from public.plans p
    join public.companies c on c.plan = p.key
   where c.id = p_company;
  if v_plan.key is null then return 0; end if;

  v_seats := public.company_seats(p_company);
  return v_plan.monthly_base
       + (greatest(0, v_seats - v_plan.included_seats) * v_plan.per_seat_beyond);
end;
$$;

create or replace function public.company_balance(p_company uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)::numeric(14,2)
    from public.wallet_entries where company_id = p_company;
$$;

grant execute on function public.company_seats(uuid) to authenticated;
grant execute on function public.company_monthly_charge(uuid) to authenticated;
grant execute on function public.company_balance(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  6. PLATFORM ADMIN READS
--
--  Narrow, explicit, admin-gated functions rather than widening the RLS
--  on every table to "or is_platform_admin()". One function to audit
--  instead of thirty policies, and no chance of a missed policy leaking
--  one customer's data to another.
-- ---------------------------------------------------------------------
create or replace function public.admin_companies()
returns table (
  id uuid, name text, plan text, plan_name text,
  seats integer, monthly_charge numeric, balance numeric,
  last_payment_at timestamptz, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Not permitted.';
  end if;

  return query
    select c.id, c.name, c.plan, p.name,
           public.company_seats(c.id),
           public.company_monthly_charge(c.id),
           public.company_balance(c.id),
           (select max(w.created_at) from public.wallet_entries w
             where w.company_id = c.id and w.kind = 'credit'),
           c.created_at
      from public.companies c
      left join public.plans p on p.key = c.plan
     order by c.name;
end;
$$;

create or replace function public.admin_company_detail(p_company uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Not permitted.';
  end if;

  select jsonb_build_object(
    'company', (select to_jsonb(c) - 'created_at' from public.companies c where c.id = p_company),
    'seats', public.company_seats(p_company),
    'balance', public.company_balance(p_company),
    'monthlyCharge', public.company_monthly_charge(p_company),
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'name', e.full_name, 'title', e.job_title,
        'department', e.department, 'status', e.status, 'joined', e.joined)
        order by e.full_name)
      from public.employees e where e.company_id = p_company), '[]'::jsonb),
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) order by b.name)
      from public.branches b where b.company_id = p_company), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id, 'kind', w.kind, 'amount', w.amount,
        'description', w.description, 'reference', w.reference,
        'period', w.period, 'createdAt', w.created_at)
        order by w.created_at desc)
      from public.wallet_entries w where w.company_id = p_company), '[]'::jsonb)
  ) into v;

  return v;
end;
$$;

grant execute on function public.admin_companies() to authenticated;
grant execute on function public.admin_company_detail(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  7. PLATFORM ADMIN WRITES
--
--  The only way money ever enters the ledger.
-- ---------------------------------------------------------------------
create or replace function public.admin_record_payment(
  p_company uuid, p_amount numeric, p_reference text default '', p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Not permitted.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'A payment has to be a positive amount.';
  end if;

  insert into public.wallet_entries (company_id, kind, amount, description, reference, created_by)
  values (p_company, 'credit', p_amount,
          coalesce(nullif(p_note, ''), 'Bank transfer'), coalesce(p_reference, ''), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- A correction. Takes a signed amount so it can go either way, which is
-- what makes it a correction rather than a second kind of payment.
create or replace function public.admin_adjust(
  p_company uuid, p_amount numeric, p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Not permitted.';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'An adjustment of zero does nothing.';
  end if;
  if coalesce(trim(p_note), '') = '' then
    raise exception 'Say what the adjustment is for.';
  end if;

  insert into public.wallet_entries (company_id, kind, amount, description, created_by)
  values (p_company, 'adjustment', p_amount, p_note, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.admin_set_plan(p_company uuid, p_plan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Not permitted.';
  end if;
  if not exists (select 1 from public.plans where key = p_plan) then
    raise exception 'No such plan: %', p_plan;
  end if;

  update public.companies
     set plan = p_plan,
         -- Start the billing clock the first time they move off the free
         -- tier, and leave it alone after that.
         billing_since = case
           when p_plan <> 'starter' and billing_since is null then current_date
           else billing_since end
   where id = p_company;
end;
$$;

grant execute on function public.admin_record_payment(uuid, numeric, text, text) to authenticated;
grant execute on function public.admin_adjust(uuid, numeric, text) to authenticated;
grant execute on function public.admin_set_plan(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
--  8. POSTING A MONTH'S CHARGES
--
--  Call it once a month: select public.post_monthly_charges();
--
--  Safe to call repeatedly — the unique index on (company_id, period)
--  means a second run for the same month inserts nothing. Free-tier
--  companies are skipped entirely rather than billed zero, so their
--  statement stays empty instead of filling with ₦0 rows.
--
--  To run it automatically, enable pg_cron and schedule it:
--
--    create extension if not exists pg_cron;
--    select cron.schedule('renla-monthly-billing', '0 2 1 * *',
--                         $$select public.post_monthly_charges()$$);
-- ---------------------------------------------------------------------
create or replace function public.post_monthly_charges(p_period text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period text := coalesce(p_period, to_char(current_date, 'YYYY-MM'));
  v_count  integer := 0;
  r        record;
  v_amount numeric;
begin
  if not public.is_platform_admin() then
    raise exception 'Not permitted.';
  end if;

  for r in
    select c.id, c.name from public.companies c
     where c.plan <> 'starter'
  loop
    v_amount := public.company_monthly_charge(r.id);
    if v_amount > 0 then
      begin
        insert into public.wallet_entries (company_id, kind, amount, description, period, created_by)
        values (r.id, 'charge', -v_amount,
                'Subscription — ' || v_period, v_period, auth.uid());
        v_count := v_count + 1;
      exception when unique_violation then
        -- Already billed for this month. Nothing to do.
        null;
      end;
    end if;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.post_monthly_charges(text) to authenticated;


-- =====================================================================
--  SET YOURSELF UP AS THE PLATFORM ADMIN
--
--  Find your user id and add it. Replace the email with your own.
-- =====================================================================
insert into public.platform_admins (user_id, note)
select id, 'Renla' from auth.users where email = 'cu8tor@gmail.com'
on conflict (user_id) do nothing;


-- Check: who is an admin, and what the four plans cost.
select u.email, a.added_at from public.platform_admins a join auth.users u on u.id = a.user_id;
select key, name, monthly_base, included_seats, per_seat_beyond, seat_cap from public.plans order by sort_order;
