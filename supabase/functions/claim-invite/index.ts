// =====================================================================
//  claim-invite — Supabase Edge Function
//
//  Deploy:  supabase functions deploy claim-invite
//
//  Secrets it needs:
//    SUPABASE_SERVICE_ROLE_KEY   Project Settings → API → service_role
//    APP_URL                     https://app.renla.app
//
//  SUPABASE_URL is injected automatically.
//
//  ---------------------------------------------------------------------
//  This is the ONE function that holds the service-role key, and it does
//  exactly one privileged thing: create an auth user whose email is
//  already confirmed.
//
//  Why that's justified rather than a shortcut: the invite was emailed
//  to this address and accept_invite refuses to run unless the signed-in
//  email matches it. Receiving the token IS proof of owning the mailbox,
//  so making the person click a second confirmation link proves nothing
//  that hasn't already been proven — it just adds a round-trip that
//  loses the token and drops them on a "create or join a company?"
//  screen they should never see.
//
//  What it deliberately does NOT do: link the account to a company. That
//  still happens in accept_invite, under the caller's own JWT, with its
//  own expiry/revocation/email checks. A stolen service-role key would
//  let someone create confirmed accounts; it would not let them into
//  anyone's company data.
//
//  It also refuses to touch an email that already has an account — no
//  password overwrite, ever. Those people sign in normally instead.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { token?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request body." }, 400);
  }

  const token = (body.token ?? "").trim();
  const password = body.password ?? "";

  if (!token) return json({ error: "That invite link is not valid." }, 400);
  if (password.length < 8) return json({ error: "Pick a password of at least 8 characters." }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!serviceKey) return json({ error: "This server is missing its service key — tell your HR team." }, 500);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Validate the token through the same read-only function the join page
  // uses. It returns nothing for an unknown, used or cancelled invite, so
  // there is no way to create an account without a live one.
  const { data: rows, error: lookupErr } = await admin.rpc("invite_details", { p_token: token });
  if (lookupErr) return json({ error: lookupErr.message }, 400);

  const invite = Array.isArray(rows) ? rows[0] : rows;
  if (!invite) return json({ error: "That invite link has already been used, or was cancelled." }, 400);
  if (invite.is_expired) return json({ error: "That invite has expired — ask your HR team to send a new one." }, 400);

  const email = String(invite.invite_email).toLowerCase();

  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,                       // the invite already proved this address
    user_metadata: { full_name: invite.employee_name ?? "" },
  });

  if (createErr) {
    // Already has an account. Never overwrite a password from here — that
    // would turn a leaked invite link into account takeover. Send them to
    // sign in with what they already have.
    const msg = (createErr.message || "").toLowerCase();
    if (msg.includes("already") || msg.includes("exists") || msg.includes("registered")) {
      return json({ ok: true, email, existing: true });
    }
    return json({ error: createErr.message }, 400);
  }

  // The account exists and is confirmed. The caller now signs in with it
  // and calls accept_invite itself, so the company link is still made
  // under that person's own JWT and never with this key.
  return json({ ok: true, email, existing: false });
});
