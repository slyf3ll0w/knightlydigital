import type { MetadataRoute } from "next";
import { HELP_SECTIONS } from "@/lib/help/content";

const BASE = "https://workbenchfsm.com";

const FEATURE_TOPICS = [
  "scheduling-dispatch",
  "payments",
  "quotes-and-invoicing",
  "client-portal",
  "time-tracking",
  "atlas",
];

const COMPETITORS = ["jobber", "housecall-pro", "servicetitan"];

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/features`, changeFrequency: "monthly", priority: 0.9 },
    ...FEATURE_TOPICS.map((topic) => ({
      url: `${BASE}/features/${topic}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${BASE}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    ...COMPETITORS.map((slug) => ({
      url: `${BASE}/vs/${slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    { url: `${BASE}/apply`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/roadmap`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE}/help`, changeFrequency: "weekly", priority: 0.7 },
    ...HELP_SECTIONS.map((s) => ({
      url: `${BASE}/help/topic/${s.id}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...HELP_SECTIONS.flatMap((s) =>
      s.articles.map((a) => ({
        url: `${BASE}/help/${a.slug}`,
        changeFrequency: "monthly" as const,
        priority: 0.5,
      })),
    ),
    { url: `${BASE}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/sms-terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/texting-registration`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
