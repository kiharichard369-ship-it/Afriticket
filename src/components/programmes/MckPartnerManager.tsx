// Location: src/components/programmes/MckPartnerManager.tsx
// Platform-admin controls for confirmed MCK partner records and public recognition.
import { useEffect, useState } from "react";
import { Edit3, Plus, Save } from "lucide-react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { listMckAdminPartners, listMckAdminTiers, saveMckPartner } from "../../repositories/mckProgrammeRepository";
import type { MckCorporatePartnerRow, MckPartnershipTierRow } from "../../types/database";

interface PartnerDraft {
  organisationName: string;
  publicName: string;
  partnershipType: "cash" | "in_kind";
  tierKey: string;
  description: string;
  status: "active" | "completed" | "inactive";
  isPublic: boolean;
  sortOrder: string;
}

const emptyDraft = (): PartnerDraft => ({
  organisationName: "", publicName: "", partnershipType: "cash", tierKey: "",
  description: "", status: "active", isPublic: false, sortOrder: "0",
});

export function MckPartnerManager() {
  const [partners, setPartners] = useState<MckCorporatePartnerRow[]>([]);
  const [tiers, setTiers] = useState<MckPartnershipTierRow[]>([]);
  const [draft, setDraft] = useState<PartnerDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([listMckAdminPartners(), listMckAdminTiers()])
      .then(([partnerRows, tierRows]) => {
        if (!active) return;
        setPartners(partnerRows);
        setTiers(tierRows);
      })
      .catch(() => { if (active) setError("Partner records could not be loaded. Confirm migration 0028 is applied and this account has the platform-admin role."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshToken]);

  function edit(partner: MckCorporatePartnerRow) {
    setDraft({
      organisationName: partner.organisation_name,
      publicName: partner.public_name,
      partnershipType: partner.partnership_type,
      tierKey: partner.tier_key ?? "",
      description: partner.description ?? "",
      status: partner.status,
      isPublic: partner.is_public,
      sortOrder: String(partner.sort_order),
    });
    setEditingId(partner.id);
    setError(null);
    setMessage(null);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.partnershipType === "cash" && !draft.tierKey) {
      setError("Choose the cash package associated with this partner.");
      return;
    }
    const sortOrder = Number(draft.sortOrder);
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await saveMckPartner({
        id: editingId,
        organisationName: draft.organisationName.trim(),
        publicName: draft.publicName.trim(),
        partnershipType: draft.partnershipType,
        tierKey: draft.partnershipType === "cash" ? draft.tierKey : null,
        description: draft.description.trim(),
        status: draft.status,
        isPublic: draft.isPublic,
        sortOrder: Number.isInteger(sortOrder) ? sortOrder : 0,
      });
      setDraft(emptyDraft());
      setEditingId(null);
      setMessage("Partner record saved. It appears publicly only when active and explicitly approved for public recognition.");
      setRefreshToken((value) => value + 1);
    } catch {
      setError("The partner record was not saved. Check the names, cash package selection, and admin role.");
    } finally {
      setSaving(false);
    }
  }

  function packageLabel(partner: MckCorporatePartnerRow) {
    if (partner.partnership_type === "in_kind") return "In-kind";
    return tiers.find((tier) => tier.tier_key === partner.tier_key)?.name ?? "Cash package";
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink dark:text-ink-dark">Confirmed partner records</h2>
            <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">Public recognition is off by default. Add an organisation only after its partnership is confirmed.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => { setDraft(emptyDraft()); setEditingId(null); setError(null); setMessage(null); }}><Plus className="h-4 w-4" aria-hidden="true" /> Add partner</Button>
        </div>
        {loading ? <p className="mt-5 text-sm text-ink-faint">Loading partner records…</p> : partners.length === 0 ? <p className="mt-5 text-sm text-ink-faint">No partner records yet. No partner names are invented or shown publicly.</p> : (
          <div className="mt-4 space-y-3">
            {partners.map((partner) => (
              <article key={partner.id} className="rounded-xl border border-border-warm p-4 dark:border-border-dark">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-ink dark:text-ink-dark">{partner.public_name}</h3>
                    <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">{partner.organisation_name} · {packageLabel(partner)}</p>
                    <p className="mt-1 text-xs text-ink-faint">{partner.status} · {partner.is_public ? "approved for public listing" : "private"}</p>
                    {partner.description && <p className="mt-2 text-sm text-ink-soft dark:text-ink-soft-dark">{partner.description}</p>}
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => edit(partner)}><Edit3 className="h-4 w-4" aria-hidden="true" /> Edit</Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>

      <Card className="h-fit p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold text-ink dark:text-ink-dark">{editingId ? "Edit partner" : "Add a confirmed partner"}</h2>
        <form className="mt-4 space-y-4" onSubmit={(event) => void save(event)}>
          <div>
            <label htmlFor="mck-partner-organisation" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Organisation name</label>
            <Input id="mck-partner-organisation" required minLength={2} maxLength={160} value={draft.organisationName} onChange={(event) => setDraft((current) => ({ ...current, organisationName: event.target.value }))} />
          </div>
          <div>
            <label htmlFor="mck-partner-public-name" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Public display name</label>
            <Input id="mck-partner-public-name" required minLength={2} maxLength={120} value={draft.publicName} onChange={(event) => setDraft((current) => ({ ...current, publicName: event.target.value }))} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="mck-partner-type" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Partnership type</label>
              <Select id="mck-partner-type" value={draft.partnershipType} onChange={(event) => {
                const partnershipType = event.target.value as PartnerDraft["partnershipType"];
                setDraft((current) => ({
                  ...current,
                  partnershipType,
                  tierKey: partnershipType === "in_kind" ? "" : current.tierKey || tiers.find((tier) => tier.is_active)?.tier_key || "",
                }));
              }}>
                <option value="cash">Cash package</option>
                <option value="in_kind">In-kind</option>
              </Select>
            </div>
            <div>
              <label htmlFor="mck-partner-tier" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Package</label>
              <Select id="mck-partner-tier" disabled={draft.partnershipType === "in_kind"} required={draft.partnershipType === "cash"} value={draft.tierKey} onChange={(event) => setDraft((current) => ({ ...current, tierKey: event.target.value }))}>
                <option value="">{draft.partnershipType === "in_kind" ? "Not applicable" : "Choose a package"}</option>
                {tiers.map((tier) => <option key={tier.tier_key} value={tier.tier_key}>{tier.name}{tier.is_active ? "" : " (inactive)"}</option>)}
              </Select>
            </div>
          </div>
          <div>
            <label htmlFor="mck-partner-description" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Public recognition note (optional)</label>
            <textarea id="mck-partner-description" rows={3} maxLength={600} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} className="w-full rounded-lg border border-border-warm bg-paper-raised px-3.5 py-2.5 text-sm text-ink focus:border-saffron-dark dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="mck-partner-status" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Record status</label>
              <Select id="mck-partner-status" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as PartnerDraft["status"] }))}>
                <option value="active">Active</option><option value="completed">Completed</option><option value="inactive">Inactive</option>
              </Select>
            </div>
            <div>
              <label htmlFor="mck-partner-order" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Display order</label>
              <Input id="mck-partner-order" type="number" min={0} max={10000} step={1} value={draft.sortOrder} onChange={(event) => setDraft((current) => ({ ...current, sortOrder: event.target.value }))} />
            </div>
          </div>
          <label className="flex items-start gap-3 text-sm text-ink-soft dark:text-ink-soft-dark">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[#7b2144]" checked={draft.isPublic} onChange={(event) => setDraft((current) => ({ ...current, isPublic: event.target.checked }))} />
            <span><b className="text-ink dark:text-ink-dark">Approve public recognition</b><span className="block text-xs">Only active records with this box checked appear on the public MCK page.</span></span>
          </label>
          {error && <p role="alert" className="rounded-lg border border-rust/30 bg-rust/5 p-3 text-sm text-rust">{error}</p>}
          {message && <p role="status" className="rounded-lg border border-sage/30 bg-sage/5 p-3 text-sm text-sage">{message}</p>}
          <Button type="submit" disabled={saving || loading} className="w-full justify-between"><span>{saving ? "Saving…" : "Save partner"}</span><Save className="h-4 w-4" aria-hidden="true" /></Button>
        </form>
      </Card>
    </div>
  );
}
