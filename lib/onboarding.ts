export type QuestionType = "text" | "textarea" | "select" | "multiselect" | "url";

export type OnboardingQuestion = {
  key: string;
  label: string;
  type: QuestionType;
  options?: string[];
  required?: boolean;
  placeholder?: string;
};

export type ServiceOnboarding = {
  serviceKey: string;
  label: string;
  description: string;
  questions: OnboardingQuestion[];
};

export type OnboardingResponses = Record<string, string | string[]>;

// Add or remove services here. No DB changes needed — responses are stored as JSON.
export const SERVICE_ONBOARDING: ServiceOnboarding[] = [
  {
    serviceKey: "meta-ads",
    label: "Meta Ads Management",
    description: "Campaign setup, targeting, and account access details.",
    questions: [
      {
        key: "monthly_budget",
        label: "Monthly Ad Budget",
        type: "select",
        options: ["Under $500", "$500–$1,000", "$1,000–$2,500", "$2,500–$5,000", "$5,000+"],
        required: true,
      },
      {
        key: "campaign_goal",
        label: "Primary Campaign Goal",
        type: "select",
        options: ["Lead Generation", "Website Traffic", "Brand Awareness", "Sales / Conversions", "Event Promotion"],
        required: true,
      },
      {
        key: "facebook_page_url",
        label: "Facebook Page URL",
        type: "url",
        required: true,
        placeholder: "https://facebook.com/yourbusiness",
      },
      {
        key: "ad_account_id",
        label: "Facebook Ad Account ID",
        type: "text",
        placeholder: "act_XXXXXXXXXX",
      },
      {
        key: "target_audience",
        label: "Target Audience Description",
        type: "textarea",
        required: true,
        placeholder: "Describe your ideal customer — age, location, interests, behaviors...",
      },
      {
        key: "has_pixel",
        label: "Is Meta Pixel installed on your website?",
        type: "select",
        options: ["Yes", "No", "I'm not sure"],
      },
      {
        key: "previous_ads",
        label: "Have you run Facebook / Instagram ads before?",
        type: "select",
        options: ["Yes, with good results", "Yes, but with poor results", "No — this is our first time"],
      },
    ],
  },
  {
    serviceKey: "social-media",
    label: "Social Media Posting",
    description: "Content strategy, brand voice, and account details.",
    questions: [
      {
        key: "platforms",
        label: "Platforms to Manage",
        type: "multiselect",
        options: ["Instagram", "Facebook", "LinkedIn", "TikTok", "X (Twitter)"],
        required: true,
      },
      {
        key: "account_handles",
        label: "Your Social Media Handles",
        type: "textarea",
        required: true,
        placeholder: "@yourhandle on each platform",
      },
      {
        key: "posting_frequency",
        label: "Desired Posting Frequency",
        type: "select",
        options: ["3x per week", "5x per week", "Daily", "Custom — specify in notes"],
        required: true,
      },
      {
        key: "brand_voice",
        label: "Brand Voice & Tone",
        type: "select",
        options: ["Professional & Authoritative", "Casual & Friendly", "Bold & Edgy", "Educational & Informative", "Inspirational"],
        required: true,
      },
      {
        key: "content_themes",
        label: "Content Themes / Topics",
        type: "textarea",
        required: true,
        placeholder: "e.g. behind-the-scenes, promotions, customer spotlights, tips & tricks...",
      },
      {
        key: "competitors",
        label: "Competitors to Watch",
        type: "textarea",
        placeholder: "List competitor names or social handles we should monitor.",
      },
    ],
  },
  {
    serviceKey: "custom-software",
    label: "Custom Software & Web Design",
    description: "Project scope, timeline, and technical requirements.",
    questions: [
      {
        key: "project_type",
        label: "Project Type",
        type: "select",
        options: ["New Website", "Website Redesign", "Web Application", "Mobile App", "E-commerce Store", "Internal Tool / Dashboard", "Other"],
        required: true,
      },
      {
        key: "description",
        label: "Project Description",
        type: "textarea",
        required: true,
        placeholder: "Describe what you need built and what problem it solves...",
      },
      {
        key: "existing_site",
        label: "Existing Website URL (if any)",
        type: "url",
        placeholder: "https://yourbusiness.com",
      },
      {
        key: "timeline",
        label: "Desired Timeline",
        type: "select",
        options: ["ASAP", "1–2 months", "2–4 months", "4–6 months", "Flexible"],
        required: true,
      },
      {
        key: "budget",
        label: "Estimated Budget",
        type: "select",
        options: ["Under $2,500", "$2,500–$5,000", "$5,000–$10,000", "$10,000–$25,000", "$25,000+"],
        required: true,
      },
      {
        key: "integrations",
        label: "Required Integrations / Third-Party Tools",
        type: "textarea",
        placeholder: "e.g. Stripe payments, CRM, inventory system, booking software...",
      },
      {
        key: "design_preference",
        label: "Design Style Preference",
        type: "select",
        options: ["Modern & Minimal", "Bold & Graphic", "Corporate & Professional", "Warm & Approachable", "Match existing brand"],
      },
    ],
  },
];

export function getServiceOnboarding(serviceKey: string): ServiceOnboarding | undefined {
  return SERVICE_ONBOARDING.find((s) => s.serviceKey === serviceKey);
}

export function isOnboardingComplete(service: ServiceOnboarding, responses: OnboardingResponses): boolean {
  return service.questions
    .filter((q) => q.required)
    .every((q) => {
      const val = responses[q.key];
      if (Array.isArray(val)) return val.length > 0;
      return typeof val === "string" && val.trim() !== "";
    });
}
