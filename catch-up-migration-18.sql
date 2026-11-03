-- =====================================================================
--  RENLA — catch-up migration 18: what kind of business, and since when
--
--  Run ONCE in Supabase → SQL Editor → New query → Run. Safe to re-run.
--  Requires catch-up-migration-17.sql first.
--
--  ---------------------------------------------------------------------
--  WHY
--
--  Renla is being built without knowing who it's being built for. A
--  security firm with 40 guards on night posts and a salon with three
--  stylists both "need attendance", and almost nothing about what they
--  need is the same — rotas, overtime, GPS, selfies, leave, payroll all
--  pull in different directions depending on the trade.
--
--  So the signup asks once, and the answer sits on the company. Six
--  customers in, that is the difference between building on evidence and
--  building on a guess.
--
--  The joined date is already on the row; it just was not being handed
--  to the admin view.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. THE COLUMN
--
--  Free text rather than an enum. The list of trades lives in the app
--  (src/lib/industries.js) so adding one is a deploy, not a migration,
--  and an answer we did not anticipate is kept rather than rejected.
-- ---------------------------------------------------------------------
alter table public.companies
  add column if not exists industry text;

comment on column public.companies.industry is
  'What kind of business this is, as a key from src/lib/industries.js. Null for companies that signed up before it was asked.';


-- ---------------------------------------------------------------------
--  2. HR SETS IT FOR THEIR OWN COMPANY
--
--  Narrow on purpose: it takes no company id, so it can only ever touch
--  the caller's own, and only an HR Admin can call it.
-- ---------------------------------------------------------------------
create or replace function public.set_company_industry(p_industry text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_role    text;
begin
  select company_id, role into v_company, v_role
    from public.profiles where id = auth.uid();

  if v_company is null then raise exception 'No company.'; end if;
  if v_role is distinct from 'HR Admin' then
    raise exception 'Only an HR Admin can change this.';
  end if;

  update public.companies
     set industry = nullif(trim(p_industry), '')
   where id = v_company;
end;
$$;

grant execute on function public.set_company_industry(text) to authenticated;


-- ---------------------------------------------------------------------
--  3. AND RENLA CAN SET IT FOR ANYONE
--
--  For the companies that signed up before the question existed.
-- ---------------------------------------------------------------------
create or replace function public.admin_set_industry(p_company uuid, p_industry text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Not permitted.';
  end if;

  update public.companies
     set industry = nullif(trim(p_industry), '')
   where id = p_company;
end;
$$;

grant execute on function public.admin_set_industry(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
--  4. THE ADMIN LIST GAINS THE TRADE
--
--  created_at was already being returned and simply never shown, so the
--  only new column here is industry. Dropped and recreated rather than
--  replaced, because changing a function's return type needs it.
-- ---------------------------------------------------------------------
drop function if exists public.admin_companies();

create function public.admin_companies()
returns table (
  id uuid, name text, plan text, plan_name text, industry text,
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
    select c.id, c.name, c.plan, p.name, c.industry,
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

grant execute on function public.admin_companies() to authenticated;


-- ---------------------------------------------------------------------
--  Check: the column, and what the existing companies are set to.
-- ---------------------------------------------------------------------
select name, coalesce(industry, '(not set)') as industry, created_at::date as joined
  from public.companies
 order by created_at;
