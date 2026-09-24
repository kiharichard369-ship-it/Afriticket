import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useOrganisation } from "../hooks/useOrganisation";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import type { CategoryRow, TicketTypeRow, VenueRow } from "../types/database";

interface TicketDraft {
  id?: string;
  name: string;
  priceKes: string;
  capacity: string;
  perOrderLimit: string;
}

const emptyTicket: TicketDraft = { name: "", priceKes: "", capacity: "", perOrderLimit: "6" };

export function OrganiserEventFormPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const { membership } = useOrganisation();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [addingVenue, setAddingVenue] = useState(false);
  const [newVenue, setNewVenue] = useState({ name: "", town: "", address: "" });

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [isFree, setIsFree] = useState(false);
  const [tickets, setTickets] = useState<TicketDraft[]>([emptyTicket]);
  const [status, setStatus] = useState("draft");
  const [eventId, setEventId] = useState<string | null>(isNew ? null : id!);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState<"draft" | "review" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("categories").select("*").order("sort_order").then(({ data }) => setCategories((data as CategoryRow[]) ?? []));
    supabase.from("venues").select("*").order("town").then(({ data }) => setVenues((data as VenueRow[]) ?? []));
  }, []);

  useEffect(() => {
    if (isNew || !supabase) return;
    (async () => {
      const { data: event, error } = await supabase!.from("events").select("*").eq("id", id).maybeSingle();
      if (error || !event) {
        setError("Couldn't load that event.");
        setLoading(false);
        return;
      }
      setTitle(event.title);
      setCategoryId(event.category_id);
      setVenueId(event.venue_id);
      setDescription(event.description ?? "");
      setStartsAt(event.starts_at?.slice(0, 16) ?? "");
      setEndsAt(event.ends_at?.slice(0, 16) ?? "");
      setIsFree(event.is_free);
      setStatus(event.status);
      setEventId(event.id);

      const { data: ticketRows } = await supabase!.from("ticket_types").select("*").eq("event_id", id);
      const rows = (ticketRows as TicketTypeRow[]) ?? [];
      setTickets(
        rows.length
          ? rows.map((t) => ({
              id: t.id,
              name: t.name,
              priceKes: String(t.price_minor / 100),
              capacity: String(t.capacity),
              perOrderLimit: String(t.per_order_limit),
            }))
          : [emptyTicket]
      );
      setLoading(false);
    })();
  }, [id, isNew]);

  function updateTicket(index: number, patch: Partial<TicketDraft>) {
    setTickets((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  async function ensureVenue(): Promise<string | null> {
    if (!addingVenue) return venueId || null;
    if (!supabase || !membership) return null;
    const { data, error } = await supabase
      .from("venues")
      .insert({ organisation_id: membership.organisation_id, name: newVenue.name, town: newVenue.town, address: newVenue.address || null })
      .select()
      .single();
    if (error) {
      setError(error.message);
      return null;
    }
    return data.id as string;
  }

  async function save(nextStatus: "draft" | "pending_review") {
    if (!supabase || !membership) return;
    setError(null);
    setSaving(nextStatus === "draft" ? "draft" : "review");

    const finalVenueId = await ensureVenue();
    if (!finalVenueId || !categoryId || !title || !startsAt) {
      setError("Title, category, venue, and start time are required.");
      setSaving(null);
      return;
    }

    const payload = {
      organisation_id: membership.organisation_id,
      category_id: categoryId,
      venue_id: finalVenueId,
      title,
      description,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      is_free: isFree,
    };

    let currentEventId = eventId;
    if (isNew && !currentEventId) {
      const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Math.random().toString(36).slice(2, 6)}`;
      const { data, error } = await supabase.from("events").insert({ ...payload, slug, status: "draft" }).select().single();
      if (error) {
        setError(error.message);
        setSaving(null);
        return;
      }
      currentEventId = data.id as string;
      setEventId(currentEventId);
    } else if (currentEventId) {
      const { error } = await supabase.from("events").update(payload).eq("id", currentEventId);
      if (error) {
        setError(error.message);
        setSaving(null);
        return;
      }
    }

    // Sync ticket types: update existing, insert new, delete removed drafts.
    const validTickets = tickets.filter((t) => t.name && t.priceKes && t.capacity);
    for (const t of validTickets) {
      const row = {
        event_id: currentEventId,
        name: t.name,
        price_minor: Math.round(Number(t.priceKes) * 100),
        capacity: Number(t.capacity),
        per_order_limit: Number(t.perOrderLimit) || 6,
      };
      if (t.id) {
        await supabase.from("ticket_types").update(row).eq("id", t.id);
      } else {
        const { data } = await supabase.from("ticket_types").insert(row).select().single();
        if (data) t.id = data.id as string;
      }
    }

    if (nextStatus === "pending_review" && status === "draft") {
      const { error } = await supabase.from("events").update({ status: "pending_review" }).eq("id", currentEventId!);
      if (error) {
        setError(error.message);
        setSaving(null);
        return;
      }
    }

    setSaving(null);
    navigate("/organiser/dashboard");
  }

  if (loading) return <div className="mx-auto max-w-3xl px-6 py-16 text-ink-soft dark:text-ink-soft-dark">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-display text-3xl font-semibold text-ink dark:text-ink-dark">{isNew ? "New event" : "Edit event"}</h1>
      {status !== "draft" && !isNew && (
        <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">
          Status: <strong className="capitalize">{status.replace("_", " ")}</strong>. Saving here updates the details;
          use the dashboard to change its status.
        </p>
      )}

      <div className="mt-6 space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Category</label>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Choose a category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Venue</label>
            {!addingVenue ? (
              <>
                <Select value={venueId} onChange={(e) => setVenueId(e.target.value)}>
                  <option value="">Choose a venue</option>
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}, {v.town}</option>)}
                </Select>
                <button type="button" onClick={() => setAddingVenue(true)} className="mt-1 text-xs font-medium text-saffron-text hover:underline dark:text-saffron">
                  + Add a new venue
                </button>
              </>
            ) : (
              <div className="space-y-2">
                <Input placeholder="Venue name" value={newVenue.name} onChange={(e) => setNewVenue((v) => ({ ...v, name: e.target.value }))} />
                <Input placeholder="Town" value={newVenue.town} onChange={(e) => setNewVenue((v) => ({ ...v, town: e.target.value }))} />
                <Input placeholder="Address (optional)" value={newVenue.address} onChange={(e) => setNewVenue((v) => ({ ...v, address: e.target.value }))} />
                <button type="button" onClick={() => setAddingVenue(false)} className="text-xs font-medium text-ink-soft hover:underline dark:text-ink-soft-dark">
                  Use an existing venue instead
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Starts at</label>
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Ends at (optional)</label>
            <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Description</label>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-border-warm bg-paper-raised px-3.5 py-2.5 text-[0.95rem] text-ink focus:border-saffron-dark dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-ink dark:text-ink-dark">
          <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} className="h-4 w-4 rounded border-border-warm accent-saffron" />
          This is a free / donation-based event
        </label>

        <Card className="space-y-4 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg text-ink dark:text-ink-dark">Ticket types</h2>
            <Button variant="ghost" size="sm" onClick={() => setTickets((t) => [...t, { ...emptyTicket }])}>
              <Plus className="h-4 w-4" /> Add type
            </Button>
          </div>
          {tickets.map((t, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:items-end">
              <div className="col-span-2 sm:col-span-2">
                <label className="mb-1 block text-xs text-ink-soft dark:text-ink-soft-dark">Name</label>
                <Input value={t.name} onChange={(e) => updateTicket(i, { name: e.target.value })} placeholder="e.g. Regular" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-ink-soft dark:text-ink-soft-dark">Price (KES)</label>
                <Input type="number" min={0} value={t.priceKes} onChange={(e) => updateTicket(i, { priceKes: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-ink-soft dark:text-ink-soft-dark">Capacity</label>
                <Input type="number" min={0} value={t.capacity} onChange={(e) => updateTicket(i, { capacity: e.target.value })} />
              </div>
              <div className="flex items-end gap-1">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-ink-soft dark:text-ink-soft-dark">Per-order limit</label>
                  <Input type="number" min={1} value={t.perOrderLimit} onChange={(e) => updateTicket(i, { perOrderLimit: e.target.value })} />
                </div>
                {tickets.length > 1 && (
                  <button type="button" aria-label="Remove ticket type" onClick={() => setTickets((prev) => prev.filter((_, idx) => idx !== i))} className="mb-0.5 rounded-md p-2 text-rust hover:bg-rust/10">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </Card>

        {error && <p role="alert" className="text-sm text-rust">{error}</p>}

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" disabled={saving !== null} onClick={() => save("draft")}>
            {saving === "draft" ? "Saving…" : "Save draft"}
          </Button>
          {(status === "draft" || isNew) && (
            <Button disabled={saving !== null} onClick={() => save("pending_review")}>
              {saving === "review" ? "Submitting…" : "Save & submit for review"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
