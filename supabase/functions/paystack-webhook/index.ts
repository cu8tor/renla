// =====================================================================
//  paystack-webhook — Supabase Edge Function
//
//  Deploy:  supabase functions deploy paystack-webhook
//  Turn OFF "Verify JWT with legacy secret" — Paystack is not a signed-in
//  user and sends no JWT. This function is deliberately public, and the
//  signature below is what makes that safe.
//
//  Then in the Paystack dashboard → Settings → API Keys & Webhooks, set
//  the Live webhook URL to:
//    https://<project-ref>.supabase.co/functions/v1/paystack-webhook
//
//  Secrets:
//    PAYSTACK_SECRET_KEY   the same key as paystack-init
//
//  ---------------------------------------------------------------------
//  THIS IS THE ONLY THING THAT PUTS MONEY IN A WALLET.
//
//  Which is why it does three things before it believes anything:
//
//   1. Verifies the x-paystack-signature — HMAC SHA512 of the RAW body
//      with the secret key. Without this, the URL is public and anyone
//      who finds it can credit themselves whatever they like.
//
//   2. Looks the reference up in payment_intents rather than trusting the
//      payload's idea of which company this is. A payload can claim
//      anything; a reference we minted can only mean the company we
//      minted it for.
//
//   3. Asks Paystack to confirm the transaction independently. The
//      signature already proves the body came from them, so this is
//      belt and braces — but it is a money ledger, and the second check
//      costs one HTTP call.
//
//  It always answers 200 once it has a valid signature, including for
//  events it ignores and payments it has already settled. A non-200 makes
//  Paystack retry for days.
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/* Constant-time compare. A plain === leaks, through timing, how much of
   a guessed signature was right, which is enough to forge one given
   enough attempts. */
function sameSignature(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha512Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    // 500 is right here: Paystack retries, and settling is idempotent, so
    // a crash costs a delay rather than a payment. The log is the point.
    const msg = e instanceof Error ? e.message : String(e);
    console.error("paystack-webhook crashed:", msg, e instanceof Error ? e.stack : "");
    return json({ error: msg }, 500);
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const key = (Deno.env.get("PAYSTACK_SECRET_KEY") ?? "").trim();
  if (!key) {
    console.error("PAYSTACK_SECRET_KEY is not set — cannot verify anything.");
    return json({ error: "Not configured" }, 503);
  }

  // The raw text, byte for byte. Parsing and re-stringifying would change
  // key order and whitespace, and the signature would never match.
  const raw = await req.text();
  const sent = (req.headers.get("x-paystack-signature") ?? "").trim().toLowerCase();
  if (!sent) return json({ error: "Unsigned" }, 401);

  const expected = await hmacSha512Hex(key, raw);
  if (!sameSignature(sent, expected)) {
    console.warn("Rejected a webhook with a bad signature.");
    return json({ error: "Bad signature" }, 401);
  }

  let event: { event?: string; data?: Record<string, unknown> };
  try { event = JSON.parse(raw); } catch { return json({ ok: true, ignored: "unparseable" }); }

  const reference = String(event?.data?.reference ?? "").trim();
  if (!reference) return json({ ok: true, ignored: "no reference" });

  // Service role: Paystack is not a user, and settle_card_payment is
  // deliberately not callable by anyone who is. The key is injected by
  // Supabase — there is nothing to set.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  if (event.event === "charge.failed") {
    await admin.rpc("fail_card_payment", { p_reference: reference });
    return json({ ok: true, failed: reference });
  }

  if (event.event !== "charge.success") {
    return json({ ok: true, ignored: event.event ?? "unknown" });
  }

  // Independent confirmation. If Paystack won't vouch for it on its own
  // API, nothing gets credited however well-signed the body was.
  let verified: Record<string, unknown> | null = null;
  try {
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    const body = await res.json().catch(() => null);
    if (res.ok && body?.status && body?.data) verified = body.data as Record<string, unknown>;
  } catch (e) {
    console.error("Couldn't verify with Paystack:", e instanceof Error ? e.message : e);
  }

  if (!verified) {
    // Paystack unreachable rather than the payment being bad. Returning
    // 500 asks it to retry, which is what we want — settling is
    // idempotent, so a later retry is safe.
    return json({ error: "Could not verify; retry please." }, 500);
  }

  if (String(verified.status) !== "success") {
    await admin.rpc("fail_card_payment", { p_reference: reference });
    return json({ ok: true, notSuccessful: String(verified.status) });
  }

  // Kobo to naira, from the verified record rather than the webhook body.
  const naira = Number(verified.amount ?? 0) / 100;
  const fees = verified.fees == null ? null : Number(verified.fees) / 100;

  if (!Number.isFinite(naira) || naira <= 0) {
    return json({ ok: true, ignored: "no amount" });
  }

  const { data, error } = await admin.rpc("settle_card_payment", {
    p_reference: reference,
    p_amount: naira,
    p_fees: fees,
    p_channel: verified.channel == null ? null : String(verified.channel),
  });

  if (error) {
    // The money is real and we failed to record it. Retry.
    console.error("settle_card_payment failed:", error.message, "ref:", reference);
    return json({ error: error.message }, 500);
  }

  console.log("Settled", reference, JSON.stringify(data));
  return json({ ok: true, reference, result: data });
}
