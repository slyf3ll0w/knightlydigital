export type Service = {
  name: string;
  slug: string;
  shortName: string;
  tagline: string;
  description: string;
  details: string[];
  heroImage: string;
};

export const services: Service[] = [
  {
    name: "Custom Software Design and Management",
    slug: "custom-software",
    shortName: "Custom Software",
    tagline: "Software Built Around Your Business — Not the Other Way Around",
    description:
      "Off-the-shelf tools create workarounds. We build software that fits your exact workflow — from client portals and internal dashboards to full-scale web applications — then manage and evolve it as your business grows.",
    details: [
      "Discovery & scoping sessions to map your exact workflow",
      "UI/UX design tailored to your team and customers",
      "Full-stack development with modern, maintainable code",
      "Ongoing management, updates, and performance monitoring",
      "Integration with your existing tools (CRMs, ERPs, payment processors)",
    ],
    heroImage:
      "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=1600&q=80",
  },
  {
    name: "Meta Ads Management",
    slug: "meta-ads-management",
    shortName: "Meta Ads",
    tagline: "DFW Businesses Found on Facebook and Instagram — Daily",
    description:
      "We run Facebook and Instagram ad campaigns that put your business in front of the right people at the right time. From creative to targeting to reporting — we handle everything so you can focus on serving your customers.",
    details: [
      "Audience research and custom targeting strategy",
      "Ad creative design — copy, images, and video",
      "Campaign setup, A/B testing, and optimization",
      "Retargeting sequences to recapture warm leads",
      "Monthly reporting with plain-English performance breakdowns",
    ],
    heroImage:
      "https://images.unsplash.com/photo-1611926653458-09294b3142bf?w=1600&q=80",
  },
  {
    name: "Social Media Posting",
    slug: "social-media-posting",
    shortName: "Social Media",
    tagline: "Consistent, On-Brand Content — Without the Headache",
    description:
      "Showing up consistently on social media builds trust and keeps your business top of mind. We create and schedule branded content across your platforms so your feed stays active, professional, and working for you — even when you're swamped.",
    details: [
      "Content strategy aligned with your brand voice and goals",
      "Original graphics and copywriting for every post",
      "Scheduling across Facebook, Instagram, LinkedIn, and more",
      "Hashtag and SEO optimization for organic reach",
      "Monthly content calendar reviews and performance reporting",
    ],
    heroImage:
      "https://images.unsplash.com/photo-1562577309-4932fdd64cd1?w=1600&q=80",
  },
];

export function getServiceBySlug(slug: string): Service | undefined {
  return services.find((s) => s.slug === slug);
}
