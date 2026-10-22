// Location: src/data/mckPartnershipTiers.ts
// Afriticket-owned seed/fallback data; live packages are read from Afriticket's own Supabase project.
export type PartnershipTierKey = string;
export type PartnershipType = "cash" | "in_kind";

export const MCK_PROGRAMME_SLUG = "miss-corporate-kenya" as const;
export const MCK_EVENTS_SEARCH_PATH = `/?programme=${MCK_PROGRAMME_SLUG}`;

export interface PartnershipTier {
  key: PartnershipTierKey;
  name: string;
  priceKsh: number;
  priceLabel: string;
  benefits: readonly string[];
  sortOrder?: number;
  isActive?: boolean;
}

export const sharedPartnerBenefits = [
  "One nomination for a Brand Ambassador",
  "Recognition on MCK and CESRA web properties",
  "Visibility across programme digital and social channels",
  "Acknowledgement as an event partner",
] as const;

// Used only when Supabase is not configured and as migration seed content.
export const partnershipTiers: readonly PartnershipTier[] = [
  {
    key: "supporting",
    name: "Supporting Partner",
    priceKsh: 30_000,
    priceLabel: "KES 30,000",
    sortOrder: 10,
    benefits: [
      "One co-created short-form video",
      "Standard logo position on the event backdrop",
      "Rotating logo placement on venue screens",
      "Partner credit in the event programme magazine",
      "One dinner-and-gala admission",
      "Product display area",
    ],
  },
  {
    key: "impact",
    name: "Impact Partner",
    priceKsh: 50_000,
    priceLabel: "KES 50,000",
    sortOrder: 20,
    benefits: [
      "Two co-created short-form videos",
      "Standard logo position on the event backdrop",
      "Rotating logo placement on venue screens",
      "Quarter-page advert in the event programme",
      "Two dinner-and-gala admissions",
      "Standard partner display table",
    ],
  },
  {
    key: "leadership",
    name: "Leadership Partner",
    priceKsh: 100_000,
    priceLabel: "KES 100,000",
    sortOrder: 30,
    benefits: [
      "Three co-created short-form videos",
      "Prominent logo position on the event backdrop",
      "Featured brand slide on venue screens",
      "Half-page corporate programme profile",
      "Four dinner-and-gala admissions",
      "Branded partner showcase table",
      "Association with an impact initiative",
    ],
  },
  {
    key: "strategic-impact",
    name: "Strategic Impact Partner",
    priceKsh: 150_000,
    priceLabel: "KES 150,000",
    sortOrder: 40,
    benefits: [
      "Four co-created short-form videos",
      "Priority logo position on the event backdrop",
      "Featured venue-screen slide and promotional video",
      "Full-page corporate or CSR programme feature",
      "Six dinner-and-gala admissions",
      "Priority partner showcase table",
      "Priority association with an impact initiative",
      "Priority event branding and recognition",
    ],
  },
] as const;

export const partnershipStatuses = ["new", "in_progress", "contacted", "closed", "spam"] as const;
export type PartnershipEnquiryStatus = (typeof partnershipStatuses)[number];
