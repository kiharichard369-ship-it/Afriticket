// Location: src/pages/AdminMckProgrammePage.tsx
// Platform-admin workspace for Afriticket-managed MCK programme data.
import { useState } from "react";
import { ArrowLeft, Building2, CalendarDays, Handshake } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { MckEventTagManager } from "../components/programmes/MckEventTagManager";
import { MckPartnerManager } from "../components/programmes/MckPartnerManager";
import { MckTierManager } from "../components/programmes/MckTierManager";

type ProgrammeTab = "packages" | "partners" | "events";

const tabs: Array<{ id: ProgrammeTab; label: string; icon: typeof Handshake }> = [
  { id: "packages", label: "Packages", icon: Handshake },
  { id: "partners", label: "Partner records", icon: Building2 },
  { id: "events", label: "MCK events", icon: CalendarDays },
];

export function AdminMckProgrammePage() {
  const [tab, setTab] = useState<ProgrammeTab>("packages");

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Link to="/admin/moderation" className="inline-flex items-center gap-2 text-sm font-medium text-ink-soft hover:text-ink dark:text-ink-soft-dark dark:hover:text-ink-dark">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to moderation
      </Link>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#7b2144] dark:text-[#f1c8d7]">Administrator workspace</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-ink dark:text-ink-dark">Miss Corporate Kenya</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft dark:text-ink-soft-dark">
            Maintain active partnership packages, confirmed partner recognition, and the event tags used by Afriticket discovery.
          </p>
        </div>
        <Link to="/admin/corporate-enquiries" className="text-sm font-semibold text-[#7b2144] hover:underline dark:text-[#f1c8d7]">Open private enquiry queue</Link>
      </div>

      <Card className="mt-6 p-2">
        <div className="grid gap-1 sm:grid-cols-3" role="tablist" aria-label="MCK programme management">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls={`mck-admin-panel-${id}`}
              onClick={() => setTab(id)}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                tab === id
                  ? "bg-[#7b2144] text-white"
                  : "text-ink-soft hover:bg-paper dark:text-ink-soft-dark dark:hover:bg-white/5"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
      </Card>

      <section id={`mck-admin-panel-${tab}`} role="tabpanel" aria-label={tabs.find((item) => item.id === tab)?.label} className="mt-5">
        {tab === "packages" && <MckTierManager />}
        {tab === "partners" && <MckPartnerManager />}
        {tab === "events" && <MckEventTagManager />}
      </section>
    </div>
  );
}
