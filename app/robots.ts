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
        ],
      },
    ],
    sitemap: "https://workbenchfsm.com/sitemap.xml",
  };
}
