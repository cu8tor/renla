-- =====================================================================
--  RENLA — catch-up migration 20: paying by card
--
--  Run ONCE in Supabase → SQL Editor → New query → Run. Safe to re-run.
--  Requires catch-up-migration-19.sql first.
--
--  ---------------------------------------------------------------------
--  WHY
--
--  Funding by transfer needs a receipt, an email, and somebody at Renla
--  clicking Approve. That is fine at six customers and it is somebody's
--  evening at sixty — and in between, a customer who wants to pay at 6pm
--  on a Tuesday and cannot often does not come back.
--
--  Card payment does not replace the transfer flow. Many Nigerian SMBs
--  would rather transfer, and the receipt trail is genuinely better for
--  them. This is the other rail, for the ones who want to pay now.
--
--  ---------------------------------------------------------------------
--  THE SHAPE OF IT, AND WHY
--
--  The browser never credits anything. It asks for a payment intent, is
--  sent to Paystack, and comes back. The wallet moves only when Paystack
--  tells our webhook it moved, over a signed request.
--
--  The webhook looks the reference up in payment_intents rather than
--  trusting what the payload says the company is. A payload can claim
--  anything; a reference we minted ourselves can only mean the company
--  we minted it for.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. INTENTS
--
--  One row per attempt. Most will sit at 'pending' forever, because
--  people open a checkout page and change their mind — that is normal
--  and worth keeping, since an abandoned payment is a thing to ask about.
-- ---------------------------------------------------------------------
create table if not exists public.payment_intents (
  reference       text primary key,
  company_id      uuid not null references public.companies(id) on delete cascade,
  amount          numeric(14,2) not null check (amount > 0),
  email           text,
  status          text not null default 'pending'
                    check (status in ('pending', 'paid', 'failed')),
  -- What Paystack actually took, for Renla's own books. The customer is
  -- credited the full amount they paid; the fee is a cost of doing
  -- business and has no place on their statement.
  fees            numeric(14,2),
  channel         text,
  wallet_entry_id uuid references public.wallet_entries(id),
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  paid_at         timestamptz
);

create index if not exists payment_intents_company_idx
  on public.payment_intents(company_id, created_at desc);

alter table public.payment_intents enable row level security;

-- A company's HR can see their own attempts; nobody can write from the
-- client at all. Both writes happen in security-definer functions below.
drop policy if exists intents_read_own on public.payment_intents;
create policy intents_read_own on public.payment_intents
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and p.role = 'HR Admin'
         and p.company_id = payment_intents.company_id
    )
    or public.is_platform_admin()
  );


-- ---------------------------------------------------------------------
--  2. STARTING ONE
--
--  Takes no company id, so it can only ever mint a reference for the
--  caller's own company. Returns the reference and amount for the Edge
--  Function to hand to Paystack.
-- ---------------------------------------------------------------------
create or replace function public.start_card_payment(p_amount numeric)
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
  -- Paystack's own floor, and a ceiling so a slipped digit can't start a
  -- ten-million-naira checkout.
  if p_amount < 100 then raise exception 'The smallest card payment is ₦100.'; end if;
  if p_amount > 10000000 then raise exception 'That is over the card limit — pay by transfer instead.'; end if;

  select u.email into v_email from auth.users u where u.id = auth.uid();
  select c.name into v_name from public.companies c where c.id = v_company;

  -- Readable enough to recognise on a Paystack dashboard, random enough
  -- not to collide.
  v_ref := 'RENLA-'
        || upper(regexp_replace(coalesce(v_name, 'CO'), '[^A-Za-z]', '', 'g'))
        || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  v_ref := left(v_ref, 95);

  insert into public.payment_intents (reference, company_id, amount, email, created_by)
  values (v_ref, v_company, round(p_amount, 2), v_email, auth.uid());

  return jsonb_build_object(
    'reference', v_ref,
    'amount', round(p_amount, 2),
    'email', v_email,
    'companyName', v_name
  );
end;
$$;

grant execute on function public.start_card_payment(numeric) to authenticated;


-- ---------------------------------------------------------------------
--  3. SETTLING ONE
--
--  Called only by the webhook, with the service role. Deliberately NOT
--  granted to authenticated: no signed-in user should be able to tell
--  the database a payment succeeded.
--
--  Idempotent by construction. Paystack retries webhooks, sometimes for
--  days, and a retry that credited a second time would be the worst bug
--  this system could have. The status moves first and only from
--  'pending', so a replay finds nothing to move and credits nothing.
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
begin
  update public.payment_intents
     set status = 'paid', paid_at = now(),
         fees = coalesce(p_fees, fees),
         channel = coalesce(p_channel, channel)
   where reference = p_reference and status = 'pending'
  returning * into v_intent;

  if v_intent.reference is null then
    -- Either already settled or never started here. Say so plainly and
    -- return 200 to Paystack either way, so it stops retrying.
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  -- The amount credited is what Paystack says arrived, not what the
  -- intent hoped for. They can differ if somebody edits the amount on
  -- the checkout page, and the money that actually moved is the truth.
  insert into public.wallet_entries (company_id, kind, amount, description, reference, created_by)
  values (v_intent.company_id, 'credit', round(p_amount, 2),
          'Card payment', p_reference, v_intent.created_by)
  returning id into v_entry;

  update public.payment_intents set wallet_entry_id = v_entry
   where reference = p_reference;

  return jsonb_build_object(
    'ok', true,
    'company', v_intent.company_id,
    'credited', round(p_amount, 2),
    'balance', public.company_balance(v_intent.company_id)
  );
end;
$$;

revoke all on function public.settle_card_payment(text, numeric, numeric, text) from public, authenticated, anon;


-- A failed or abandoned attempt, so the customer isn't left looking at a
-- payment that never resolves. Credits nothing.
create or replace function public.fail_card_payment(p_reference text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payment_intents
     set status = 'failed'
   where reference = p_reference and status = 'pending';
end;
$$;

revoke all on function public.fail_card_payment(text) from public, authenticated, anon;


-- ---------------------------------------------------------------------
--  4. THE CUSTOMER CAN SEE THEIR ATTEMPTS
--
--  Chiefly so a payment that is still settling says so, rather than
--  looking like it vanished.
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
    'bank', (select to_jsonb(s) - 'id' - 'updated_at' - 'notify_email'
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
    -- Only the recent ones: an abandoned checkout from March is noise.
    'cardAttempts', coalesce((select jsonb_agg(jsonb_build_object(
                 'reference', i.reference, 'amount', i.amount,
                 'status', i.status, 'createdAt', i.created_at,
                 'paidAt', i.paid_at)
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
--  Check: the table, and that settling is not reachable from the client.
-- ---------------------------------------------------------------------
select has_function_privilege('authenticated', 'public.settle_card_payment(text, numeric, numeric, text)', 'execute')
         as authenticated_can_settle_should_be_false,
       has_function_privilege('authenticated', 'public.start_card_payment(numeric)', 'execute')
         as authenticated_can_start_should_be_true;
