// Direct read-only Prisma access for assertions the public API can't express
// (autopay retry columns, anchoredAt, SavedCard rows). Specs must treat this
// as a microscope, not a write path — every mutation goes through the app.
import { PrismaClient } from "@prisma/client";
import { loadE2eEnv } from "../env";

let client: PrismaClient | null = null;

export function db(): PrismaClient {
  if (!client) {
    loadE2eEnv();
    client = new PrismaClient();
  }
  return client;
}

export async function disconnectDb(): Promise<void> {
  await client?.$disconnect();
  client = null;
}
