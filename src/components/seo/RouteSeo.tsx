import { useLocation } from "react-router-dom";
import { SeoMetadata } from "./SeoMetadata";

const PUBLIC_METADATA: Record<string, { title: string; description: string }> = {
  "/": {
    title: "Ticketyangu — Find events across Kenya",
    description: "Discover and book concerts, comedy, sport, theatre, and community events across Kenya, town by town.",
  },
  "/calendar": {
    title: "Events calendar — Ticketyangu",
    description: "Browse upcoming events across Kenya by month and day, then open an event to view tickets and venue details.",
  },
  "/about": {
    title: "About Ticketyangu — Kenya event discovery and ticketing",
    description: "Learn how Ticketyangu helps people find and book concerts, markets, sport, theatre, and community gatherings across Kenya.",
  },
  "/help": {
    title: "Help centre — Ticketyangu",
    description: "Find answers about buying tickets, finding your QR ticket, refunds, organising events, and event check-in on Ticketyangu.",
  },
  "/organiser/apply": {
    title: "Sell tickets on Ticketyangu",
    description: "Apply to list and sell tickets for your next event on Ticketyangu, Kenya's town-by-town event discovery platform.",
  },
};

const NO_INDEX_PATHS = new Set([
  "/login",
  "/signup",
  "/organiser/dashboard",
  "/my-tickets",
  "/account",
  "/admin/moderation",
]);

export function RouteSeo() {
  const { pathname } = useLocation();
  const normalizedPath = pathname === "/" ? "/" : pathname.replace(/\/$/, "");

  // EventDetailPage owns event-specific metadata, including the optional
  // cover image. It also renders a neutral loading state for the first paint.
  if (normalizedPath.startsWith("/events/")) return null;

  const publicMetadata = PUBLIC_METADATA[normalizedPath];
  if (publicMetadata) {
    return <SeoMetadata {...publicMetadata} canonicalPath={normalizedPath} />;
  }

  const noIndex = NO_INDEX_PATHS.has(normalizedPath) || normalizedPath.startsWith("/organiser/events/");
  return (
    <SeoMetadata
      title={normalizedPath === "/404" ? "Page not found — Ticketyangu" : "Ticketyangu"}
      description="Find and book events across Kenya with Ticketyangu."
      noIndex={noIndex || normalizedPath !== "/"}
    />
  );
}
