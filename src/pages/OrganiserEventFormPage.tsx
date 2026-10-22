import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useOrganisation } from "../hooks/useOrganisation";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { DateTimePicker } from "../components/ui/DateTimePicker";
import type { CategoryRow, TicketTypeRow, VenueRow } from "../types/database";
import { MCK_PROGRAMME_SLUG } from "../data/mckPartnershipTiers";

interface TicketDraft {
  id?: string;
  name: string;
  priceKes: string;
  capacity: string;
  perOrderLimit: string;
}

const emptyTicket: TicketDraft = { name: "", priceKes: "", capacity: "", perOrderLimit: "6" };

// Everything the organiser can type into this form (used to keep unsaved work safe).
interface FormValues {
  title: string;
  categoryId: string;
  programmeSlug: string;
  venueId: string;
  description: string;
  hostedBy: string;
  directions: string;
  startsAt: string;
  endsAt: string;
  isFree: boolean;
  tickets: TicketDraft[];
  addingVenue: boolean;
  newVenue: { name: string; town: string; address: string };
}

const EMPTY_VALUES: FormValues = {
  title: "", categoryId: "", programmeSlug: "", venueId: "", description: "", hostedBy: "", directions: "",
  startsAt: "", endsAt: "", isFree: false, tickets: [emptyTicket], addingVenue: false,
  newVenue: { name: "", town: "", address: "" },
};

const draftKey = (eventId: string) => `afriticket.eventDraft.${eventId}`;

function readDraft(key: string): { savedAt: number; values: FormValues } | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.savedAt === "number" && parsed.values) return parsed;
  } catch {
    /* ignore a missing or corrupt draft */
  }
  return null;
}

function writeDraft(key: string, values: FormValues) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), values }));
  } catch {
    /* storage can be unavailable */
  }
}

function clearDraft(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// The database stores UTC; the form needs the organiser's local clock time ("2026-10-11T08:00").
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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
  const [programmeSlug, setProgrammeSlug] = useState("");
  const [venueId, setVenueId] = useState("");
  const [description, setDescription] = useState("");
  const [hostedBy, setHostedBy] = useState("");
  const [directions, setDirections] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [isFree, setIsFree] = useState(false);
  const [tickets, setTickets] = useState<TicketDraft[]>([emptyTicket]);
  const [status, setStatus] = useState("draft");
  const [eventId, setEventId] = useState<string | null>(isNew ? null : id!);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState<"draft" | "review" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Unsaved work is kept in this tab's storage, so switching tabs, a browser that discards
  // inactive tabs, or a reload doesn't lose a half-filled form.
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const baselineRef = useRef<FormValues>(EMPTY_VALUES);
  const draftId = isNew ? "new" : id!;
  const values: FormValues = { title, categoryId, programmeSlug, venueId, description, hostedBy, directions, startsAt, endsAt, isFree, tickets, addingVenue, newVenue };
  const valuesJson = JSON.stringify(values);

  function applyValues(v: FormValues) {
    setTitle(v.title);
    setCategoryId(v.categoryId);
    setProgrammeSlug(v.programmeSlug ?? "");
    setVenueId(v.venueId);
    setDescription(v.description);
    setHostedBy(v.hostedBy);
    setDirections(v.directions);
    setStartsAt(v.startsAt);
    setEndsAt(v.endsAt);
    setIsFree(v.isFree);
    setTickets(v.tickets.length ? v.tickets : [emptyTicket]);
    setAddingVenue(v.addingVenue);
    setNewVenue(v.newVenue);
  }

  function discardDraft() {
    clearDraft(draftKey(draftId));
    applyValues(baselineRef.current);
    setDraftRestored(false);
  }

  useEffect(() => {
    if (!supabase) return;
    supabase.from("categories").select("*").order("sort_order").then(({ data }) => setCategories((data as CategoryRow[]) ?? []));
    supabase.from("venues").select("*").order("town").then(({ data }) => setVenues((data as VenueRow[]) ?? []));
  }, []);

  // A new event: bring back anything typed earlier and not yet saved.
  useEffect(() => {
    if (!isNew) return;
    baselineRef.current = EMPTY_VALUES;
    const draft = readDraft(draftKey("new"));
    if (draft) {
      applyValues(draft.values);
      setDraftRestored(true);
    }
    setDraftReady(true);
  }, [isNew]);

  // An existing event: load it, then lay any newer unsaved edits on top.
  useEffect(() => {
    if (isNew || !supabase) return;
    setDraftReady(false);
    (async () => {
      const { data: event, error } = await supabase!.from("events").select("*").eq("id", id).maybeSingle();
      if (error || !event) {
        setError("Couldn't load that event.");
        setLoading(false);
        return;
      }
      const { data: ticketRows } = await supabase!.from("ticket_types").select("*").eq("event_id", id);
      const rows = (ticketRows as TicketTypeRow[]) ?? [];
      const dbValues: FormValues = {
        title: event.title,
        categoryId: event.category_id,
        programmeSlug: event.programme_slug ?? "",
        venueId: event.venue_id,
        description: event.description ?? "",
        hostedBy: event.hosted_by ?? "",
        directions: event.directions ?? "",
        startsAt: toLocalInput(event.starts_at),
        endsAt: toLocalInput(event.ends_at),
        isFree: event.is_free,
        tickets: rows.length
          ? rows.map((t) => ({
              id: t.id,
              name: t.name,
              priceKes: String(t.price_minor / 100),
              capacity: String(t.capacity),
              perOrderLimit: String(t.per_order_limit),
            }))
          : [emptyTicket],
        addingVenue: false,
        newVenue: { name: "", town: "", address: "" },
      };
      baselineRef.current = dbValues;
      applyValues(dbValues);
      setCoverImageUrl(event.cover_image_url ?? null);
      setStatus(event.status);
      setEventId(event.id);

      const draft = readDraft(draftKey(id!));
      const updatedAt = event.updated_at ? Date.parse(event.updated_at) : 0;
      if (draft && draft.savedAt > updatedAt && JSON.stringify(draft.values) !== JSON.stringify(dbValues)) {
        applyValues(draft.values);
        setDraftRestored(true);
      }
      setLoading(false);
      setDraftReady(true);
    })();
  }, [id, isNew]);

  // Keep a copy of unsaved edits (not the chosen image file, which a browser can't store).
  useEffect(() => {
    if (!draftReady) return;
    const key = draftKey(draftId);
    const timer = window.setTimeout(() => {
      if (valuesJson === JSON.stringify(baselineRef.current)) clearDraft(key);
      else writeDraft(key, JSON.parse(valuesJson));
    }, 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftReady, valuesJson]);

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

  async function uploadCoverImage(currentEventId: string): Promise<string | null> {
    if (!supabase || !coverImageFile) return coverImageUrl;
    const extension = coverImageFile.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `events/${currentEventId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("site-assets").upload(path, coverImageFile, {
      cacheControl: "3600",
      contentType: coverImageFile.type,
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from("site-assets").getPublicUrl(path);
    const { error: updateError } = await supabase.from("events").update({ cover_image_url: data.publicUrl }).eq("id", currentEventId);
    if (updateError) throw updateError;
    setCoverImageUrl(data.publicUrl);
    setCoverImageFile(null);
    return data.publicUrl;
  }
  function selectCoverImage(file: File | undefined) {
    if (!file) return;
    if (!("image/jpeg" === file.type || "image/png" === file.type || "image/webp" === file.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Choose an event image smaller than 8 MB.");
      return;
    }
    setError(null);
    setCoverImageFile(file);
    setCoverImagePreview(URL.createObjectURL(file));
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
    if (endsAt && new Date(endsAt) <= new Date(startsAt)) {
      setError("The end time must be after the start time.");
      setSaving(null);
      return;
    }

    const payload = {
      organisation_id: membership.organisation_id,
      category_id: categoryId,
      programme_slug: programmeSlug || null,
      venue_id: finalVenueId,
      title,
      description,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      is_free: isFree,
      // Blank means "use the default" (organisation name / venue address only).
      hosted_by: hostedBy.trim() || null,
      directions: directions.trim() || null,
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

    try {
      await uploadCoverImage(currentEventId!);
    } catch (imageError) {
      setError(`Event saved, but the image could not be uploaded: ${(imageError as Error).message}`);
      setSaving(null);
      return;
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
    setDraftReady(false); // stop the auto-copy, then forget it: the event is saved
    clearDraft(draftKey(draftId));
    navigate("/organiser/dashboard");
  }

  const defaultHost = membership?.organisation?.name ?? "your organisation";
  const selectedVenueAddress = (addingVenue ? newVenue.address : venues.find((v) => v.id === venueId)?.address ?? "")?.trim() ?? "";

  if (loading) return <div className="mx-auto max-w-3xl px-6 py-16 text-ink-soft dark:text-ink-soft-dark">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-display text-3xl font-semibold text-ink dark:text-ink-dark">{isNew ? "New event" : "Edit event"}</h1>
      {draftRestored && (
        <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-saffron/40 bg-saffron/10 p-3 text-sm text-ink dark:text-ink-dark">
          <span>We restored your unsaved changes. If you had chosen a new image, please choose it again.</span>
          <Button type="button" variant="ghost" size="sm" onClick={discardDraft}>Discard and start over</Button>
        </div>
      )}
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

        <div>
          <label htmlFor="event-hosted-by" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Hosted by (optional)</label>
          <Input
            id="event-hosted-by"
            value={hostedBy}
            maxLength={120}
            onChange={(e) => setHostedBy(e.target.value)}
            placeholder={defaultHost}
          />
          <p className="mt-1 text-xs text-ink-faint">
            Shown as: Hosted by {hostedBy.trim() || defaultHost}. Leave it blank to use {defaultHost}.
            {!isNew && status !== "draft" && " Changing the host name on a live event is flagged to Afriticket staff."}
          </p>
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

        <div>
          <label htmlFor="event-programme" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Programme tag (optional)</label>
          <Select id="event-programme" value={programmeSlug} onChange={(event) => setProgrammeSlug(event.target.value)}>
            <option value="">No programme tag</option>
            <option value={MCK_PROGRAMME_SLUG}>Miss Corporate Kenya</option>
          </Select>
          <p className="mt-1 text-xs text-ink-faint">Choose this only for an event formally associated with Miss Corporate Kenya. Tagged published events appear in the MCK event filter.</p>
        </div>

        <div>
          <label htmlFor="event-directions" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Directions (optional)</label>
          <Input
            id="event-directions"
            value={directions}
            maxLength={300}
            onChange={(e) => setDirections(e.target.value)}
            placeholder="e.g. Opposite the main gate, 200 m past the Shell petrol station"
          />
          <p className="mt-1 text-xs text-ink-faint">
            Extra help for finding the place.
            {selectedVenueAddress ? ` Shown after the venue address (${selectedVenueAddress}).` : " Shown under the venue name."}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="event-starts-at" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Starts at</label>
            <DateTimePicker id="event-starts-at" value={startsAt} onChange={setStartsAt} />
          </div>
          <div>
            <label htmlFor="event-ends-at" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Ends at (optional)</label>
            <DateTimePicker id="event-ends-at" value={endsAt} onChange={setEndsAt} optional defaultDate={startsAt.slice(0, 10)} minDate={startsAt.slice(0, 10)} />
          </div>
        </div>

        <Card className="space-y-3 p-4">
          <div>
            <h2 className="font-display text-lg text-ink dark:text-ink-dark">Event image</h2>
            <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">Add a clear landscape image so your event stands out in discovery and on its detail page.</p>
          </div>
          {(coverImagePreview || coverImageUrl) && (
            <img src={coverImagePreview || coverImageUrl || undefined} alt="Event cover preview" className="aspect-[16/9] w-full rounded-lg object-cover" />
          )}
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => selectCoverImage(event.target.files?.[0])}
            aria-label="Event cover image"
          />
          <p className="text-xs text-ink-faint">JPEG, PNG, or WebP · maximum 8 MB · recommended landscape ratio 16:9.</p>
        </Card>
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
