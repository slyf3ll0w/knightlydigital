// Mint a prod NextAuth session cookie for live verification (Turnstile blocks
// scripted logins). Usage:
//   AUTH_SECRET=... DATABASE_URL=... node scripts/debug-mint-cookie.mjs demo@streamflaremedia.com
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";

const email = process.argv[2] ?? "demo@streamflaremedia.com";
const prisma = new PrismaClient();
// email alone stopped being unique when multi-company memberships landed
// (email_companyId compound) — take the oldest active membership.
const user = await prisma.user.findFirst({
  where: { email, isActive: true },
  orderBy: { createdAt: "asc" },
  select: { id: true, name: true, email: true, role: true, companyId: true },
});
if (!user) {
  console.error(`No user ${email}`);
  process.exit(1);
}
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
  maxAge: 60 * 60 * 4,
});
console.log(JSON.stringify({ userId: user.id, companyId: user.companyId, token }));
await prisma.$disconnect();
