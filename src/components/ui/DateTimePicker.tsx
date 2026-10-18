// Save as: src/components/ui/DateTimePicker.tsx
//
// Pick a date and time, then press OK. Nothing changes until OK is pressed, and the
// panel stays open while you choose, so there's no re-opening to set the minutes or AM/PM.
// value and onChange use the same text format as a datetime-local input: "2026-10-11T08:00"
// (24-hour, in the browser's local time).
import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { Input } from "./Input";
import { Select } from "./Select";
import { Button } from "./Button";

const VALUE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

function parse(value: string) {
  const match = VALUE_PATTERN.exec(value);
  if (!match) return null;
  const hour24 = Number(match[4]);
  return {
    date: `${match[1]}-${match[2]}-${match[3]}`,
    hour12: hour24 % 12 === 0 ? 12 : hour24 % 12,
    minute: Number(match[5]),
    pm: hour24 >= 12,
  };
}

function compose(date: string, hour12: number, minute: number, pm: boolean): string {
  const hour24 = (hour12 % 12) + (pm ? 12 : 0);
  return `${date}T${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function describe(value: string): string {
  const parts = parse(value);
  if (!parts) return "";
  const [year, month, day] = parts.date.split("-").map(Number);
  const when = new Date(year, month - 1, day, (parts.hour12 % 12) + (parts.pm ? 12 : 0), parts.minute);
  return when.toLocaleString("en-KE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function DateTimePicker({
  id,
  value,
  onChange,
  optional = false,
  defaultDate = "",
  minDate = "",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Adds a Clear button, for fields that may stay empty. */
  optional?: boolean;
  /** Date suggested when the field is empty, as YYYY-MM-DD. */
  defaultDate?: string;
  /** Earliest date allowed, as YYYY-MM-DD. */
  minDate?: string;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [hour12, setHour12] = useState(6);
  const [minute, setMinute] = useState(0);
  const [pm, setPm] = useState(true);

  function openPanel() {
    const current = parse(value);
    setDate(current?.date ?? defaultDate);
    setHour12(current?.hour12 ?? 6);
    setMinute(current?.minute ?? 0);
    setPm(current?.pm ?? true);
    setOpen(true);
  }

  function confirm() {
    if (!date) return;
    onChange(compose(date, hour12, minute, pm));
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div>
      <button
        type="button"
        id={id}
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border-warm bg-paper-raised px-3.5 py-2.5 text-left text-[0.95rem] text-ink dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark"
      >
        <span className={value ? "" : "text-ink-faint"}>{value ? describe(value) : "Choose date and time"}</span>
        <CalendarClock className="h-4 w-4 shrink-0 text-ink-soft dark:text-ink-soft-dark" aria-hidden="true" />
      </button>

      {open && (
        <div className="mt-2 space-y-3 rounded-lg border border-border-warm bg-paper-raised p-3 dark:border-border-dark dark:bg-surface-dark">
          <div>
            <label htmlFor={id ? `${id}-date` : undefined} className="mb-1 block text-xs font-medium text-ink-soft dark:text-ink-soft-dark">Date</label>
            <Input id={id ? `${id}-date` : undefined} type="date" value={date} min={minDate || undefined} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-ink-soft dark:text-ink-soft-dark">Time</p>
            <div className="grid grid-cols-3 gap-2">
              <Select aria-label="Hour" value={hour12} onChange={(e) => setHour12(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => (
                  <option key={hour} value={hour}>{hour}</option>
                ))}
              </Select>
              <Select aria-label="Minute" value={minute} onChange={(e) => setMinute(Number(e.target.value))}>
                {Array.from({ length: 60 }, (_, index) => index).map((m) => (
                  <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                ))}
              </Select>
              <Select aria-label="AM or PM" value={pm ? "PM" : "AM"} onChange={(e) => setPm(e.target.value === "PM")}>
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </Select>
            </div>
          </div>

          <p className="text-xs text-ink-faint">
            {date ? `This will be set to ${describe(compose(date, hour12, minute, pm))}.` : "Choose a date first."}
          </p>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {optional && value && (
              <Button type="button" variant="ghost" size="sm" onClick={() => { onChange(""); setOpen(false); }}>
                Clear
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" size="sm" disabled={!date} onClick={confirm}>OK</Button>
          </div>
        </div>
      )}
    </div>
  );
}