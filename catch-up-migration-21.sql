-- =====================================================================
--  RENLA — catch-up migration 21: one way to choose, two ways to pay
--
--  Run ONCE in Supabase → SQL Editor → New query → Run. Safe to re-run.
--  Requires catch-up-migration-20.sql first.
--
--  ---------------------------------------------------------------------
--  WHY
--
--  The billing page had the bank details on permanent display, a strip of
--  term cards, a "Pay by card" button and an "I've made a transfer"
--  button, and no two of them agreed about what the customer was being
--  asked to decide. Account numbers only matter once somebody has chosen
--  to transfer.
--
--  So: choose how much, then choose how to pay. Which needs two things
--  from the database.
--
--  FIRST, a six-month term. Asked for 1 / 3 / 6 / 12, and there is no
--  six-month row — so six months would have been six times the monthly
--  price, which costs MORE per month than the three-month option. A menu
--  where the bigger commitment is worse value reads as a mistake,
--  because it is one.
--
--  SECOND, card payments have to honour a term. Until now a card only
--  topped the wallet up, so "Yearly — save ₦10,000" by card would have
--  quietly credited ₦50,000 with no discount and no paid-through date,
--  while the same choice by transfer got both. Offering the saving on
--  one button and not the other is worse than not offering it at all.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. SIX MONTHS
--
--  The ladder, per month, at a ₦5,000 monthly charge:
--    monthly      ₦5,000      —
--    quarterly    ₦4,500      10% off
--    half-yearly  ₦4,250      15% off      (this row)
--    yearly       ₦4,167      two months free
--
--  Each step down commits longer and costs less per month, which is the
--  only arrangement that doesn't look like an error.
-- ---------------------------------------------------------------------
insert into public.billing_terms (key, name, period_months, months_charged, blurb, sort_order) values
  ('half_yearly', 'Six months', 6, 5.10, 'Six months up front.', 3)
on conflict (key) do update
  set name = excluded.name,
      period_months = excluded.period_months,
      months_charged = excluded.months_charged,
      blurb = excluded.blurb,
      sort_order = excluded.sort_order;

-- Yearly moves to the end of the list.
update public.billing_terms set sort_order = 4 where key = 'annual';

-- The blurbs said "save 10%" and the screen then added "Saves ₦1,500",
-- which is the same fact twice in two units. The blurb describes the
-- commitment; the naira figure is computed from the company's own
-- monthly charge and is the one they act on.
update public.billing_terms set blurb = 'Three months up front.' where key = 'quarterly';


-- ---------------------------------------------------------------------
--  2. THE TERM LOGIC, IN ONE PLACE
--
--  Previously this lived inside admin_apply_term_payment, behind an
--  is_platform_admin() check. The card webhook runs as the service role,
--  where auth.uid() is null and that check can only fail — so it needs
--  the same logic without the gate.
--
--  Copying it would have been the real risk: two implementations of how
--  a discount is worked out, drifting apart on the quiet.
-- ---------------------------------------------------------------------
create or replace function public.apply_term_payment_internal(
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
  if p_paid is null or p_paid <= 0 then
    raise exception 'A payment has to be a positive amount.';
  end if;

  select * into v_term from public.billing_terms where key = p_term;
  if v_term.key is null then raise exception 'No such term: %', p_term; end if;

  v_monthly  := public.company_monthly_charge(p_company);
  v_full     := round(v_monthly * v_term.period_months, 2);
  v_discount := round(v_full - (v_monthly * v_term.months_charged), 2);

  insert into public.wallet_entries (company_id, kind, amount, description, reference, created_by)
  values (p_company, 'credit', p_paid,
          v_term.name || ' payment', coalesce(p_reference, ''), auth.uid());

  -- The saving is its own line rather than being folded into the credit,
  -- so a statement says what arrived and what was given separately.
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

revoke all on function public.apply_term_payment_internal(uuid, text, numeric, text) from public, authenticated, anon;


-- The admin route keeps its gate and delegates the arithmetic.
create or replace function public.admin_apply_term_payment(
  p_company uuid, p_term text, p_paid numeric, p_reference text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Not permitted.';
  end if;
  return public.apply_term_payment_internal(p_company, p_term, p_paid, p_reference);
end;
$$;

grant execute on function public.admin_apply_term_payment(uuid, text, numeric, text) to authenticated;


-- ---------------------------------------------------------------------
--  3. A CARD PAYMENT CAN CARRY A TERM
-- ---------------------------------------------------------------------
alter table public.payment_intents
  add column if not exists term text;

drop function if exists public.start_card_payment(numeric);

create function public.start_card_payment(p_amount numeric, p_term text default null)
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

  -- An unknown term is dropped rather than refused: the money is good
  -- either way, and a wallet top-up is the safe reading.
  v_term := nullif(trim(coalesce(p_term, '')), '');
  if v_term is not null
     and not exists (select 1 from public.billing_terms where key = v_term) then
    v_term := null;
  end if;
  -- Monthly is the default state, not a term to buy.
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
    'reference', v_ref,
    'amount', round(p_amount, 2),
    'email', v_email,
    'companyName', v_name,
    'term', v_term
  );
end;
$$;

grant execute on function public.start_card_payment(numeric, text) to authenticated;


-- ---------------------------------------------------------------------
--  4. SETTLING HONOURS IT
--
--  Still idempotent the same way: the status moves first and only from
--  'pending', so a Paystack retry finds nothing to move.
-- ---------------------------------------------------------------------
create or replace function public.settle_card_payment(
  p_reference text, p_amount numeric, p_fees numeric default null, p_channel text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent public.payment_intents%rowtype;
  v_entry  uuid;
  v_out    jsonb;
begin
  update public.payment_intents
     set status = 'paid', paid_at = now(),
         fees = coalesce(p_fees, fees),
         channel = coalesce(p_channel, channel)
   where reference = p_reference and status = 'pending'
  returning * into v_intent;

  if v_intent.reference is null then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  if v_intent.term is not null then
    -- Credits the payment, posts the saving as its own line and moves
    -- paid_through — the same code the admin route runs.
    v_out := public.apply_term_payment_internal(
               v_intent.company_id, v_intent.term, round(p_amount, 2), p_reference);
  else
    insert into public.wallet_entries (company_id, kind, amount, description, reference, created_by)
    values (v_intent.company_id, 'credit', round(p_amount, 2),
            'Card payment', p_reference, v_intent.created_by)
    returning id into v_entry;

    update public.payment_intents set wallet_entry_id = v_entry
     where reference = p_reference;

    v_out := jsonb_build_object('credited', round(p_amount, 2));
  end if;

  return v_out || jsonb_build_object(
    'ok', true,
    'company', v_intent.company_id,
    'term', v_intent.term,
    'balance', public.company_balance(v_intent.company_id)
  );
end;
$$;

revoke all on function public.settle_card_payment(text, numeric, numeric, text) from public, authenticated, anon;


-- ---------------------------------------------------------------------
--  Check: the ladder reads correctly, cheapest per month last.
-- ---------------------------------------------------------------------
select key, name, period_months,
       months_charged,
       round(100 - (months_charged / period_months * 100), 1) as percent_saved
  from public.billing_terms
 order by sort_order;
