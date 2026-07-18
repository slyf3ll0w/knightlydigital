/**
 * Register the Finix webhook endpoint for the current environment. Run once
 * per environment (sandbox / live) after the app is deployed:
 *
 *   FINIX_API_USERNAME=... FINIX_API_PASSWORD=... \
 *   WEBHOOK_URL=https://workbenchfsm.com/api/public/webhooks/finix \
 *   node scripts/finix-register-webhook.mjs
 *
 * FINIX_ENVIRONMENT=live switches to the live API host. Lists existing
 * webhooks first and skips registration if the URL is already there.
 */

const HOSTS = {
  sandbox: "https://finix.sandbox-payments-api.com",
  live: "https://finix.live-payments-api.com",
};

const env = process.env.FINIX_ENVIRONMENT === "live" ? "live" : "sandbox";
const host = HOSTS[env];
const url = process.env.WEBHOOK_URL ?? "https://workbenchfsm.com/api/public/webhooks/finix";
const user = process.env.FINIX_API_USERNAME;
const pass = process.env.FINIX_API_PASSWORD;

if (!user || !pass) {
  console.error("Set FINIX_API_USERNAME and FINIX_API_PASSWORD");
  process.exit(1);
}

const auth = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
const headers = { Authorization: auth, "Content-Type": "application/json" };

const existing = await fetch(`${host}/webhooks?limit=100`, { headers }).then((r) => r.json());
const hooks = existing?._embedded?.webhooks ?? [];
const match = hooks.find((w) => w.url === url);
if (match) {
  console.log(`Already registered (${match.id}, enabled=${match.enabled}) — nothing to do.`);
  process.exit(0);
}

const res = await fetch(`${host}/webhooks`, {
  method: "POST",
  headers,
  body: JSON.stringify({ url, enabled: true }),
});
const data = await res.json();
if (!res.ok) {
  console.error("Registration failed:", JSON.stringify(data, null, 2));
  process.exit(1);
}
console.log(`Registered webhook ${data.id} → ${url} (${env})`);
