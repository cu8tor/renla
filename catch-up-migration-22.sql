-- =====================================================================
--  RENLA — catch-up migration 22: a card switch, and deleting a company
--
--  Run ONCE in Supabase → SQL Editor → New query → Run. Safe to re-run.
--  Requires catch-up-migration-21.sql first.
--
--  WARNING NOTE: Supabase flags this as destructive because it creates a
--  function containing the word `delete`. Running the migration deletes
--  nothing. The function it creates does, when you call it.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. THE CARD SWITCH
--
--  Off by default, which is the honest default: a key can be the test
--  one, Paystack can be having a day, or the account can be unverified.
--  A pay button that leads to a dead end is worse than no button.
-- ---------------------------------------------------------------------
alter table public.platform_settings
  add column if not exists card_payments_enabled boolean not null default false;

comment on column public.platform_settings.card_payments_enabled is
  'Whether customers are offered Pay by card. Checked in the app AND in start_card_payment, so turning it off closes the route rather than just hiding the button.';

create or replace function public.admin_set_card_payments(p_enabled boolean)
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
     set card_payments_enabled = coalesce(p_enabled, false),
         updated_at = now()
   where id = true;
end;
$$;

grant execute on function public.admin_set_card_payments(boolean) to authenticated;


-- Enforced where it matters, not only where it shows. Hiding a button
-- stops the honest customer; refusing the call stops everybody.
create or replace function public.start_card_payment(p_amount numeric, p_term text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_role    text;
  v_email   text;
  v_name    text;
  v_ref     text;
  v_term    text;
begin
  if not coalesce((select card_payments_enabled from public.platform_settings where id = true), false) then
    raise exception 'Card payment isn''t available at the moment — please pay by transfer.';
  end if;

  select pr.company_id, pr.role into v_company, v_role
    from public.profiles pr where pr.id = auth.uid();

  if v_company is null then raise exception 'No company.'; end if;
  if v_role is distinct from 'HR Admin' then
    raise exception 'Only an HR Admin can pay for the company.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'How much do you want to pay?';
  end if;
  if p_amount < 100 then raise exception 'The smallest card payment is ₦100.'; end if;
  if p_amount > 10000000 then raise exception 'That is over the card limit — pay by transfer instead.'; end if;

  v_term := nullif(trim(coalesce(p_term, '')), '');
  if v_term is not null
     and not exists (select 1 from public.billing_terms where key = v_term) then
    v_term := null;
  end if;
  if v_term = 'monthly' then v_term := null; end if;

  select u.email into v_email from auth.users u where u.id = auth.uid();
  select c.name into v_name from public.companies c where c.id = v_company;

  v_ref := 'RENLA-'
        || upper(regexp_replace(coalesce(v_name, 'CO'), '[^A-Za-z]', '', 'g'))
        || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  v_ref := left(v_ref, 95);

  insert into public.payment_intents (reference, company_id, amount, email, created_by, term)
  values (v_ref, v_company, round(p_amount, 2), v_email, auth.uid(), v_term);

  return jsonb_build_object(
    'reference', v_ref, 'amount', round(p_amount, 2),
    'email', v_email, 'companyName', v_name, 'term', v_term
  );
end;
$$;

grant execute on function public.start_card_payment(numeric, text) to authenticated;


-- Hand the switch to the billing page so the button can hide too.
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
    'cardPayments', coalesce((select card_payments_enabled from public.platform_settings where id = true), false),
    'bank', (select to_jsonb(s) - 'id' - 'updated_at' - 'notify_email' - 'card_payments_enabled'
               from public.platform_settings s where s.id = true),
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
                 'receiptPath', r.receipt_path,
                 'status', r.status, 'createdAt', r.created_at)
                 order by r.created_at desc)
               from public.billing_requests r where r.company_id = c.id), '[]'::jsonb),
    'cardAttempts', coalesce((select jsonb_agg(jsonb_build_object(
                 'reference', i.reference, 'amount', i.amount,
                 'status', i.status, 'createdAt', i.created_at, 'paidAt', i.paid_at)
                 order by i.created_at desc)
               from public.payment_intents i
              where i.company_id = c.id
                and i.created_at > now() - interval '7 days'), '[]'::jsonb)
  ) into v
  from public.companies c
  left join public.plans p on p.key = c.plan
  where c.id = v_company;

  return v;
end;
$$;

grant execute on function public.my_billing() to authenticated;


-- ---------------------------------------------------------------------
--  2. WHAT DELETING A COMPANY WOULD DESTROY
--
--  Read-only. Called before the delete so the confirmation can state the
--  damage in numbers rather than in the word "everything".
-- ---------------------------------------------------------------------
create or replace function public.admin_company_footprint(p_company uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r     record;
  v_n   bigint;
  v_out jsonb := '{}'::jsonb;
  v_tot bigint := 0;
begin
  if not public.is_platform_admin() then
    raise exception 'Not permitted.';
  end if;

  for r in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public'
       and c.column_name = 'company_id'
       and t.table_type = 'BASE TABLE'
     order by c.table_name
  loop
    execute format('select count(*) from public.%I where company_id = $1', r.table_name)
      into v_n using p_company;
    if v_n > 0 then
      v_out := v_out || jsonb_build_object(r.table_name, v_n);
      v_tot := v_tot + v_n;
    end if;
  end loop;

  return jsonb_build_object(
    'name',  (select name from public.companies where id = p_company),
    'total', v_tot,
    'tables', v_out
  );
end;
$$;

grant execute on function public.admin_company_footprint(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  3. DELETING ONE
--
--  Irreversible, so it is built to be hard to do by accident:
--
--   * platform admin only;
--   * the caller must pass the company's exact name, which a mis-click
--     cannot supply;
--   * it refuses to delete a company that still has money in its wallet,
--     unless told explicitly, because a positive balance means somebody
--     paid and nobody should lose that quietly.
--
--  Rows are found by having a company_id rather than from a list written
--  here — a list would go stale the first time a table was added, and the
--  table it missed would be the one left behind. Deletion runs in passes
--  so children clear before parents whatever the foreign keys look like,
--  and raises rather than giving up if something still will not go.
--
--  WHAT IT DOES NOT TOUCH, and you have to do by hand:
--   * Supabase Auth users. Their logins survive with no company, so they
--     land on the "create or join" screen. Delete them in Authentication.
--   * Uploaded files. Avatars, selfies, documents and receipts sit in
--     Storage under the company's id; Postgres cannot remove the objects
--     themselves. The admin screen clears those before calling this.
-- ---------------------------------------------------------------------
create or replace function public.admin_delete_company(
  p_company uuid, p_confirm_name text, p_even_if_in_credit boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name    text;
  v_balance numeric;
  v_before  jsonb;
  v_pass    integer := 0;
  v_left    integer;
  r         record;
begin
  if not public.is_platform_admin() then
    raise exception 'Not permitted.';
  end if;

  select name into v_name from public.companies where id = p_company;
  if v_name is null then
    raise exception 'No such company.';
  end if;

  -- Typing the name is the consent. Trimmed, because a copy-paste picks
  -- up a space; otherwise exact, including case.
  if trim(coalesce(p_confirm_name, '')) <> trim(v_name) then
    raise exception 'Type the company name exactly to confirm. Expected: %', v_name;
  end if;

  v_balance := public.company_balance(p_company);
  if v_balance > 0 and not p_even_if_in_credit then
    raise exception 'That company has % in credit. Refund it or confirm again to delete anyway.', v_balance;
  end if;

  v_before := public.admin_company_footprint(p_company);

  -- Up to eight passes. Each one clears whatever no longer has a child
  -- depending on it, so the graph unwinds without this function having to
  -- know its shape.
  loop
    v_pass := v_pass + 1;
    v_left := 0;

    for r in
      select c.table_name
        from information_schema.columns c
        join information_schema.tables t
          on t.table_schema = c.table_schema and t.table_name = c.table_name
       where c.table_schema = 'public'
         and c.column_name = 'company_id'
         and t.table_type = 'BASE TABLE'
    loop
      begin
        execute format('delete from public.%I where company_id = $1', r.table_name)
          using p_company;
      exception when foreign_key_violation then
        v_left := v_left + 1;      -- something still points at it; next pass
      end;
    end loop;

    exit when v_left = 0;
    if v_pass >= 8 then
      raise exception 'Could not finish deleting % — % table(s) still had rows depending on them.', v_name, v_left;
    end if;
  end loop;

  delete from public.companies where id = p_company;

  return jsonb_build_object(
    'deleted', v_name,
    'removed', v_before,
    'passes', v_pass
  );
end;
$$;

grant execute on function public.admin_delete_company(uuid, text, boolean) to authenticated;


-- ---------------------------------------------------------------------
--  Check: card payments are off until you switch them on.
-- ---------------------------------------------------------------------
select card_payments_enabled, bank_name, account_number
  from public.platform_settings;
