/**
 * One-time Telnyx voice setup per environment (lib/voice.ts needs it):
 *   1. an outbound voice profile (US/CA, conversational) every dial goes through
 *   2. a Call Control application whose webhook is <base>/api/public/webhooks/telnyx/voice
 * Prints the application id to put in TELNYX_VOICE_APP_ID. Run once for
 * production and once for staging (each app has exactly one webhook URL):
 *
 *   TELNYX_API_KEY=… npx tsx scripts/telnyx-voice-setup.ts https://workbenchfsm.com
 *   TELNYX_API_KEY=… npx tsx scripts/telnyx-voice-setup.ts https://streamflaire-staging.up.railway.app
 *
 * Numbers already attached before the variable is set move onto the app the
 * next time the tenant saves their ring-through number, or from the
 * superadmin company page ("move onto the voice app").
 */
import { createCallControlApp, createOutboundVoiceProfile } from "../lib/telnyx";

async function main() {
  const base = (process.argv[2] ?? "").replace(/\/+$/, "");
  if (!/^https:\/\//.test(base)) {
    console.error("Usage: npx tsx scripts/telnyx-voice-setup.ts https://<app host>");
    process.exit(1);
  }
  if (!process.env.TELNYX_API_KEY) {
    console.error("TELNYX_API_KEY is not set.");
    process.exit(1);
  }
  const host = new URL(base).host;
  const profile = await createOutboundVoiceProfile(`WorkBench lines (${host})`);
  console.log(`outbound voice profile: ${profile.id}`);
  const app = await createCallControlApp(`WorkBench voice (${host})`, `${base}/api/public/webhooks/telnyx/voice`, profile.id);
  console.log(`call control application: ${app.id}`);
  console.log("");
  console.log(`Set on Railway (${host}):  TELNYX_VOICE_APP_ID=${app.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
