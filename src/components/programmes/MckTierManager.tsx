// Location: src/components/programmes/MckTierManager.tsx
// Platform-admin controls for Afriticket-owned MCK partnership packages.
import { useEffect, useState } from "react";
import { Check, Edit3, Plus, Save } from "lucide-react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import type { MckPartnershipTierRow } from "../../types/database";
import { listMckAdminTiers, saveMckPartnershipTier } from "../../repositories/mckProgrammeRepository";

interface TierDraft {
  tierKey: string;
  name: string;
  priceKes: string;
  benefitsText: string;
  sortOrder: string;
  isActive: boolean;
}

const emptyDraft = (): TierDraft => ({ tierKey: "", name: "", priceKes: "", benefitsText: "", sortOrder: "0", isActive: true });
const price = (amount: number) => `KES ${new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(amount)}`;

export function MckTierManager() {
  const [tiers, setTiers] = useState<MckPartnershipTierRow[]>([]);
  const [draft, setDraft] = useState<TierDraft>(emptyDraft);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listMckAdminTiers()
      .then((rows) => { if (active) setTiers(rows); })
      .catch(() => { if (active) setError("Packages could not be loaded. Confirm migration 0028 is applied and this account has the platform-admin role."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshToken]);

  function edit(tier: MckPartnershipTierRow) {
    setDraft({
      tierKey: tier.tier_key,
      name: tier.name,
      priceKes: String(tier.price_kes),
      benefitsText: tier.benefits.join("\n"),
      sortOrder: String(tier.sort_order),
      isActive: tier.is_active,
    });
    setEditingKey(tier.tier_key);
    setError(null);
    setMessage(null);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const benefits = draft.benefitsText.split("\n").map((benefit) => benefit.trim()).filter(Boolean);
    const priceKes = Number(draft.priceKes);
    const sortOrder = Number(draft.sortOrder);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.tierKey.trim())) {
      setError("Use a lowercase package key with letters, numbers and single hyphens.");
      return;
    }
    if (!Number.isInteger(priceKes) || priceKes < 1 || benefits.length === 0 || benefits.length > 20) {
      setError("Enter a whole-number KES price and between 1 and 20 benefit lines.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await saveMckPartnershipTier({
        tierKey: draft.tierKey.trim(),
        name: draft.name.trim(),
        priceKes,
        benefits,
        sortOrder: Number.isInteger(sortOrder) ? sortOrder : 0,
        isActive: draft.isActive,
      });
      setDraft(emptyDraft());
      setEditingKey(null);
      setMessage("Package saved. New enquiries use the current active terms; earlier enquiries keep their recorded snapshot.");
      setRefreshToken((value) => value + 1);
    } catch {
      setError("The package was not saved. Check its key, price, benefits and the admin role, then try again.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(tier: MckPartnershipTierRow) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await saveMckPartnershipTier({
        tierKey: tier.tier_key,
        name: tier.name,
        priceKes: tier.price_kes,
        benefits: tier.benefits,
        sortOrder: tier.sort_order,
        isActive: !tier.is_active,
      });
      setMessage(`${tier.name} ${tier.is_active ? "deactivated" : "activated"}. Existing enquiries and partner records are retained.`);
      setRefreshToken((value) => value + 1);
    } catch {
      setError("The package status was not changed. Check the admin role and migration 0028.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink dark:text-ink-dark">Partnership packages</h2>
            <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">Active packages are shown on the public MCK page and accepted by the enquiry form. Deactivate rather than delete a package with history.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => { setDraft(emptyDraft()); setEditingKey(null); setError(null); setMessage(null); }}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add package
          </Button>
        </div>
        {loading ? <p className="mt-5 text-sm text-ink-faint">Loading packages…</p> : tiers.length === 0 ? <p className="mt-5 text-sm text-ink-faint">No package records found.</p> : (
          <div className="mt-4 space-y-3">
            {tiers.map((tier) => (
              <article key={tier.tier_key} className="rounded-xl border border-border-warm p-4 dark:border-border-dark">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-ink-faint">{tier.tier_key}</p>
                    <h3 className="mt-1 font-semibold text-ink dark:text-ink-dark">{tier.name}</h3>
                    <p className="mt-1 text-sm font-semibold text-[#7b2144] dark:text-[#f1c8d7]">{price(tier.price_kes)} · {tier.is_active ? "Active" : "Inactive"}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => edit(tier)}><Edit3 className="h-4 w-4" aria-hidden="true" /> Edit</Button>
                    <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => void toggleActive(tier)}>{tier.is_active ? "Deactivate" : "Activate"}</Button>
                  </div>
                </div>
                <ul className="mt-3 grid gap-1 text-sm text-ink-soft dark:text-ink-soft-dark sm:grid-cols-2">
                  {tier.benefits.map((benefit) => <li key={benefit} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#7b2144] dark:text-[#f1c8d7]" aria-hidden="true" />{benefit}</li>)}
                </ul>
              </article>
            ))}
          </div>
        )}
      </Card>

      <Card className="h-fit p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold text-ink dark:text-ink-dark">{editingKey ? "Edit package" : "Add a package"}</h2>
        <form className="mt-4 space-y-4" onSubmit={(event) => void save(event)}>
          <div>
            <label htmlFor="mck-tier-key" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Stable package key</label>
            <Input id="mck-tier-key" required minLength={2} maxLength={80} disabled={editingKey !== null} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={draft.tierKey} onChange={(event) => setDraft((current) => ({ ...current, tierKey: event.target.value }))} placeholder="community-impact" />
            <p className="mt-1 text-xs text-ink-faint">Keys cannot change after creation because enquiries and partner records refer to them.</p>
          </div>
          <div>
            <label htmlFor="mck-tier-name" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Public package name</label>
            <Input id="mck-tier-name" required minLength={2} maxLength={120} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="mck-tier-price" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Price (KES)</label>
              <Input id="mck-tier-price" type="number" min={1} step={1} required value={draft.priceKes} onChange={(event) => setDraft((current) => ({ ...current, priceKes: event.target.value }))} />
            </div>
            <div>
              <label htmlFor="mck-tier-order" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Display order</label>
              <Input id="mck-tier-order" type="number" min={0} max={10000} step={1} value={draft.sortOrder} onChange={(event) => setDraft((current) => ({ ...current, sortOrder: event.target.value }))} />
            </div>
          </div>
          <div>
            <label htmlFor="mck-tier-benefits" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Benefits (one per line)</label>
            <textarea id="mck-tier-benefits" required rows={7} maxLength={6000} value={draft.benefitsText} onChange={(event) => setDraft((current) => ({ ...current, benefitsText: event.target.value }))} className="w-full rounded-lg border border-border-warm bg-paper-raised px-3.5 py-2.5 text-sm text-ink focus:border-saffron-dark dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark" />
          </div>
          <label className="flex items-start gap-3 text-sm text-ink-soft dark:text-ink-soft-dark">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[#7b2144]" checked={draft.isActive} onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))} />
            <span><b className="text-ink dark:text-ink-dark">Active package</b><span className="block text-xs">Only active packages appear publicly and can receive new cash enquiries.</span></span>
          </label>
          {error && <p role="alert" className="rounded-lg border border-rust/30 bg-rust/5 p-3 text-sm text-rust">{error}</p>}
          {message && <p role="status" className="rounded-lg border border-sage/30 bg-sage/5 p-3 text-sm text-sage">{message}</p>}
          <Button type="submit" disabled={saving || loading} className="w-full justify-between"><span>{saving ? "Saving…" : "Save package"}</span><Save className="h-4 w-4" aria-hidden="true" /></Button>
        </form>
      </Card>
    </div>
  );
}
