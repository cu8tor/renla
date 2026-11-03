// =====================================================================
//  paystack-init — Supabase Edge Function
//
//  Deploy:  supabase functions deploy paystack-init
//  Turn OFF "Verify JWT with legacy secret" on it, same as the others.
//
//  Secrets to set (Edge Functions → Secrets):
//    PAYSTACK_SECRET_KEY   sk_live_... (or sk_test_... while testing)
//  Already set, shared with send-invite:
//    APP_URL
//
//  ---------------------------------------------------------------------
//  Starts a card payment and hands back a Paystack checkout URL.
//
//  It forwards the caller's own JWT, so start_card_payment runs as them
//  and can only mint a reference for their own company. The amount is
//  the only thing the browser gets to choose, and the database bounds it.
//
//  Nothing here credits anything. The wallet moves in paystack-webhook,
//  on Paystack's signed word that the money arrived.
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_URL") ?? "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    // A bare throw here becomes a Supabase 500 with no CORS headers, and
    // the browser then reports it as a CORS violation — which sends you
    // looking at origins for an hour instead of reading the real error.
    // So every failure leaves here as JSON the page can actually show.
    const msg = e instanceof Error ? e.message : String(e);
    console.error("paystack-init crashed:", msg, e instanceof Error ? e.stack : "");
    return json({ error: msg }, 500);
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Not signed in." }, 401);

  const key = (Deno.env.get("PAYSTACK_SECRET_KEY") ?? "").trim();
  if (!key) return json({ error: "Card payment isn't set up yet." }, 503);

  let body: { amount?: number; term?: string | null };
  try { body = await req.json(); } catch { return json({ error: "Bad request body." }, 400); }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: "How much do you want to pay?" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );

  // Mints the reference against the caller's own company and bounds the
  // amount. If they aren't HR of a company, this is where it stops.
  const { data: intent, error: intentErr } = await supabase
    .rpc("start_card_payment", { p_amount: amount, p_term: body.term ?? null });

  if (intentErr) return json({ error: intentErr.message }, 400);
  if (!intent?.reference) return json({ error: "Couldn't start that payment." }, 400);

  const appUrl = (Deno.env.get("APP_URL") ?? "https://app.renla.app").replace(/\/+$/, "");

  let res: Response;
  try {
    res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        // Paystack works in kobo. Rounding rather than truncating, so a
        // stray fraction can never under-charge.
        amount: Math.round(Number(intent.amount) * 100),
        email: intent.email,
        reference: intent.reference,
        currency: "NGN",
        callback_url: `${appUrl}/billing?ref=${encodeURIComponent(intent.reference)}`,
        metadata: {
          company_name: intent.companyName,
          // Shown on the Paystack dashboard, so a payment can be matched
          // by eye without opening Renla.
          custom_fields: [
            { display_name: "Company", variable_name: "company", value: intent.companyName },
          ],
        },
      }),
    });
  } catch (e) {
    await supabase.rpc("fail_card_payment", { p_reference: intent.reference }).catch(() => {});
    return json({ error: e instanceof Error ? e.message : "Couldn't reach Paystack." }, 502);
  }

  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.status || !payload?.data?.authorization_url) {
    // Don't leave a pending intent behind for a checkout that never
    // existed — it would sit on the customer's billing page forever.
    await supabase.rpc("fail_card_payment", { p_reference: intent.reference }).catch(() => {});
    return json({ error: payload?.message || "Paystack wouldn't start that payment." }, 502);
  }

  return json({
    ok: true,
    url: payload.data.authorization_url,
    reference: intent.reference,
    amount: Number(intent.amount),
  });
}
