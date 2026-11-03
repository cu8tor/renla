-- =====================================================================
--  RENLA — catch-up migration 23: honour the advertised annual discount
--
--  Run ONCE in Supabase → SQL Editor → New query → Run. Safe to re-run.
--  Requires catch-up-migration-22.sql first.
--
--  ---------------------------------------------------------------------
--  WHY
--
--  The landing page advertises Annual at −20%. Renla charged 10 months
--  out of 12, which is −16.67%. "Pay for ten months, get twelve" reads
--  like a bigger saving than it is: two months free out of twelve is
--  2/12, not a fifth.
--
--  On Growth at 27 staff the page quotes ₦14,880/month — ₦178,560 for
--  the year — and the old term billed ₦186,000. A customer who read the
--  page was going to be charged ₦7,440 more than it promised.
--
--  The page is the public promise, so the app moves. 20% off twelve
--  months is 9.6 months charged, which prices the page's figure exactly:
--  a company at ₦18,600 a month pays 18,600 × 9.6 = ₦178,560.
--
--  Quarterly already agreed (2.70 / 3 = exactly 10%) and is untouched.
-- =====================================================================

update public.billing_terms
   set months_charged = 9.60,
       -- Had to change with the number: at 9.6 months charged, "pay for
       -- ten months, get twelve" is no longer true, and the figure on the
       -- page is a fifth. 12 − 9.6 = 2.4 months given away.
       blurb = 'A fifth off the year — nearly two and a half months free.'
 where key = 'annual';


-- ---------------------------------------------------------------------
--  Check: the ladder, and that it now matches the landing page.
--
--  Expect 0 / 10 / 15 / 20.
-- ---------------------------------------------------------------------
select key, name, period_months, months_charged,
       round(100 - (months_charged / period_months * 100), 1) as percent_saved,
       -- What a company charged ₦18,600 a month would pay, which is the
       -- Growth-at-27-staff case the mismatch was found with.
       round(18600 * months_charged) as price_at_18600_monthly
  from public.billing_terms
 order by sort_order;
