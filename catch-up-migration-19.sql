-- =====================================================================
--  RENLA — catch-up migration 19: how to reach a customer
--
--  Run ONCE in Supabase → SQL Editor → New query → Run. Safe to re-run.
--  Requires catch-up-migration-18.sql first.
--
--  ---------------------------------------------------------------------
--  WHY
--
--  Right now there is no way to contact a customer. The only address on
--  file is whoever happened to sign up, and that is their login, not the
--  business.
--
--  That matters most where money is concerned: a transfer lands with a
--  narration that doesn't match anything, and there is nobody to call.
--  It also matters for the ordinary things — telling six companies about
--  a change, or chasing an account that has gone quiet.
--
--  A phone number is the one that actually reaches a Nigerian SMB, so
--  that is the one the signup insists on. The email is optional: the
--  person signing up already gave one, and a separate billing address is
--  a convenience rather than a necessity.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. THE COLUMNS
-- ---------------------------------------------------------------------
alter table public.companies
  add column if not exists contact_phone text,
  add column if not exists contact_email text;

comment on column public.companies.contact_phone is
  'Business phone — how Renla reaches this company. Asked at signup.';
comment on column public.companies.contact_email is
  'Business email, separate from whoever signed up. Optional.';


-- ---------------------------------------------------------------------
--  2. HR SETS THEM FOR THEIR OWN COMPANY
--
--  Takes no company id, so it can only ever touch the caller's own.
-- ---------------------------------------------------------------------
create or replace function public.set_company_contact(
  p_phone text, p_email text
)
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
     set contact_phone = nullif(trim(p_phone), ''),
         contact_email = nullif(lower(trim(p_email)), '')
   where id = v_company;
end;
$$;

grant execute on function public.set_company_contact(text, text) to authenticated;


-- ---------------------------------------------------------------------
--  3. THE ADMIN LIST CARRIES THE PHONE
--
--  Not the email as well: the list is already wide, and the detail view
--  gets both for free through to_jsonb(c).
-- ---------------------------------------------------------------------
drop function if exists public.admin_companies();

create function public.admin_companies()
returns table (
  id uuid, name text, plan text, plan_name text, industry text,
  contact_phone text,
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
           c.contact_phone,
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
--  Check: who you can and can't reach today.
-- ---------------------------------------------------------------------
select name,
       coalesce(contact_phone, '(none)') as phone,
       coalesce(contact_email, '(none)') as email,
       coalesce(industry, '(not set)')   as industry
  from public.companies
 order by created_at;
