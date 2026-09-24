import { addDays, addHours, formatISO } from "date-fns";
import type { Category, EventDetail, EventSummary, TicketType, Venue } from "../types/event";

const TZ = "Africa/Nairobi";
const now = new Date();
const iso = (d: Date) => formatISO(d);

export const CATEGORIES: Category[] = [
  { id: "cat-music", slug: "music", name: "Music" },
  { id: "cat-nightlife", slug: "nightlife", name: "Nightlife" },
  { id: "cat-arts", slug: "arts-theatre", name: "Arts & Theatre" },
  { id: "cat-comedy", slug: "comedy", name: "Comedy" },
  { id: "cat-sports", slug: "sports", name: "Sports" },
  { id: "cat-business", slug: "business", name: "Conferences & Business" },
  { id: "cat-culture", slug: "culture", name: "Community & Culture" },
  { id: "cat-family", slug: "family", name: "Family & Kids" },
];

export const VENUES: Venue[] = [
  { id: "v-nakuru-athletic", name: "Nakuru Athletic Grounds", town: "Nakuru", address: "Off Oginga Odinga Rd" },
  { id: "v-nakuru-play", name: "The Playhouse Nakuru", town: "Nakuru", address: "Kenyatta Ave" },
  { id: "v-naivasha-lake", name: "Lakeside Gardens", town: "Naivasha", address: "Moi South Lake Rd" },
  { id: "v-nairobi-carnivore", name: "Carnivore Grounds", town: "Nairobi", address: "Langata Rd" },
  { id: "v-nairobi-kicc", name: "KICC Amphitheatre", town: "Nairobi", address: "City Centre" },
  { id: "v-nairobi-charter", name: "Charter Hall", town: "Nairobi", address: "City Hall Way" },
  { id: "v-mombasa-tembea", name: "Tembea Grounds", town: "Mombasa", address: "Nyali" },
  { id: "v-kisumu-dunga", name: "Dunga Hill Camp", town: "Kisumu", address: "Dunga Beach Rd" },
  { id: "v-eldoret-rupa", name: "Rupa's Mall Grounds", town: "Eldoret", address: "Uganda Rd" },
];

type Draft = {
  id: string;
  slug: string;
  title: string;
  categorySlug: string;
  venueId: string;
  daysFromNow: number;
  hour: number;
  durationHours: number;
  description: string;
  organiserName: string;
  cta: EventSummary["ctaLabel"];
  isFree: boolean;
  tickets: Array<{ name: string; priceMinor: number; capacity: number; remaining: number; perOrderLimit: number; description?: string }>;
  coverImageUrl?: string;
  status?: EventSummary["status"];
};

const drafts: Draft[] = [
  {
    id: "evt-rift-valley-sound",
    slug: "rift-valley-sound-festival",
    title: "Rift Valley Sound Festival",
    categorySlug: "music",
    venueId: "v-nakuru-athletic",
    daysFromNow: 12,
    hour: 14,
    durationHours: 8,
    description:
      "A full-day outdoor lineup of Kenyan Afrobeat, benga revival, and genge acts on three stages, with food stalls from vendors across the Rift Valley.",
    organiserName: "Sauti za Bonde Productions",
    cta: "Get tickets",
    isFree: false,
    tickets: [
      { name: "Early Bird", priceMinor: 150000, capacity: 500, remaining: 42, perOrderLimit: 6 },
      { name: "Regular", priceMinor: 220000, capacity: 2000, remaining: 890, perOrderLimit: 8 },
      { name: "VIP Deck", priceMinor: 550000, capacity: 200, remaining: 61, perOrderLimit: 4 },
    ],
  },
  {
    id: "evt-nakuru-comedy",
    slug: "nakuru-after-dark-comedy-night",
    title: "Nakuru After Dark: Comedy Night",
    categorySlug: "comedy",
    venueId: "v-nakuru-play",
    daysFromNow: 5,
    hour: 19,
    durationHours: 3,
    description:
      "Six stand-up comedians share the mic for a night of sharp, local humour, hosted in the round at The Playhouse.",
    organiserName: "Punchline Collective",
    cta: "Get tickets",
    isFree: false,
    tickets: [
      { name: "General Entry", priceMinor: 80000, capacity: 300, remaining: 118, perOrderLimit: 10 },
      { name: "Front Row", priceMinor: 150000, capacity: 40, remaining: 6, perOrderLimit: 4 },
    ],
  },
  {
    id: "evt-lakeside-jazz",
    slug: "lakeside-jazz-sundowner",
    title: "Lakeside Jazz Sundowner",
    categorySlug: "music",
    venueId: "v-naivasha-lake",
    daysFromNow: 19,
    hour: 16,
    durationHours: 4,
    description:
      "An intimate jazz trio set against the Naivasha shoreline as the sun goes down, with a cash bar and grilled tilapia stand.",
    organiserName: "Blue Hour Sessions",
    cta: "Get tickets",
    isFree: false,
    tickets: [
      { name: "Lawn Seating", priceMinor: 120000, capacity: 250, remaining: 190, perOrderLimit: 6 },
      { name: "Reserved Table (4)", priceMinor: 800000, capacity: 20, remaining: 3, perOrderLimit: 2 },
    ],
  },
  {
    id: "evt-nairobi-innovation",
    slug: "nairobi-fintech-and-rails-summit",
    title: "Nairobi Fintech & Rails Summit",
    categorySlug: "business",
    venueId: "v-nairobi-kicc",
    daysFromNow: 33,
    hour: 8,
    durationHours: 9,
    description:
      "Founders, engineers, and regulators discuss mobile money interoperability, real-time settlement, and building for the next 50 million users.",
    organiserName: "Mirie Technologies Events",
    cta: "Reserve a spot",
    isFree: false,
    tickets: [
      { name: "Delegate Pass", priceMinor: 350000, capacity: 600, remaining: 401, perOrderLimit: 5 },
      { name: "Startup Pass", priceMinor: 150000, capacity: 200, remaining: 88, perOrderLimit: 2 },
    ],
  },
  {
    id: "evt-charter-hall-theatre",
    slug: "the-matatu-chronicles",
    title: "The Matatu Chronicles",
    categorySlug: "arts-theatre",
    venueId: "v-nairobi-charter",
    daysFromNow: 9,
    hour: 18,
    durationHours: 2,
    description:
      "A fast-paced stage comedy following one Nairobi matatu crew through a single chaotic Friday, written and performed by a Kenyan ensemble cast.",
    organiserName: "Charter Stage Company",
    cta: "Get tickets",
    isFree: false,
    tickets: [
      { name: "Balcony", priceMinor: 100000, capacity: 150, remaining: 74, perOrderLimit: 8 },
      { name: "Stalls", priceMinor: 180000, capacity: 200, remaining: 12, perOrderLimit: 8 },
    ],
  },
  {
    id: "evt-mombasa-beach-run",
    slug: "mombasa-sunrise-beach-run",
    title: "Mombasa Sunrise Beach Run",
    categorySlug: "sports",
    venueId: "v-mombasa-tembea",
    daysFromNow: 26,
    hour: 6,
    durationHours: 3,
    description:
      "A 5K and 10K timed run along the Nyali shoreline, finishing with a community breakfast and a swim.",
    organiserName: "Tembea Running Club",
    cta: "Get tickets",
    isFree: false,
    tickets: [
      { name: "5K Entry", priceMinor: 50000, capacity: 400, remaining: 260, perOrderLimit: 6 },
      { name: "10K Entry", priceMinor: 70000, capacity: 400, remaining: 300, perOrderLimit: 6 },
    ],
  },
  {
    id: "evt-kisumu-cultural",
    slug: "dunga-heritage-day",
    title: "Dunga Heritage Day",
    categorySlug: "culture",
    venueId: "v-kisumu-dunga",
    daysFromNow: 41,
    hour: 10,
    durationHours: 6,
    description:
      "A lakeside celebration of Luo heritage with traditional boat displays, live nyatiti performances, and craft stalls. Entry supports the Dunga wetlands conservation fund.",
    organiserName: "Dunga Community Trust",
    cta: "Donate",
    isFree: true,
    tickets: [{ name: "Free Entry (donation welcome)", priceMinor: 0, capacity: 1000, remaining: 1000, perOrderLimit: 10 }],
  },
  {
    id: "evt-eldoret-family",
    slug: "eldoret-family-fun-fair",
    title: "Eldoret Family Fun Fair",
    categorySlug: "family",
    venueId: "v-eldoret-rupa",
    daysFromNow: 15,
    hour: 9,
    durationHours: 7,
    description:
      "Bouncing castles, face painting, a petting zoo, and local food trucks — a full day out for families in Eldoret.",
    organiserName: "Uasin Gishu Kids Network",
    cta: "Get tickets",
    isFree: false,
    tickets: [
      { name: "Child (2-12)", priceMinor: 30000, capacity: 500, remaining: 410, perOrderLimit: 10 },
      { name: "Adult", priceMinor: 20000, capacity: 500, remaining: 470, perOrderLimit: 10 },
    ],
  },
  {
    id: "evt-nairobi-club",
    slug: "carnivore-house-and-amapiano-night",
    title: "House & Amapiano Night",
    categorySlug: "nightlife",
    venueId: "v-nairobi-carnivore",
    daysFromNow: 3,
    hour: 21,
    durationHours: 5,
    description:
      "Resident DJs and a guest set from South Africa bring amapiano and afro-house to the Carnivore grounds until late.",
    organiserName: "Nightshift Nairobi",
    cta: "Get tickets",
    isFree: false,
    tickets: [
      { name: "Early Entry", priceMinor: 100000, capacity: 600, remaining: 0, perOrderLimit: 6 },
      { name: "Door Entry", priceMinor: 150000, capacity: 800, remaining: 340, perOrderLimit: 6 },
    ],
  },
  {
    id: "evt-nakuru-jazz-brunch",
    slug: "nakuru-sunday-jazz-brunch",
    title: "Nakuru Sunday Jazz Brunch",
    categorySlug: "music",
    venueId: "v-nakuru-play",
    daysFromNow: 7,
    hour: 11,
    durationHours: 3,
    description:
      "A relaxed Sunday brunch with a live jazz quartet, set menu, and mocktail pairings at The Playhouse courtyard.",
    organiserName: "The Playhouse Nakuru",
    cta: "Get tickets",
    isFree: false,
    tickets: [{ name: "Brunch + Show", priceMinor: 250000, capacity: 80, remaining: 22, perOrderLimit: 6 }],
  },
  {
    id: "evt-nairobi-tech-meetup",
    slug: "nairobi-builders-meetup",
    title: "Nairobi Builders Meetup",
    categorySlug: "business",
    venueId: "v-nairobi-charter",
    daysFromNow: 21,
    hour: 17,
    durationHours: 3,
    description:
      "A community meetup for engineers and product folks building for the Kenyan market — three lightning talks and open networking.",
    organiserName: "Builders KE",
    cta: "Donate",
    isFree: true,
    tickets: [{ name: "Free RSVP", priceMinor: 0, capacity: 150, remaining: 34, perOrderLimit: 2 }],
  },
  {
    id: "evt-naivasha-marathon",
    slug: "naivasha-hills-trail-marathon",
    title: "Naivasha Hills Trail Marathon",
    categorySlug: "sports",
    venueId: "v-naivasha-lake",
    daysFromNow: 48,
    hour: 6,
    durationHours: 6,
    description:
      "A scenic trail marathon with 10K, 21K, and 42K categories through the hills overlooking Lake Naivasha.",
    organiserName: "Rift Valley Trail Runners",
    cta: "Get tickets",
    isFree: false,
    tickets: [
      { name: "10K", priceMinor: 60000, capacity: 300, remaining: 210, perOrderLimit: 4 },
      { name: "21K", priceMinor: 90000, capacity: 300, remaining: 140, perOrderLimit: 4 },
      { name: "42K", priceMinor: 120000, capacity: 200, remaining: 55, perOrderLimit: 4 },
    ],
  },
];

function buildEvent(d: Draft): EventDetail {
  const category = CATEGORIES.find((c) => c.slug === d.categorySlug)!;
  const venue = VENUES.find((v) => v.id === d.venueId)!;
  const startsAt = addHours(addDays(now, d.daysFromNow), d.hour - now.getHours());
  const endsAt = addHours(startsAt, d.durationHours);

  const ticketTypes: TicketType[] = d.tickets.map((t, i) => ({
    id: `${d.id}-tt-${i}`,
    eventId: d.id,
    name: t.name,
    description: t.description,
    priceMinor: t.priceMinor,
    currency: "KES",
    capacity: t.capacity,
    remaining: t.remaining,
    perOrderLimit: t.perOrderLimit,
  }));

  const available = ticketTypes.filter((t) => t.remaining > 0);
  const priceFromMinor = available.length ? Math.min(...available.map((t) => t.priceMinor)) : null;
  const status: EventSummary["status"] = d.status ?? (available.length ? "published" : "sold_out");

  return {
    id: d.id,
    slug: d.slug,
    title: d.title,
    status,
    category,
    venue,
    startsAt: iso(startsAt),
    endsAt: iso(endsAt),
    timezone: TZ,
    priceFromMinor,
    currency: "KES",
    ctaLabel: available.length ? d.cta : "Sold out",
    isFree: d.isFree,
    description: d.description,
    organiserName: d.organiserName,
    ticketTypes,
  };
}

export const EVENTS: EventDetail[] = drafts.map(buildEvent);

export function summaryOf(e: EventDetail): EventSummary {
  const { description: _description, organiserName: _organiserName, ticketTypes: _ticketTypes, ...summary } = e;
  return summary;
}
