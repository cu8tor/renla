-- =====================================================================
--  RENLA — catch-up migration 16: payment receipts
--
--  Run ONCE in Supabase → SQL Editor → New query → Run. Safe to re-run.
--  Requires catch-up-migration-15.sql first.
--
--  WARNING NOTE: Supabase flags this as "destructive" for containing
--  `alter`, `drop policy` and `insert` into storage.buckets. It adds one
--  bucket, two columns and three policies. Nothing is deleted.
--
--  ---------------------------------------------------------------------
--  WHY
--
--  A bank transfer arrives with a narration and nothing else. Matching
--  it to a company by hand works at six customers and stops working
--  somewhere after that — and the customer has no way to say "I've
--  paid, here's the proof" except by email.
--
--  Sharing a receipt is how this is actually done here, so the product
--  should do it properly: the customer says how much they sent, attaches
--  the transfer receipt, and Renla gets told. The receipt is the thing
--  that makes a transfer identifiable, so it matters more than the
--  amount they typed.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. WHERE RECEIPTS GO
--
--  Private bucket, 5 MB a file, images and PDFs only — a transfer
--  receipt is a screenshot or a bank PDF and nothing else.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-receipts', 'payment-receipts', false, 5 * 1024 * 1024,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Files live at {company_id}/{timestamp}-{name}, the same
-- folder-per-tenant convention the other buckets use.
drop policy if exists receipts_hr_insert on storage.objects;
create policy receipts_hr_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-receipts'
    and exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and p.role = 'HR Admin'
         and p.company_id::text = (storage.foldername(name))[1]
    )
  );

-- A company's own HR can see what they sent; Renla can see everything.
drop policy if exists receipts_read on storage.objects;
create policy receipts_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (
      exists (
        select 1 from public.profiles p
         where p.id = auth.uid()
           and p.role = 'HR Admin'
           and p.company_id::text = (storage.foldername(name))[1]
      )
      or public.is_platform_admin()
    )
  );

-- Deliberately no update or delete policy. A receipt is evidence of a
-- payment claim: once sent it stays, so a dispute can always be checked
-- against what was actually submitted.


-- ---------------------------------------------------------------------
--  2. THE RECEIPT ON THE REQUEST
-- ---------------------------------------------------------------------
alter table public.billing_requests
  add column if not exists receipt_path text;

-- Where to tell Renla a payment has been claimed.
alter table public.platform_settings
  add column if not exists notify_email text not null default 'hello@renla.app';


-- ---------------------------------------------------------------------
--  3. WHAT RENLA SEES, WITH THE RECEIPT
-- ---------------------------------------------------------------------
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
    'amount', r.amount, 'note', r.note, 'receiptPath', r.receipt_path,
    'createdAt', r.created_at
  ) order by r.created_at), '[]'::jsonb) into v
  from public.billing_requests r
  join public.companies c on c.id = r.company_id
  where r.status = 'open';

  return v;
end;
$$;

-- my_billing() gains the receipt too, so a customer can see what they
-- attached rather than wondering whether it went through.
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
               from public.billing_requests r where r.company_id = c.id), '[]'::jsonb)
  ) into v
  from public.companies c
  left join public.plans p on p.key = c.plan
  where c.id = v_company;

  return v;
end;
$$;

grant execute on function public.my_billing() to authenticated;
grant execute on function public.admin_open_requests() to authenticated;


-- Check: the bucket, and where notifications will be sent.
select id, file_size_limit, allowed_mime_types from storage.buckets where id = 'payment-receipts';
select notify_email, bank_name, account_number from public.platform_settings;
