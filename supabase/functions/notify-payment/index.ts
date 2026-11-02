// =====================================================================
//  notify-payment — Supabase Edge Function
//
//  Deploy:  supabase functions deploy notify-payment
//  Turn OFF "Verify JWT with legacy secret" on it, same as the others.
//
//  Secrets (already set for send-invite — these are shared):
//    RESEND_API_KEY
//    MAIL_FROM
//    APP_URL
//
//  ---------------------------------------------------------------------
//  Tells Renla that a customer says they've paid.
//
//  It forwards the caller's own JWT, so the request it reads back is one
//  that RLS already allowed them to see — a company can't trigger a
//  notification about somebody else's payment by passing a different id.
//  No service-role key here.
//
//  The receipt goes out as a signed link rather than an attachment: the
//  link needs a valid signature and expires, whereas an attached
//  screenshot of somebody's bank app lives in an inbox forever.
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_URL") ?? "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const escape = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const naira = (n: unknown) => "₦" + Number(n ?? 0).toLocaleString("en-NG");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Not signed in." }, 401);

  let body: { requestId?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request body." }, 400); }

  const requestId = (body.requestId ?? "").trim();
  if (!requestId) return json({ error: "Missing request." }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );

  // Read it back as the caller. If RLS wouldn't show them this row, there
  // is nothing to notify about — which is what stops one company raising
  // a notification about another's payment.
  const { data: reqRow, error: reqErr } = await supabase
    .from("billing_requests")
    .select("id, company_id, kind, requested_term, amount, note, receipt_path, created_at")
    .eq("id", requestId)
    .maybeSingle();

  if (reqErr) return json({ error: reqErr.message }, 400);
  if (!reqRow) return json({ error: "No such request." }, 404);

  const { data: company } = await supabase
    .from("companies").select("name").eq("id", reqRow.company_id).maybeSingle();

  const { data: settings } = await supabase
    .from("platform_settings").select("notify_email").maybeSingle();

  const to = (settings?.notify_email || "hello@renla.app").trim();
  const apiKey = (Deno.env.get("RESEND_API_KEY") ?? "").trim();
  const from = (Deno.env.get("MAIL_FROM") ?? "Renla <hello@renla.app>").trim();

  // A link rather than the file. Seven days is long enough to act on and
  // short enough that a forwarded email stops working.
  let receiptUrl = "";
  if (reqRow.receipt_path) {
    const { data: signed } = await supabase.storage
      .from("payment-receipts").createSignedUrl(reqRow.receipt_path, 60 * 60 * 24 * 7);
    receiptUrl = signed?.signedUrl || "";
  }

  // The request is already saved. A failed email costs a notification,
  // not the claim — it's still sitting in the admin queue either way.
  if (!apiKey) return json({ ok: false, error: "No mail key configured." }, 200);

  const appUrl = (Deno.env.get("APP_URL") ?? "https://app.renla.app").replace(/\/+$/, "");
  const name = company?.name || "A customer";
  const term = reqRow.requested_term ? ` (${reqRow.requested_term})` : "";

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e6e6e1;border-radius:14px;padding:32px">
    <div style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin-bottom:6px">Renla</div>
    <p style="font-size:13px;color:#6b6b66;margin:0 0 20px">Payment claimed</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">
      <b>${escape(name)}</b> says they've transferred <b>${naira(reqRow.amount)}</b>${escape(term)}.
    </p>
    ${reqRow.note ? `<p style="font-size:14px;line-height:1.6;margin:0 0 16px;color:#444">“${escape(reqRow.note)}”</p>` : ""}
    ${receiptUrl
      ? `<p style="margin:0 0 20px"><a href="${receiptUrl}" style="display:inline-block;background:#12513c;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:9px">View receipt</a></p>
         <p style="font-size:12px;color:#6b6b66;margin:0 0 20px">That link expires in 7 days.</p>`
      : `<p style="font-size:13px;color:#a05a00;margin:0 0 20px">No receipt attached — you'll need to match this against the bank yourself.</p>`}
    <p style="font-size:14px;line-height:1.6;margin:0">
      Check the bank, then record it in
      <a href="${appUrl}/admin" style="color:#12513c">Renla admin</a>.
    </p>
  </div>
</body></html>`;

  const text = `${name} says they've transferred ${naira(reqRow.amount)}${term}.\n`
    + (reqRow.note ? `\n"${reqRow.note}"\n` : "")
    + (receiptUrl ? `\nReceipt (expires in 7 days): ${receiptUrl}\n` : `\nNo receipt attached.\n`)
    + `\nCheck the bank, then record it: ${appUrl}/admin\n`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `${name} says they've paid ${naira(reqRow.amount)}`,
        text,
        html,
      }),
    });
    if (!res.ok) {
      let detail = String(res.status);
      try {
        const b = await res.json();
        detail = b?.message || (typeof b?.error === "string" ? b.error : detail);
      } catch { /* status alone */ }
      return json({ ok: false, error: detail }, 200);
    }
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }

  return json({ ok: true });
});
