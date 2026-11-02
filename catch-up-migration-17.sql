-- =====================================================================
--  RENLA — catch-up migration 17: approving a payment actually pays
--
--  Run ONCE in Supabase → SQL Editor → New query → Run. Safe to re-run.
--  Requires catch-up-migration-16.sql first.
--
--  ---------------------------------------------------------------------
--  WHY
--
--  The tick in the requests queue called admin_resolve_request, which
--  sets status = 'done' and nothing else. That was right when the queue
--  held term requests and you recorded the payment separately. It is
--  wrong now the queue holds payment claims: the button looks like
--  "approve" and approves nothing, so the claim disappears and the
--  wallet is untouched.
--
--  Worse than a button that doesn't work — it's a button that looks like
--  it worked. Cura's ₦5,000 was marked done and never credited.
--
--  So approving is now one action that settles the claim and moves the
--  money together, or does neither.
-- =====================================================================


-- ---------------------------------------------------------------------
--  APPROVE
--
--  Returns what it did, so the screen can say it rather than guess.
-- ---------------------------------------------------------------------
create or replace function public.admin_approve_request(
  p_id uuid, p_amount numeric default null, p_reference text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req    public.billing_requests%rowtype;
  v_amount numeric;
  v_ref    text;
  v_out    jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Not permitted.';
  end if;

  -- Close the claim FIRST, and only if it is still open. A second click,
  -- a double-tap on a phone or two admins on the same queue then finds
  -- nothing to close and credits nothing — rather than paying twice.
  update public.billing_requests
     set status = 'done', resolved_at = now(), resolved_by = auth.uid()
   where id = p_id and status = 'open'
  returning * into v_req;

  if v_req.id is null then
    raise exception 'That request has already been handled.';
  end if;

  -- A plan change moves no money.
  if v_req.kind = 'plan_change' then
    perform public.admin_set_plan(v_req.company_id, v_req.requested_plan);
    return jsonb_build_object('kind', 'plan_change', 'plan', v_req.requested_plan);
  end if;

  -- The customer typed the amount; the bank is what actually happened.
  -- The override is there for when those two disagree, which they will.
  v_amount := coalesce(p_amount, v_req.amount);
  if v_amount is null or v_amount <= 0 then
    raise exception 'Nothing to credit — enter the amount that actually arrived.';
  end if;

  v_ref := coalesce(nullif(trim(p_reference), ''), 'Claim ' || left(v_req.id::text, 8));

  if v_req.kind = 'term_change' and v_req.requested_term is not null then
    -- Credits the payment, posts the discount as its own line, and moves
    -- paid_through forward — all of which already lives in one place.
    v_out := public.admin_apply_term_payment(
               v_req.company_id, v_req.requested_term, v_amount, v_ref);
  else
    perform public.admin_record_payment(
              v_req.company_id, v_amount, v_ref, 'Wallet funding');
    v_out := jsonb_build_object('credited', v_amount);
  end if;

  return v_out
      || jsonb_build_object('kind', v_req.kind,
                            'company', v_req.company_id,
                            'claimed', v_req.amount,
                            'balance', public.company_balance(v_req.company_id));
end;
$$;

grant execute on function public.admin_approve_request(uuid, numeric, text) to authenticated;


-- ---------------------------------------------------------------------
--  Check: approving is available, and the old resolve still exists for
--  declining.
-- ---------------------------------------------------------------------
select p.proname, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('admin_approve_request', 'admin_resolve_request')
 order by p.proname;
