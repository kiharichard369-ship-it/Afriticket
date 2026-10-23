// Location: src/pages/AdminEventPartnershipsPage.tsx
// Platform-admin workspace for event partnership offers and confirmed listings.
import { useEffect, useState } from "react";
import { Check, Edit3, Plus, Save } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import {
  listAdminEventPartnershipApplications,
  listAdminEventPartnershipEvents,
  listAdminEventPartnershipPackages,
  saveEventPartnershipPackage,
  setEventPartnershipPublic,
} from "../repositories/eventPartnershipRepository";
import type {
  EventPartnershipAdminApplicationRow,
  EventPartnershipAdminEventRow,
  EventPartnershipPackageRow,
} from "../types/database";
import { formatKes } from "../lib/currency";

type PackageDraft = {
  id: string | null;
  category: string;
  name: string;
  serviceDescription: string;
  priceKes: string;
  sortOrder: string;
  isActive: boolean;
};

const emptyDraft = (): PackageDraft => ({ id: null, category: "", name: "", serviceDescription: "", priceKes: "", sortOrder: "0", isActive: true });

export function AdminEventPartnershipsPage() {
  const [events, setEvents] = useState<EventPartnershipAdminEventRow[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [packages, setPackages] = useState<EventPartnershipPackageRow[]>([]);
  const [applications, setApplications] = useState<EventPartnershipAdminApplicationRow[]>([]);
  const [draft, setDraft] = useState<PackageDraft>(emptyDraft());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let active = true;
    listAdminEventPartnershipEvents()
      .then((rows) => {
        if (!active) return;
        setEvents(rows);
        if (rows[0]) setSelectedEventId((current) => current || rows[0].id);
        else setLoading(false);
      })
      .catch(() => {
        if (active) {
          setError("Events could not be loaded. Confirm migration 0031 is applied and this account is a platform admin.");
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [refreshToken]);

  useEffect(() => {
    if (!selectedEventId) return;
    let active = true;
    Promise.all([
      listAdminEventPartnershipPackages(selectedEventId),
      listAdminEventPartnershipApplications(selectedEventId),
    ])
      .then(([packageRows, applicationRows]) => {
        if (!active) return;
        setPackages(packageRows);
        setApplications(applicationRows);
      })
      .catch(() => { if (active) setError("Partnership records could not be loaded. Check migration 0031 and the platform-admin role."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedEventId, refreshToken]);

  function editPackage(item: EventPartnershipPackageRow) {
    setDraft({
      id: item.id,
      category: item.category,
      name: item.name,
      serviceDescription: item.service_description,
      priceKes: String(item.price_kes),
      sortOrder: String(item.sort_order),
      isActive: item.is_active,
    });
    setError(null);
    setMessage(null);
  }

  async function savePackage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const priceKes = Number(draft.priceKes);
    const sortOrder = Number(draft.sortOrder);
    if (!selectedEventId || !Number.isInteger(priceKes) || priceKes < 1 || !Number.isInteger(sortOrder) || sortOrder < 0) {
      setError("Choose an event and enter a whole-number KES price and display order.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await saveEventPartnershipPackage({
        id: draft.id,
        eventId: selectedEventId,
        category: draft.category.trim(),
        name: draft.name.trim(),
        serviceDescription: draft.serviceDescription.trim(),
        priceKes,
        sortOrder,
        isActive: draft.isActive,
      });
      setDraft(emptyDraft());
      setMessage("Partnership package saved. New applicants see the current price; existing applications keep their original snapshot.");
      setLoading(true);
      setRefreshToken((value) => value + 1);
    } catch {
      setError("Package was not saved. Check the category, name, services, price and admin role.");
    } finally {
      setSaving(false);
    }
  }

  async function togglePackage(item: EventPartnershipPackageRow) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await saveEventPartnershipPackage({
        id: item.id,
        eventId: item.event_id,
        category: item.category,
        name: item.name,
        serviceDescription: item.service_description,
        priceKes: item.price_kes,
        sortOrder: item.sort_order,
        isActive: !item.is_active,
      });
      setMessage(`${item.name} ${item.is_active ? "deactivated" : "activated"}. Previously submitted applications are retained.`);
      setLoading(true);
      setRefreshToken((value) => value + 1);
    } catch {
      setError("Package status could not be changed. Check the platform-admin role.");
    } finally {
      setSaving(false);
    }
  }

  async function togglePartner(application: EventPartnershipAdminApplicationRow) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await setEventPartnershipPublic(application.id, !application.is_public);
      setMessage(`${application.business_name} is ${application.is_public ? "hidden from" : "visible on"} the event page.`);
      setLoading(true);
      setRefreshToken((value) => value + 1);
    } catch {
      setError("The partner listing could not be changed.");
    } finally {
      setSaving(false);
    }
  }

  const selectedEvent = events.find((item) => item.id === selectedEventId);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b2144] dark:text-[#f1c8d7]">Platform admin</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink dark:text-ink-dark">Event partnership packages</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft dark:text-ink-soft-dark">Set event-specific partnership categories, service descriptions and prices. A paid partnership is displayed only after M-Pesa confirms the amount; paid listings can be hidden here if needed.</p>
      </div>

      <Card className="p-5">
        <label htmlFor="partnership-event" className="mb-2 block text-sm font-medium text-ink dark:text-ink-dark">Choose event</label>
        <select
          id="partnership-event"
          value={selectedEventId}
          onChange={(event) => { setLoading(true); setSelectedEventId(event.target.value); setPackages([]); setApplications([]); setDraft(emptyDraft()); setError(null); setMessage(null); }}
          className="h-11 w-full max-w-2xl rounded-lg border border-border-warm bg-paper-raised px-3 text-ink dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark"
          disabled={loading || events.length === 0}
        >
          {events.length === 0 && <option value="">No events available</option>}
          {events.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.status.replaceAll("_", " ")}</option>)}
        </select>
        {selectedEvent && <p className="mt-2 text-xs text-ink-faint">Event path: /events/{selectedEvent.slug}</p>}
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold text-ink dark:text-ink-dark">Packages for this event</h2>
              <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">Active packages appear on the public event page. Deactivate instead of deleting a package with application history.</p>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={!selectedEventId} onClick={() => { setDraft(emptyDraft()); setError(null); setMessage(null); }}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add package
            </Button>
          </div>
          {loading ? <p className="mt-5 text-sm text-ink-faint">Loading partnership records…</p> : packages.length === 0 ? <p className="mt-5 text-sm text-ink-faint">No package has been created for this event.</p> : (
            <div className="mt-4 space-y-3">
              {packages.map((item) => (
                <article key={item.id} className="rounded-xl border border-border-warm p-4 dark:border-border-dark">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#7b2144] dark:text-[#f1c8d7]">{item.category}</p>
                      <h3 className="mt-1 font-semibold text-ink dark:text-ink-dark">{item.name}</h3>
                      <p className="mt-1 text-sm font-semibold text-ink dark:text-ink-dark">{formatKes(item.price_kes * 100)} · {item.is_active ? "Active" : "Inactive"}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => editPackage(item)}><Edit3 className="h-4 w-4" aria-hidden="true" /> Edit</Button>
                      <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => void togglePackage(item)}>{item.is_active ? "Deactivate" : "Activate"}</Button>
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-soft dark:text-ink-soft-dark">{item.service_description}</p>
                </article>
              ))}
            </div>
          )}
        </Card>

        <Card className="h-fit p-5 sm:p-6">
          <h2 className="font-display text-xl font-semibold text-ink dark:text-ink-dark">{draft.id ? "Edit package" : "Add a package"}</h2>
          <form className="mt-4 space-y-4" onSubmit={(event) => void savePackage(event)}>
            <div>
              <label htmlFor="event-partnership-category" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Partnership category</label>
              <Input id="event-partnership-category" required minLength={2} maxLength={80} value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} placeholder="Catering, media, transport…" />
            </div>
            <div>
              <label htmlFor="event-partnership-name" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Package name</label>
              <Input id="event-partnership-name" required minLength={2} maxLength={120} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div>
              <label htmlFor="event-partnership-services" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Services and inclusions</label>
              <textarea id="event-partnership-services" required minLength={5} maxLength={1200} rows={5} value={draft.serviceDescription} onChange={(event) => setDraft((current) => ({ ...current, serviceDescription: event.target.value }))} className="w-full rounded-lg border border-border-warm bg-paper-raised px-3.5 py-2.5 text-sm text-ink focus:border-saffron-dark dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark" />
              <p className="mt-1 text-xs text-ink-faint">This description and the whole-KES price are snapshotted when an application is created.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="event-partnership-price" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Price (KES)</label>
                <Input id="event-partnership-price" type="number" min={1} max={10000000} step={1} required value={draft.priceKes} onChange={(event) => setDraft((current) => ({ ...current, priceKes: event.target.value }))} />
              </div>
              <div>
                <label htmlFor="event-partnership-order" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Display order</label>
                <Input id="event-partnership-order" type="number" min={0} max={10000} step={1} value={draft.sortOrder} onChange={(event) => setDraft((current) => ({ ...current, sortOrder: event.target.value }))} />
              </div>
            </div>
            <label className="flex items-start gap-3 text-sm text-ink-soft dark:text-ink-soft-dark">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[#7b2144]" checked={draft.isActive} onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))} />
              <span><b className="text-ink dark:text-ink-dark">Active package</b><span className="block text-xs">Only active packages appear to applicants and accept new submissions.</span></span>
            </label>
            {error && <p role="alert" className="rounded-lg border border-rust/30 bg-rust/5 p-3 text-sm text-rust">{error}</p>}
            {message && <p role="status" className="rounded-lg border border-sage/30 bg-sage/5 p-3 text-sm text-sage">{message}</p>}
            <Button type="submit" disabled={saving || loading || !selectedEventId} className="w-full justify-between"><span>{saving ? "Saving…" : "Save package"}</span><Save className="h-4 w-4" aria-hidden="true" /></Button>
          </form>
        </Card>
      </div>

      <Card className="p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold text-ink dark:text-ink-dark">Applications and paid partners</h2>
        <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">Applicant contact details stay private. A listing becomes public automatically only after server-side M-Pesa verification; admins can hide a confirmed listing without changing its payment record.</p>
        {applications.length === 0 ? <p className="mt-4 text-sm text-ink-faint">No partnership applications for this event.</p> : (
          <div className="mt-4 space-y-3">
            {applications.map((application) => (
              <article key={application.id} className="rounded-xl border border-border-warm p-4 dark:border-border-dark">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-ink-faint">{application.public_reference} · {application.category}</p>
                    <h3 className="mt-1 font-semibold text-ink dark:text-ink-dark">{application.business_name} <span className="font-normal text-ink-faint">· {application.package_name}</span></h3>
                    <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">{application.applicant_name} · {application.contact_email} · {application.contact_phone}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-ink dark:text-ink-dark">{formatKes(application.price_kes * 100)}</p>
                    <p className={`mt-1 text-xs font-semibold ${application.status === "paid" ? "text-sage" : "text-ink-faint"}`}>{application.status === "paid" ? "Payment confirmed" : application.status.replaceAll("_", " ")}</p>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-line text-sm text-ink-soft dark:text-ink-soft-dark">{application.offered_services}</p>
                {application.status === "paid" && (
                  <Button type="button" size="sm" variant={application.is_public ? "outline" : "primary"} disabled={saving} className="mt-3" onClick={() => void togglePartner(application)}>
                    {application.is_public ? "Hide from event page" : <><Check className="h-4 w-4" aria-hidden="true" /> Show on event page</>}
                  </Button>
                )}
              </article>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}
