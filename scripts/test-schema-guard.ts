/**
 * lib/schema-guard.ts — which pending schema changes a deploy refuses.
 *   npx tsx scripts/test-schema-guard.ts
 */
import assert from "node:assert/strict";
import { destructiveChanges, parseApprovals, unapprovedChanges } from "../lib/schema-guard";

// Additive changes: nothing to refuse
assert.deepEqual(
  destructiveChanges(`-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "setupNudgeSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Place_companyId_name_key" ON "Place"("companyId", "name");

-- DropIndex
DROP INDEX "Invoice_deposit_idx";

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "bookable" SET DEFAULT true,
ALTER COLUMN "name" DROP NOT NULL;
`),
  []
);
assert.deepEqual(destructiveChanges("-- This is an empty migration."), []);

// A rename in schema.prisma = drop + add in ONE statement; a removed table
assert.deepEqual(
  destructiveChanges(`/*
  Warnings:
  - You are about to drop the column \`phone\` on the \`Company\` table. All the data in the column will be lost.
*/
-- AlterTable
ALTER TABLE "Company" DROP COLUMN "phone",
DROP COLUMN "legalName",
ADD COLUMN     "phoneNumber" TEXT;

-- DropTable
DROP TABLE "WebForm";
`),
  ['DROP COLUMN "Company"."phone"', 'DROP COLUMN "Company"."legalName"', 'DROP TABLE "WebForm"']
);

// Type changes, removing an enum value (Prisma's swap dance), schema-qualified names
assert.deepEqual(
  destructiveChanges(`-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('OWNER', 'TECH');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
COMMIT;

-- AlterTable
ALTER TABLE "public"."Invoice" ALTER COLUMN "total" SET DATA TYPE INTEGER;

-- DropEnum
DROP TYPE "public"."Legacy";
`),
  ['CHANGE TYPE "User"."role"', 'DROP TYPE "Role_old"', 'CHANGE TYPE "Invoice"."total"', 'DROP TYPE "Legacy"']
);

// A comment that mentions a drop is not a drop
assert.deepEqual(destructiveChanges(`-- DROP TABLE "Company"; just a note\nALTER TABLE "A" ADD COLUMN "b" TEXT;`), []);

// Approvals: exact change, dated, good for 14 days
const approvals = parseApprovals(`# header
2026-11-16 DROP COLUMN "Company"."phone"

2026-10-01 DROP TABLE "WebForm"
not a line
`);
assert.equal(approvals.length, 2);
const today = new Date("2026-11-20T15:00:00Z");
const changes = ['DROP COLUMN "Company"."phone"', 'DROP TABLE "WebForm"', 'DROP COLUMN "Company"."legalName"'];
assert.deepEqual(unapprovedChanges(changes, approvals, today), ['DROP TABLE "WebForm"', 'DROP COLUMN "Company"."legalName"']);
// …and the same approval has lapsed a month later
assert.deepEqual(unapprovedChanges(['DROP COLUMN "Company"."phone"'], approvals, new Date("2026-12-20T00:00:00Z")), [
  'DROP COLUMN "Company"."phone"',
]);
// Nothing destructive = nothing to approve
assert.deepEqual(unapprovedChanges([], [], today), []);

console.log("test-schema-guard: ok");
