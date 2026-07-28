// Live verification of the Atlas access gate (2026-07-28).
// Usage: AUTH_SECRET=... DATABASE_URL=<public> node scripts/debug-verify-assistant-gate.mjs
//
// Zero-AI-spend by design: the blocked company gets a real prompt (403 fires
// before the model is called); the allowed company sends empty messages so it
// passes the gate and dies at input validation (400) without touching Gemini.
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import { createSuperadminSessionToken } from "../lib/superadmin-session.ts";

const BASE = "https://workbenchfsm.com";
const prisma = new PrismaClient();

async function mintNextAuth(email) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true, companyId: true },
  });
  if (!user) throw new Error(`No user ${email}`);
  const token = await encode({
    token: {
      name: user.name,
      email: user.email,
      sub: user.id,
      id: user.id,
      role: user.role,
      companyId: user.companyId,
    },
    secret: process.env.AUTH_SECRET,
    maxAge: 60 * 30,
  });
  return { user, cookie: `__Secure-next-auth.session-token=${token}` };
}

async function callAssistant(cookie, messages) {
  const res = await fetch(`${BASE}/api/app/assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ messages }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// 1. New columns exist + values
const gated = await prisma.company.findFirst({
  where: { paymentsWaived: true },
  select: {
    id: true, name: true, assistantEnabled: true, finixSandboxApproved: true,
    users: { where: { isActive: true }, take: 1, select: { email: true } },
  },
});
console.log("waived company:", gated?.name, {
  assistantEnabled: gated?.assistantEnabled,
  finixSandboxApproved: gated?.finixSandboxApproved,
});

// 2. Blocked: waived company user with a real prompt → expect 403
if (gated?.users[0]) {
  const { cookie } = await mintNextAuth(gated.users[0].email);
  const r = await callAssistant(cookie, [{ role: "user", content: "hi" }]);
  console.log(`BLOCKED check (${gated.name}): status=${r.status}`, r.body);
} else {
  console.log("BLOCKED check skipped — waived company has no active user");
}

// 3. Allowed: demo owner with empty messages → expect 400 (gate passed, no AI call)
const demo = await mintNextAuth("demo@streamflaremedia.com");
const rAllowed = await callAssistant(demo.cookie, []);
console.log(`ALLOWED check (demo co): status=${rAllowed.status}`, rAllowed.body);

// 4. Superadmin toggle round-trip on the waived company
const sa = await prisma.user.findFirst({
  where: { role: "SUPERADMIN", isActive: true },
  select: { id: true, email: true },
});
if (sa && gated) {
  const saCookie = `wb-superadmin=${await createSuperadminSessionToken(sa.id)}`;
  for (const action of ["assistant-on", "assistant-default"]) {
    const res = await fetch(`${BASE}/api/superadmin/companies/${gated.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: saCookie },
      body: JSON.stringify({ action }),
    });
    const after = await prisma.company.findUnique({
      where: { id: gated.id },
      select: { assistantEnabled: true },
    });
    console.log(`superadmin ${action}: status=${res.status} → assistantEnabled=${after.assistantEnabled}`);
  }
} else {
  console.log("superadmin toggle check skipped:", { sa: !!sa, gated: !!gated });
}

await prisma.$disconnect();
