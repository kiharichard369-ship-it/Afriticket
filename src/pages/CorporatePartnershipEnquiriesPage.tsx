import { useEffect, useState } from "react";
import { ArrowLeft, RefreshCw, Save } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Select } from "../components/ui/Select";
import { partnershipStatuses, partnershipTiers, type PartnershipEnquiryStatus } from "../data/mckPartnershipTiers";
import { listCorporatePartnershipEnquiries, updateCorporatePartnershipEnquiry } from "../repositories/corporatePartnershipRepository";
import type { CorporatePartnershipEnquiryRow } from "../types/database";

// Location: src/pages/CorporatePartnershipEnquiriesPage.tsx
// Admin-only review screen for enquiries stored in Afriticket's Supabase project.
const statusLabels: Record<PartnershipEnquiryStatus, string> = {
  new: "New",
  in_progress: "In progress",
  contacted: "Contacted",
  closed: "Closed",
  spam: "Spam",
};

function partnershipLabel(row: CorporatePartnershipEnquiryRow): string {
  if (row.partnership_type === "in_kind") return "In-kind support";
  if (row.tier_name_snapshot) {
    const price = row.tier_price_snapshot === null ? "" : ` · KES ${new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(row.tier_price_snapshot)}`;
    return `${row.tier_name_snapshot}${price}`;
  }
  const tier = partnershipTiers.find((candidate) => candidate.key === row.tier_key);
  return tier ? `${tier.name} · ${tier.priceLabel}` : "Cash partnership";
}

export function CorporatePartnershipEnquiriesPage() {
  const [rows, setRows] = useState<CorporatePartnershipEnquiryRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { status: PartnershipEnquiryStatus; adminNotes: string }>>({});
  const [filter, setFilter] = useState<"all" | PartnershipEnquiryStatus>("new");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let active = true;
    void listCorporatePartnershipEnquiries()
      .then((data) => { if (active) setRows(data); })
      .catch(() => { if (active) setLoadError("Enquiries could not be loaded. Confirm migrations 0027–0028 are applied and this account has the platform-admin role."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshToken]);

  function draftFor(row: CorporatePartnershipEnquiryRow) {
    return drafts[row.id] ?? { status: row.status, adminNotes: row.admin_notes ?? "" };
  }

  function updateDraft(row: CorporatePartnershipEnquiryRow, patch: Partial<{ status: PartnershipEnquiryStatus; adminNotes: string }>) {
    setDrafts((current) => ({ ...current, [row.id]: { ...draftFor(row), ...patch } }));
    setMessage(null);
    setSaveError(null);
  }

  async function save(row: CorporatePartnershipEnquiryRow) {
    const draft = draftFor(row);
    setSavingId(row.id);
    setMessage(null);
    setSaveError(null);
    try {
      await updateCorporatePartnershipEnquiry(row.id, draft.status, draft.adminNotes);
      setRows((current) => current?.map((item) => item.id === row.id
        ? { ...item, status: draft.status, admin_notes: draft.adminNotes.trim() || null, updated_at: new Date().toISOString() }
        : item) ?? null);
      setDrafts((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      setMessage("Enquiry updated.");
    } catch {
      setSaveError("The update was not saved. Check the admin role and migrations 0027–0028, then try again.");
    } finally {
      setSavingId(null);
    }
  }

  const visibleRows = (rows ?? []).filter((row) => filter === "all" || row.status === filter);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link to="/admin/moderation" className="inline-flex items-center gap-2 text-sm font-medium text-ink-soft hover:text-ink dark:text-ink-soft-dark dark:hover:text-ink-dark">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to moderation
      </Link>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#7b2144] dark:text-[#f1c8d7]">Administrator workspace</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-ink dark:text-ink-dark">Corporate partnership enquiries</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft dark:text-ink-soft-dark">Private review queue for Miss Corporate Kenya partnership submissions. Contact details are visible only to platform administrators.</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="min-w-40">
            <label htmlFor="enquiry-status-filter" className="mb-1 block text-xs font-medium text-ink-soft dark:text-ink-soft-dark">Filter status</label>
            <Select id="enquiry-status-filter" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
              <option value="new">New</option>
              <option value="all">All statuses</option>
              {partnershipStatuses.filter((status) => status !== "new").map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
            </Select>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => { setLoadError(null); setSaveError(null); setLoading(true); setRefreshToken((value) => value + 1); }} disabled={loading} aria-label="Refresh partnership enquiries">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
          </Button>
        </div>
      </div>

      <div className="mt-5 space-y-3" aria-live="polite">
        {loadError && <p role="alert" className="rounded-lg border border-rust/30 bg-rust/5 p-4 text-sm text-rust">{loadError}</p>}
        {saveError && <p role="alert" className="rounded-lg border border-rust/30 bg-rust/5 p-4 text-sm text-rust">{saveError}</p>}
        {message && <p role="status" className="rounded-lg border border-sage/30 bg-sage/5 p-4 text-sm text-sage">{message}</p>}
        {loading ? (
          <p className="py-8 text-center text-sm text-ink-faint">Loading enquiries…</p>
        ) : rows === null ? null : visibleRows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-ink-soft dark:text-ink-soft-dark">{filter === "new" ? "No new enquiries." : "No enquiries match this status."}</Card>
        ) : visibleRows.map((row) => {
          const draft = draftFor(row);
          return (
            <Card key={row.id} className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-ink-faint dark:text-ink-soft-dark">Received <time dateTime={row.created_at}>{new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.created_at))}</time></p>
                  <h2 className="mt-1 break-words font-display text-xl font-semibold text-ink dark:text-ink-dark">{row.organisation_name}</h2>
                  <a href={`mailto:${row.contact_email}`} className="mt-1 inline-block break-all text-sm font-medium text-[#7b2144] hover:underline dark:text-[#f1c8d7]">{row.contact_email}</a>
                  <p className="mt-2 inline-flex rounded-full bg-[#7b2144]/10 px-3 py-1 text-xs font-semibold text-[#7b2144] dark:bg-[#cf8ca7]/15 dark:text-[#f1c8d7]">{partnershipLabel(row)}</p>
                </div>
                <div className="flex min-w-44 flex-col gap-2">
                  <label htmlFor={`status-${row.id}`} className="text-xs font-medium text-ink-soft dark:text-ink-soft-dark">Status</label>
                  <Select id={`status-${row.id}`} value={draft.status} onChange={(event) => updateDraft(row, { status: event.target.value as PartnershipEnquiryStatus })}>
                    {partnershipStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                  </Select>
                </div>
              </div>
              {row.message && <p className="mt-4 whitespace-pre-wrap break-words rounded-lg bg-paper/80 p-3 text-sm leading-relaxed text-ink-soft dark:bg-paper-dark/60 dark:text-ink-soft-dark">{row.message}</p>}
              <div className="mt-4">
                <label htmlFor={`notes-${row.id}`} className="mb-1.5 block text-xs font-medium text-ink-soft dark:text-ink-soft-dark">Administrator notes (optional)</label>
                <textarea id={`notes-${row.id}`} rows={2} maxLength={2000} value={draft.adminNotes} onChange={(event) => updateDraft(row, { adminNotes: event.target.value })} className="w-full rounded-lg border border-border-warm bg-paper-raised px-3 py-2.5 text-sm text-ink focus:border-[#7b2144] dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark" placeholder="Internal follow-up context; avoid unnecessary sensitive details." />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-ink-faint">Contact consent recorded: {row.consent_to_contact ? "Yes" : "No"}</span>
                <Button type="button" size="sm" onClick={() => void save(row)} disabled={savingId === row.id}>
                  <Save className="h-4 w-4" aria-hidden="true" /> {savingId === row.id ? "Saving…" : "Save review"}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
      <p className="mt-6 text-xs leading-relaxed text-ink-faint dark:text-ink-soft-dark">The queue loads the latest 100 submissions. No sponsor account or public enquiry record is exposed.</p>
    </div>
  );
}
