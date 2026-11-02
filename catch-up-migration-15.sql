-- =====================================================================
--  RENLA — catch-up migration 15: billing terms, bank details, requests
--
--  Run ONCE in Supabase → SQL Editor → New query → Run. Safe to re-run.
--  Requires catch-up-migration-14.sql to have been run first.
--
--  WARNING NOTE: Supabase flags this as "destructive" for containing
--  `alter` and `drop policy`. It creates three tables, adds two columns
--  and defines policies on its own new tables. Nothing is deleted.
--
--  ---------------------------------------------------------------------
--  WHAT THIS ADDS
--
--  Customers currently have no way to see their plan, their balance or
--  where to send money — all of that lives only in Renla's back office.
--  This is the data behind the customer-facing billing page.
--
--  billing_terms      monthly / quarterly / annual, and what each costs
--  platform_settings  Renla's bank details, so they aren't in the repo
--  billing_requests   "we'd like to go annual" — something to act on
--                     rather than a transfer arriving unexplained
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. BILLING TERMS
--
--  One mechanism for both discounts: `months_charged` is how many
--  months you actually pay for across the period.
--
--      quarterly  3 months, charged 2.7   → 10% off
--      annual    12 months, charged 10    → two months free (~17% off)
--
--  Expressing annual as "pay for 10 of 12" rather than a percentage
--  keeps the price a round number — ₦50,000 rather than ₦49,800 — and
--  "two months free" is a clearer thing to say to a customer than
--  "16.67% off".
-- ---------------------------------------------------------------------
create table if not exists public.billing_terms (
  key            text primary key,
  name           text not null,
  period_months  integer not null,
  months_charged numeric(4,2) not null,
  blurb          text not null default '',
  sort_order     integer not null default 0
);

insert into public.billing_terms (key, name, period_months, months_charged, blurb, sort_order) values
  ('monthly',   'Monthly',    1,  1.00, 'Pay as you go, month to month.',              1),
  ('quarterly', 'Quarterly',  3,  2.70, 'Pay three months up front and save 10%.',     2),
  ('annual',    'Yearly',    12, 10.00, 'Pay for ten months, get twelve.',             3)
on conflict (key) do nothing;

alter table public.billing_terms enable row level security;
drop policy if exists billing_terms_read on public.billing_terms;
create policy billing_terms_read on public.billing_terms for select using (auth.uid() is not null);

-- Which term a company is on. Everyone starts monthly.
alter table public.companies
  add column if not exists billing_term text not null default 'monthly'
  references public.billing_terms(key);

-- Paid up to this date. Set when a payment is applied for a term, so a
-- company that has paid a year ahead isn't chased every month.
alter table public.companies
  add column if not exists paid_through date;


-- ---------------------------------------------------------------------
--  2. RENLA'S BANK DETAILS
--
--  A single row, kept in the database rather than the repo — bank
--  details change, and an account number has no business in git
--  history. Readable by any signed-in user because that is the entire
--  point: it's how they pay.
-- ---------------------------------------------------------------------
create table if not exists public.platform_settings (
  id              boolean primary key default true check (id),
  bank_name       text not null default '',
  account_name    text not null default '',
  account_number  text not null default '',
  payment_note    text not null default '',
  updated_at      timestamptz not null default now()
);

insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

drop policy if exists platform_settings_read on public.platform_settings;
create policy platform_settings_read on public.platform_settings
  for select using (auth.uid() is not null);
-- No write policy: changed only through the admin function below.

create or replace function public.admin_set_bank_details(
  p_bank text, p_account_name text, p_account_number text, p_note text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Not permitted.';
  end if;

  update public.platform_settings
     set bank_name = coalesce(p_bank, ''),
         account_name = coalesce(p_account_name, ''),
         account_number = coalesce(p_account_number, ''),
         payment_note = coalesce(p_note, ''),
         updated_at = now()
   where id = true;
end;
$$;

grant execute on function public.admin_set_bank_details(text, text, text, text) to authenticated;


-- ---------------------------------------------------------------------
--  3. WHAT A TERM COSTS
--
--  The monthly charge from migration 14, times the months actually
--  charged for that term.
-- ---------------------------------------------------------------------
create or replace function public.company_term_price(p_company uuid, p_term text)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_months numeric;
begin
  select months_charged into v_months from public.billing_terms where key = p_term;
  if v_months is null then return 0; end if;
  return round(public.company_monthly_charge(p_company) * v_months, 2);
end;
$$;

grant execute on function public.company_term_price(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
--  4. WHAT A COMPANY SEES ABOUT ITS OWN BILLING
--
--  One call for the whole billing page. HR of that company only — an
--  ordinary employee has no business reading what their employer pays,
--  and this is the only route to it.
-- ---------------------------------------------------------------------
create or replace function public.my_billing()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_role    text;
  v         jsonb;
begin
  select company_id, role into v_company, v_role
    from public.profiles where id = auth.uid();

  if v_company is null then raise exception 'No company.'; end if;
  if v_role is distinct from 'HR Admin' then
    raise exception 'Only an HR Admin can see billing.';
  end if;

  select jsonb_build_object(
    'companyId', c.id,
    'companyName', c.name,
    'plan', c.plan,
    'planName', p.name,
    'term', c.billing_term,
    'paidThrough', c.paid_through,
    'seats', public.company_seats(c.id),
    'includedSeats', p.included_seats,
    'seatCap', p.seat_cap,
    'monthlyCharge', public.company_monthly_charge(c.id),
    'balance', public.company_balance(c.id),
    'bank', (select to_jsonb(s) - 'id' - 'updated_at' from public.platform_settings s where s.id = true),
    'terms', (select jsonb_agg(jsonb_build_object(
                 'key', t.key, 'name', t.name, 'periodMonths', t.period_months,
                 'blurb', t.blurb,
                 'price', public.company_term_price(c.id, t.key))
                 order by t.sort_order) from public.billing_terms t),
    'plans', (select jsonb_agg(jsonb_build_object(
                 'key', x.key, 'name', x.name, 'monthlyBase', x.monthly_base,
                 'includedSeats', x.included_seats, 'perSeatBeyond', x.per_seat_beyond,
                 'seatCap', x.seat_cap) order by x.sort_order) from public.plans x),
    'entries', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', w.id, 'kind', w.kind, 'amount', w.amount,
                 'description', w.description, 'reference', w.reference,
                 'period', w.period, 'createdAt', w.created_at)
                 order by w.created_at desc)
               from public.wallet_entries w where w.company_id = c.id), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', r.id, 'kind', r.kind, 'plan', r.requested_plan,
                 'term', r.requested_term, 'amount', r.amount, 'note', r.note,
                 'status', r.status, 'createdAt', r.created_at)
                 order by r.created_at desc)
               from public.billing_requests r where r.company_id = c.id), '[]'::jsonb)
  ) into v
  from public.companies c
  left join public.plans p on p.key = c.plan
  where c.id = v_company;

  return v;
end;
$$;


-- ---------------------------------------------------------------------
--  5. REQUESTS
--
--  Payment is a bank transfer somebody has to match up by hand, so a
--  request exists to say "this is coming, and this is what it's for"
--  before the money lands unexplained.
-- ---------------------------------------------------------------------
create table if not exists public.billing_requests (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  kind            text not null check (kind in ('plan_change', 'term_change', 'topup')),
  requested_plan  text references public.plans(key),
  requested_term  text references public.billing_terms(key),
  amount          numeric(14,2),
  note            text not null default '',
  status          text not null default 'open' check (status in ('open', 'done', 'declined')),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid references auth.users(id) on delete set null
);

create index if not exists billing_requests_open_idx
  on public.billing_requests(status, created_at desc);

alter table public.billing_requests enable row level security;

-- HR can raise one and read their own company's. Nobody can edit or
-- delete: resolving happens through the admin function, so the history
-- of what was asked for stays intact.
drop policy if exists billing_requests_read on public.billing_requests;
create policy billing_requests_read on public.billing_requests
  for select using (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and p.company_id = billing_requests.company_id
               and p.role = 'HR Admin')
    or public.is_platform_admin()
  );

drop policy if exists billing_requests_insert on public.billing_requests;
create policy billing_requests_insert on public.billing_requests
  for insert with check (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and p.company_id = billing_requests.company_id
               and p.role = 'HR Admin')
    and status = 'open'          -- can't raise one already marked done
    and created_by = auth.uid()
  );

create or replace function public.admin_resolve_request(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Not permitted.';
  end if;
  if p_status not in ('done', 'declined') then
    raise exception 'A request is either done or declined.';
  end if;

  update public.billing_requests
     set status = p_status, resolved_at = now(), resolved_by = auth.uid()
   where id = p_id and status = 'open';
end;
$$;

create or replace function public.admin_open_requests()
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'companyId', r.company_id, 'companyName', c.name,
    'kind', r.kind, 'plan', r.requested_plan, 'term', r.requested_term,
    'amount', r.amount, 'note', r.note, 'createdAt', r.created_at
  ) order by r.created_at), '[]'::jsonb) into v
  from public.billing_requests r
  join public.companies c on c.id = r.company_id
  where r.status = 'open';

  return v;
end;
$$;

-- Applying a term: credit what they actually transferred, and put the
-- discount on as its own entry. The ledger keeps saying exactly what
-- money arrived, with the saving visible as a line of its own rather
-- than buried inside a number — which is what you want the first time
-- somebody queries their statement.
create or replace function public.admin_apply_term_payment(
  p_company uuid, p_term text, p_paid numeric, p_reference text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_term     public.billing_terms%rowtype;
  v_monthly  numeric;
  v_full     numeric;
  v_discount numeric;
begin
  if not public.is_platform_admin() then
    raise exception 'Not permitted.';
  end if;
  if p_paid is null or p_paid <= 0 then
    raise exception 'A payment has to be a positive amount.';
  end if;

  select * into v_term from public.billing_terms where key = p_term;
  if v_term.key is null then raise exception 'No such term: %', p_term; end if;

  v_monthly  := public.company_monthly_charge(p_company);
  v_full     := round(v_monthly * v_term.period_months, 2);     -- undiscounted
  v_discount := round(v_full - (v_monthly * v_term.months_charged), 2);

  insert into public.wallet_entries (company_id, kind, amount, description, reference, created_by)
  values (p_company, 'credit', p_paid,
          v_term.name || ' payment', coalesce(p_reference, ''), auth.uid());

  if v_discount > 0 then
    insert into public.wallet_entries (company_id, kind, amount, description, created_by)
    values (p_company, 'adjustment', v_discount,
            v_term.name || ' discount — ' || v_term.blurb, auth.uid());
  end if;

  update public.companies
     set billing_term = p_term,
         paid_through = greatest(coalesce(paid_through, current_date), current_date)
                        + (v_term.period_months || ' months')::interval
   where id = p_company;

  return jsonb_build_object('credited', p_paid, 'discount', v_discount, 'covers', v_full);
end;
$$;

grant execute on function public.my_billing() to authenticated;
grant execute on function public.admin_resolve_request(uuid, text) to authenticated;
grant execute on function public.admin_open_requests() to authenticated;
grant execute on function public.admin_apply_term_payment(uuid, text, numeric, text) to authenticated;


-- Check: the three terms, and what Renla's bank details currently say
-- (blank until you fill them in from the admin page).
select key, name, period_months, months_charged, blurb from public.billing_terms order by sort_order;
select bank_name, account_name, account_number from public.platform_settings;
