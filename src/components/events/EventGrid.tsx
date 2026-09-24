import type { EventSummary } from "../../types/event";
import { EventCard } from "./EventCard";
import { EventCardSkeleton } from "../ui/Skeleton";

export function EventGrid({ events, skeletonCount = 6 }: { events: EventSummary[]; skeletonCount?: number }) {
  if (events.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <EventCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((event, i) => (
        <EventCard key={event.id} event={event} index={i} />
      ))}
    </div>
  );
}
