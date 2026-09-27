import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, MapPin, Users } from "lucide-react";
import { eventsRepository } from "../repositories/eventsRepository";
import type { EventDetail } from "../types/event";
import { formatDateRange } from "../lib/date";
import { formatKes } from "../lib/currency";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Skeleton } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { CheckoutDialog } from "../components/events/CheckoutDialog";
import { EventImage } from "../components/events/EventImage";
import { SeoMetadata } from "../components/seo/SeoMetadata";

export function EventDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [event, setEvent] = useState<EventDetail | null | undefined>(undefined);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setEvent(undefined);
    eventsRepository.getEventBySlug(slug).then(setEvent);
  }, [slug]);

  if (event === undefined) {
    return (
      <>
        <SeoMetadata
          title="Event details — Afriticket"
          description="View event details, venue information, and ticket options on Afriticket."
          canonicalPath={slug ? `/events/${slug}` : "/"}
        />
        <div className="mx-auto max-w-4xl space-y-4 px-6 py-10">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
        </div>
      </>
    );
  }

  if (event === null) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <SeoMetadata
          title="Event not found — Afriticket"
          description="This event is no longer available. Browse current events across Kenya on Afriticket."
          canonicalPath="/"
          noIndex
        />
        <EmptyState
          title="We couldn't find that event"
          description="It may have sold out, been cancelled, or the link may be out of date."
          actionLabel="Back to all events"
          onAction={() => window.history.back()}
        />
      </div>
    );
  }

  return (
    <article>
      <SeoMetadata
        title={`${event.title} — Afriticket`}
        description={`${event.title} in ${event.venue.town}: ${event.description}`}
        canonicalPath={`/events/${event.slug}`}
        imageUrl={event.coverImageUrl}
        type="article"
      />
      <EventImage
        src={event.coverImageUrl}
        alt={`${event.title} event cover`}
        categorySlug={event.category.slug}
        className="aspect-[2/1] sm:aspect-[3/1]"
        imageClassName="object-center"
        loading="eager"
        sizes="100vw"
      />

      <div className="mx-auto max-w-4xl px-6 py-8">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink dark:text-ink-soft-dark dark:hover:text-ink-dark">
          <ArrowLeft className="h-4 w-4" /> Back to events
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge tone="saffron">{event.category.name}</Badge>
          {event.status === "sold_out" && <Badge tone="rust">Sold out</Badge>}
          {event.isFree && <Badge tone="sage">Free entry</Badge>}
        </div>

        <h1 className="mt-3 font-display text-3xl font-semibold text-ink dark:text-ink-dark sm:text-4xl">
          {event.title}
        </h1>
        <p className="mt-1 text-ink-soft dark:text-ink-soft-dark">Hosted by {event.organiserName}</p>

        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <div className="space-y-6 md:col-span-2">
            <div className="space-y-3 text-ink dark:text-ink-dark">
              <p className="flex items-start gap-2">
                <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-ink-faint" />
                {formatDateRange(event.startsAt, event.endsAt)}
              </p>
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-ink-faint" />
                <span>
                  {event.venue.name}, {event.venue.town}
                  {event.venue.address && <span className="block text-sm text-ink-soft dark:text-ink-soft-dark">{event.venue.address}</span>}
                </span>
              </p>
            </div>

            <div>
              <h2 className="font-display text-xl text-ink dark:text-ink-dark">About this event</h2>
              <p className="mt-2 leading-relaxed text-ink-soft dark:text-ink-soft-dark">{event.description}</p>
            </div>
          </div>

          <Card className="h-fit space-y-4 p-5">
            <h2 className="font-display text-lg text-ink dark:text-ink-dark">Tickets</h2>
            <ul className="space-y-3">
              {event.ticketTypes.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium text-ink dark:text-ink-dark">{t.name}</p>
                    <p className="text-ink-soft dark:text-ink-soft-dark">
                      {t.remaining > 0 ? `${formatKes(t.priceMinor)}` : "Sold out"}
                    </p>
                  </div>
                  {t.remaining > 0 && t.remaining <= 20 && (
                    <span className="flex items-center gap-1 text-xs text-rust">
                      <Users className="h-3.5 w-3.5" /> {t.remaining} left
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <Button
              className="w-full"
              disabled={event.status === "sold_out"}
              onClick={() => setCheckoutOpen(true)}
            >
              {event.status === "sold_out" ? "Sold out" : event.ctaLabel}
            </Button>
          </Card>
        </div>
      </div>

      <CheckoutDialog event={event} open={checkoutOpen} onOpenChange={setCheckoutOpen} />
    </article>
  );
}
