import type { MetadataRoute } from "next";

const BASE = "https://workbenchfsm.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/apply`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/roadmap`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
