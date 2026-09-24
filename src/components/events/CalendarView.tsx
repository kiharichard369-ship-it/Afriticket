import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isSameDay,
  isToday,
  startOfMonth,
} from "date-fns";
import { eventsRepository } from "../../repositories/eventsRepository";
import { Button } from "../ui/Button";

interface CalendarViewProps {
  monthKey: string;
  onMonthChange: (monthKey: string) => void;
  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
}

function toMonthKey(d: Date) {
  return format(d, "yyyy-MM");
}

export function CalendarView({ monthKey, onMonthChange, selectedDay, onSelectDay }: CalendarViewProps) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [year, month] = monthKey.split("-").map(Number);
  const monthDate = new Date(year, month - 1, 1);

  useEffect(() => {
    eventsRepository.getMonthCounts(monthKey).then(setCounts);
  }, [monthKey]);

  const days = eachDayOfInterval({ start: startOfMonth(monthDate), end: endOfMonth(monthDate) });
  const leadingBlanks = getDay(startOfMonth(monthDate)); // 0 = Sunday

  return (
    <div className="rounded-xl border border-border-warm bg-paper-raised p-4 dark:border-border-dark dark:bg-surface-dark sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl text-ink dark:text-ink-dark">{format(monthDate, "MMMM yyyy")}</h2>
        <div className="flex items-center gap-1">
          <button
            aria-label="Previous month"
            onClick={() => {
              onSelectDay(null);
              onMonthChange(toMonthKey(addMonths(monthDate, -1)));
            }}
            className="rounded-md p-2 hover:bg-ink/5 dark:hover:bg-white/10"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            aria-label="Next month"
            onClick={() => {
              onSelectDay(null);
              onMonthChange(toMonthKey(addMonths(monthDate, 1)));
            }}
            className="rounded-md p-2 hover:bg-ink/5 dark:hover:bg-white/10"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-ink-faint">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const count = counts[key] ?? 0;
          const isSelected = selectedDay === key;
          const heat = count >= 3 ? "bg-saffron/25" : count === 2 ? "bg-saffron/15" : count === 1 ? "bg-saffron/8" : "";
          return (
            <button
              key={key}
              disabled={count === 0}
              onClick={() => onSelectDay(isSelected ? null : key)}
              aria-pressed={isSelected}
              aria-label={`${format(day, "d MMMM")}${count ? `, ${count} event${count > 1 ? "s" : ""}` : ", no events"}`}
              className={`flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition-all duration-150
                ${count === 0 ? "text-ink-faint/50" : `text-ink hover:scale-105 hover:bg-saffron/25 dark:text-ink-dark ${heat}`}
                ${isSelected ? "scale-105 bg-saffron text-saffron-ink shadow-md hover:bg-saffron" : ""}
                ${isToday(day) && !isSelected ? "ring-1 ring-inset ring-saffron-dark" : ""}
              `}
            >
              <span>{format(day, "d")}</span>
              {count > 0 && (
                <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${isSelected ? "bg-saffron-ink" : "bg-saffron-dark"}`} />
              )}
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => onSelectDay(null)}>
          Clear selected day ({format(new Date(selectedDay), "d MMM")})
        </Button>
      )}
    </div>
  );
}

export function isDayMatch(iso: string, day: string) {
  return isSameDay(new Date(iso), new Date(day));
}
