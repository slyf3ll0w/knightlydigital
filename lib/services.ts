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
    name: "Custom Web Design",
    slug: "custom-web-design",
    shortName: "Web Design",
    tagline: "Hand-Coded Websites Built From Scratch — No Templates",
    description:
      "Your website is the first impression most customers ever get. We design and hand-code custom sites from scratch — no page builders, no recycled themes — built to load fast, look sharp on every device, and turn visitors into customers.",
    details: [
      "Custom design from a blank canvas — never a template",
      "Hand-coded with a modern framework for speed and security",
      "Mobile-first, responsive on every screen size",
      "On-page SEO fundamentals and clean structure built in",
      "Full ownership of your code, content, and accounts",
    ],
    heroImage:
      "https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?w=1600&q=80",
  },
];

export function getServiceBySlug(slug: string): Service | undefined {
  return services.find((s) => s.slug === slug);
}
