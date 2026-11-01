-- =====================================================================
--  RENLA — catch-up migration 11: invite details for the join page
--
--  Run ONCE in Supabase → SQL Editor → New query → Run.
--  Safe to re-run: `create or replace` throughout. Nothing is altered
--  or deleted; this adds one read-only function.
--
--  Why: the join page has to greet someone BEFORE they have an account
--  ("Cura International has invited you as WALE OJO"), which means
--  reading an invite while still signed out. The invites table itself
--  is readable only by HR of that company, so this function reads it
--  under security definer and returns nothing but the three display
--  fields plus the email the invite is locked to.
--
--  Guarded by the token: 24 random bytes, stored only as a sha256 hash,
--  known only to whoever received the email. A used, revoked or unknown
--  token returns no rows at all, so the function can't be used to probe
--  for valid employees or addresses.
-- =====================================================================

create or replace function public.invite_details(p_token text)
returns table (
  invite_email  text,
  employee_name text,
  company_name  text,
  is_expired    boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_inv public.invites%rowtype;
begin
  select * into v_inv from public.invites
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');

  -- Unknown, already used, or cancelled: say nothing rather than
  -- distinguishing between them.
  if v_inv.id is null or v_inv.accepted_at is not null or v_inv.revoked_at is not null then
    return;
  end if;

  return query
    select v_inv.email,
           e.full_name,
           c.name,
           (v_inv.expires_at < now())
      from public.employees e
      join public.companies c on c.id = v_inv.company_id
     where e.id = v_inv.employee_id;
end;
$$;

revoke all on function public.invite_details(text) from public;
-- anon as well as authenticated: the whole point is that it runs before
-- the invited person has signed in.
grant execute on function public.invite_details(text) to anon, authenticated;
