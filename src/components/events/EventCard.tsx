import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import type { EventSummary } from "../../types/event";
import { formatEventDate, formatEventTime } from "../../lib/date";
import { formatKes } from "../../lib/currency";
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { categoryVisual } from "./categoryVisual";

export function EventCard({ event, index = 0 }: { event: EventSummary; index?: number }) {
  const { icon: Icon, gradient, glow } = categoryVisual(event.category.slug);
  const soldOut = event.status === "sold_out";

  return (
    <Card
      className={`hover-lift group flex flex-col overflow-hidden p-0 animate-fade-in-up ${glow}`}
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <Link to={`/events/${event.slug}`} className="flex flex-1 flex-col focus:outline-none">
        <div className={`relative flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br ${gradient}`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.25),transparent_60%)]" />
          <Icon className="h-10 w-10 text-white drop-shadow-sm transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3" />
          {soldOut && (
            <span className="absolute right-3 top-3">
              <Badge tone="rust" className="bg-paper text-rust shadow-sm">Sold out</Badge>
            </span>
          )}
          {event.isFree && !soldOut && (
            <span className="absolute right-3 top-3">
              <Badge tone="sage" className="bg-paper shadow-sm">Free</Badge>
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          <Badge tone="saffron">{event.category.name}</Badge>
          <h3 className="font-display text-lg font-semibold leading-snug text-ink transition-colors group-hover:text-saffron-text dark:text-ink-dark dark:group-hover:text-saffron">
            {event.title}
          </h3>
          <p className="text-sm text-ink-soft dark:text-ink-soft-dark">
            {formatEventDate(event.startsAt)} · {formatEventTime(event.startsAt)}
          </p>
          <p className="flex items-center gap-1 text-sm text-ink-soft dark:text-ink-soft-dark">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {event.venue.name}, {event.venue.town}
          </p>
          <div className="mt-auto flex items-center justify-between pt-2">
            <span className="font-semibold text-ink dark:text-ink-dark">
              {event.priceFromMinor === null
                ? "—"
                : event.priceFromMinor === 0
                ? "Free"
                : `From ${formatKes(event.priceFromMinor)}`}
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-saffron-text transition-transform group-hover:translate-x-0.5 dark:text-saffron">
              {soldOut ? "View details" : event.ctaLabel} →
            </span>
          </div>
        </div>
      </Link>
    </Card>
  );
}
