import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/app/",
          "/api/",
          "/platform/",
          "/superadmin/",
          "/portal/",
          "/hub/",
          "/pay/",
          "/quote/",
          "/book/",
          "/contract/",
          "/embed/",
          "/t/",
        ],
      },
    ],
    // The blog keeps its own sitemap: its posts come from the database (app/(wbsite)/blog/sitemap.ts)
    sitemap: ["https://workbenchfsm.com/sitemap.xml", "https://workbenchfsm.com/blog/sitemap.xml"],
  };
}
