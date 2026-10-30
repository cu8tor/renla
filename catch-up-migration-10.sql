-- =====================================================================
--  RENLA — catch-up migration 10: emailed invites
--
--  Run ONCE in Supabase → SQL Editor → New query → Run.
--  Safe to re-run: everything is `if not exists` / `create or replace`.
--
--  Adds a proper invite token so HR can email an invite link instead of
--  reading out an employee UUID. Deliberately ADDITIVE: `claim_invite`
--  and the existing staff-code path are untouched and keep working for
--  staff with no email address.
--
--  Why not just email the existing staff code: that code IS the employee
--  row's UUID. It never expires, can't be revoked, isn't tied to the
--  invited person's email, and appears in other payloads. Fine when HR
--  hands it over in person; not fine once it's sitting in forwarded
--  inboxes. Tokens here are random, hashed at rest, single-use, expiring,
--  and refuse to be claimed by an address they weren't sent to.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
--  1. THE TABLE
-- ---------------------------------------------------------------------
create table if not exists public.invites (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  employee_id  uuid not null references public.employees(id) on delete cascade,
  email        text not null,
  role         text not null default 'Employee'
               check (role in ('Employee','Manager','HR Admin')),
  -- Only the sha256 of the token is stored. A database leak therefore
  -- doesn't hand anyone a working invite link.
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users(id) on delete set null,
  revoked_at   timestamptz
);

create index if not exists invites_company_idx on public.invites(company_id);
create index if not exists invites_employee_idx on public.invites(employee_id);

alter table public.invites enable row level security;

-- HR of the company can see and cancel its own invites. Nobody else gets
-- to read this table at all — accepting an invite goes through the
-- security-definer function below, not through a select.
drop policy if exists invites_hr_read on public.invites;
create policy invites_hr_read on public.invites for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.company_id = invites.company_id
      and p.role = 'HR Admin'
  ));

drop policy if exists invites_hr_update on public.invites;
create policy invites_hr_update on public.invites for update
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.company_id = invites.company_id
      and p.role = 'HR Admin'
  ));

-- No insert policy on purpose: rows are only ever created by
-- create_invite() below, which does its own authorisation.


-- ---------------------------------------------------------------------
--  2. CREATE AN INVITE  (called by HR, returns the raw token once)
-- ---------------------------------------------------------------------
create or replace function public.create_invite(
  p_employee_id uuid,
  p_email       text,
  p_role        text default 'Employee',
  p_days        int  default 7
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company  uuid;
  v_caller   record;
  v_token    text;
begin
  if coalesce(trim(p_email), '') = '' then
    raise exception 'An email address is required to send an invite.';
  end if;

  select company_id into v_company from public.employees where id = p_employee_id;
  if v_company is null then
    raise exception 'That employee record no longer exists.';
  end if;

  select company_id, role into v_caller from public.profiles where id = auth.uid();
  if v_caller.company_id is distinct from v_company or v_caller.role <> 'HR Admin' then
    raise exception 'Only an HR Admin in this company can send invites.';
  end if;

  -- Already claimed by a real login? Nothing to invite.
  if exists (select 1 from public.profiles where employee_id = p_employee_id) then
    raise exception 'That employee has already joined.';
  end if;

  -- Re-inviting supersedes anything still outstanding, so an old link in
  -- an old email stops working the moment a new one is sent.
  update public.invites
     set revoked_at = now()
   where employee_id = p_employee_id
     and accepted_at is null
     and revoked_at is null;

  -- 24 random bytes, base64url — no padding, no characters that break in
  -- a URL or get mangled by an email client.
  v_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');

  insert into public.invites (company_id, employee_id, email, role, token_hash, expires_at, created_by)
  values (
    v_company,
    p_employee_id,
    lower(trim(p_email)),
    coalesce(nullif(p_role, ''), 'Employee'),
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    now() + make_interval(days => greatest(1, least(30, p_days))),
    auth.uid()
  );

  return v_token;
end;
$$;

revoke all on function public.create_invite(uuid, text, text, int) from public;
grant execute on function public.create_invite(uuid, text, text, int) to authenticated;


-- ---------------------------------------------------------------------
--  3. ACCEPT AN INVITE  (called by the signed-in invitee)
--
--  Mirrors what claim_invite does — inserts the profiles row that links
--  this login to an employee record — but gated on a real token.
-- ---------------------------------------------------------------------
create or replace function public.accept_invite(p_token text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_inv   public.invites%rowtype;
  v_email text;
  v_name  text;
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in to accept an invite.';
  end if;

  select * into v_inv from public.invites
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');

  if v_inv.id is null then
    raise exception 'That invite link is not valid.';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'That invite has been cancelled — ask HR for a new one.';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'That invite has already been used.';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'That invite has expired — ask HR to send a new one.';
  end if;

  -- The token alone isn't enough: it has to be claimed by the address it
  -- was sent to. A forwarded email is therefore useless to the recipient.
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email <> lower(v_inv.email) then
    raise exception 'This invite was sent to a different email address.';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'This account already belongs to a company.';
  end if;
  if exists (select 1 from public.profiles where employee_id = v_inv.employee_id) then
    raise exception 'That employee record has already been claimed.';
  end if;

  select full_name into v_name from public.employees where id = v_inv.employee_id;
  if v_name is null then
    raise exception 'That employee record no longer exists.';
  end if;

  insert into public.profiles (id, company_id, employee_id, full_name, role)
  values (auth.uid(), v_inv.company_id, v_inv.employee_id, v_name, v_inv.role);

  update public.invites
     set accepted_at = now(), accepted_by = auth.uid()
   where id = v_inv.id;
end;
$$;

revoke all on function public.accept_invite(text) from public;
grant execute on function public.accept_invite(text) to authenticated;
