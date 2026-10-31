// =====================================================================
//  send-invite — Supabase Edge Function
//
//  Deploy:  supabase functions deploy send-invite
//
//  Secrets it needs:
//    RESEND_API_KEY   re_...        (Resend → API Keys)
//    MAIL_FROM        Renla <hello@renla.app>
//    APP_URL          https://app.renla.app
//
//  SUPABASE_URL and SUPABASE_ANON_KEY are injected automatically.
//
//  Mail goes out over Resend's HTTPS API rather than SMTP. The earlier
//  SMTP version could not authenticate against Hostinger from Deno —
//  implicit TLS on 465 came back 535, STARTTLS on 587 failed the
//  handshake outright — and neither is something this code can fix. An
//  HTTP POST has no handshake to go wrong, and it returns an error
//  message worth reading when something is misconfigured.
//
//  MAIL_FROM's domain must be verified in Resend first. Note renla.app's
//  DNS is delegated to Vercel's nameservers, so Resend's records go in
//  Vercel's DNS page, NOT Hostinger's zone editor — records added in
//  Hostinger won't resolve and the domain will never verify.
//
//  Note there is NO service-role key here. The function forwards the
//  caller's own JWT to Postgres, so create_invite() applies its own
//  "are you an HR Admin in this company" check. A stolen deploy of this
//  function grants nothing that the caller couldn't already do.
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_URL") ?? "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function emailHtml(name: string, company: string, link: string, days: number) {
  const first = escape(name.split(" ")[0] || "there");
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e6e6e1;border-radius:14px;padding:32px">
    <div style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin-bottom:20px">Renla</div>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Hi ${first},</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">${escape(company)} has set up your account on Renla, where you'll clock in and out, book leave, and see your payslips.</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 24px">Click below to pick a password and finish setting up. You'll need to use this email address — the link won't work with another one.</p>
    <a href="${link}" style="display:inline-block;background:#12513c;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">Set up my account</a>
    <p style="font-size:13px;line-height:1.6;color:#6b6b66;margin:24px 0 0">This link expires in ${days} days and can only be used once. If it stops working, ask your HR team to send a new one.</p>
    <p style="font-size:12px;line-height:1.6;color:#6b6b66;margin:16px 0 0;word-break:break-all">If the button doesn't work, paste this into your browser:<br>${escape(link)}</p>
  </div>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Not signed in." }, 401);

  let body: { employeeId?: string; email?: string; name?: string; role?: string; days?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request body." }, 400);
  }

  const employeeId = (body.employeeId ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const name = (body.name ?? "").trim();
  const role = (body.role ?? "Employee").trim();
  const days = Math.min(30, Math.max(1, Number(body.days) || 7));

  if (!employeeId) return json({ error: "Missing employee." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "That doesn't look like a valid email address." }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );

  // Authorisation lives in the function, not here.
  const { data: token, error } = await supabase.rpc("create_invite", {
    p_employee_id: employeeId,
    p_email: email,
    p_role: role,
    p_days: days,
  });
  if (error) return json({ error: error.message }, 400);

  const appUrl = (Deno.env.get("APP_URL") ?? "https://app.renla.app").replace(/\/+$/, "");
  const link = `${appUrl}/join?invite=${encodeURIComponent(token as string)}`;

  // Who's inviting — only for the email copy, so a failure here is not fatal.
  let company = "Your employer";
  try {
    const { data } = await supabase.from("companies").select("name").maybeSingle();
    if (data?.name) company = data.name;
  } catch { /* keep the fallback wording */ }

  // Secrets pasted into a dashboard field pick up stray whitespace and a
  // trailing newline alarmingly often. Trim rather than let that cost
  // another hour of debugging a perfectly correct key.
  const apiKey = (Deno.env.get("RESEND_API_KEY") ?? "").trim();
  const from = (Deno.env.get("MAIL_FROM") ?? "Renla <hello@renla.app>").trim();

  // The invite row already exists and the link already works, so every
  // path below hands the link back rather than losing it. A failure here
  // costs HR a copy-and-paste, not the invite.
  const handBack = (why: string) =>
    json({ ok: false, link, error: `The invite was created but the email didn't send: ${why}` }, 200);

  if (!apiKey) return handBack("RESEND_API_KEY is not set on this function.");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `${company} has invited you to Renla`,
        text: `Hi ${name.split(" ")[0] || "there"},\n\n${company} has set up your account on Renla.\n\nSet up your account: ${link}\n\nUse this email address when you sign up — the link won't work with another one. It expires in ${days} days and can only be used once.`,
        html: emailHtml(name, company, link, days),
      }),
    });

    if (!res.ok) {
      // Resend explains itself in the body — an unverified sending domain,
      // a revoked key, a malformed From. Surface that instead of a bare
      // status code, since the message is usually the whole answer.
      let detail = `${res.status}`;
      try {
        const body = await res.json();
        if (body?.message) detail = body.message;
        else if (body?.error) detail = typeof body.error === "string" ? body.error : JSON.stringify(body.error);
      } catch { /* non-JSON body — the status alone will have to do */ }
      return handBack(detail);
    }
  } catch (e) {
    return handBack(e instanceof Error ? e.message : String(e));
  }

  return json({ ok: true, link });
});
