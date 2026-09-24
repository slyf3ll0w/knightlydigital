/**
 * Is this request a crawler / link-preview fetcher / script rather than a
 * person? Used to keep counters honest (estimate-form views). Only the
 * user agent is looked at, so a bot that lies still counts — this keeps
 * the obvious ones (search engines, social previews, uptime pingers,
 * headless tooling) out of the numbers.
 */
const BOT_UA_RE =
  /bot|crawl|spider|slurp|scan|preview|monitor|pingdom|uptime|python|curl|wget|libwww|go-http|okhttp|java\/|headless|phantom|lighthouse|pagespeed|facebookexternalhit|twitterbot|linkedinbot|pinterest|whatsapp|telegram|discord|skype|slack|embedly|quora|vkshare|w3c_validator|apache-http|node-fetch|axios|postman/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return true; // real browsers always send one
  return BOT_UA_RE.test(ua);
}
