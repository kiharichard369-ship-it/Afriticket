import { useEffect, useState } from "react";
import { eventsRepository } from "../repositories/eventsRepository";
import { currentMonthKey, monthKeyLabel } from "../lib/date";
import { CalendarView, isDayMatch } from "../components/events/CalendarView";
import { EventGrid } from "../components/events/EventGrid";
import { EmptyState } from "../components/ui/EmptyState";
import type { EventSummary } from "../types/event";
import { CalendarClock } from "lucide-react";

export function CalendarPage() {
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [events, setEvents] = useState<EventSummary[] | null>(null);

  useEffect(() => {
    setEvents(null);
    eventsRepository.listEvents({ month: monthKey, pageSize: 100 }).then((r) => setEvents(r.items));
  }, [monthKey]);

  const visible = events && selectedDay ? events.filter((e) => isDayMatch(e.startsAt, selectedDay)) : events;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="font-display text-3xl font-semibold text-ink dark:text-ink-dark">Events calendar</h1>
      <p className="mt-1 text-ink-soft dark:text-ink-soft-dark">
        Browse by month, or tap a day to see what's on.
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[22rem_1fr]">
        <CalendarView monthKey={monthKey} onMonthChange={setMonthKey} selectedDay={selectedDay} onSelectDay={setSelectedDay} />

        <div>
          <h2 className="mb-4 font-display text-xl text-ink dark:text-ink-dark">
            {selectedDay ? `Events on ${new Date(selectedDay).toLocaleDateString("en-KE", { day: "numeric", month: "long" })}` : monthKeyLabel(monthKey)}
          </h2>
          {visible === null ? (
            <EventGrid events={[]} skeletonCount={4} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<CalendarClock className="h-8 w-8 text-ink-faint" />}
              title="Nothing scheduled here yet"
              description="Try another month, or clear the selected day to see everything this month."
            />
          ) : (
            <EventGrid events={visible} />
          )}
        </div>
      </div>
    </div>
  );
}
