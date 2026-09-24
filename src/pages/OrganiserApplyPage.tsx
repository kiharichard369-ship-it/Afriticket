import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useOrganisation } from "../hooks/useOrganisation";
import { supabase } from "../lib/supabaseClient";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import type { OrganiserApplicationRow } from "../types/database";

export function OrganiserApplyPage() {
  const { user, configured } = useAuth();
  const { membership, loading: membershipLoading } = useOrganisation();
  const navigate = useNavigate();
  const [orgName, setOrgName] = useState("");
  const [tradingName, setTradingName] = useState("");
  const [contactEmail, setContactEmail] = useState(user?.email ?? "");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [existingApplication, setExistingApplication] = useState<OrganiserApplicationRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!supabase || !user) return;
    supabase
      .from("organiser_applications")
      .select("*")
      .eq("applicant_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setExistingApplication((data as OrganiserApplicationRow) ?? null));
  }, [user]);

  useEffect(() => {
    if (!membershipLoading && membership) navigate("/organiser/dashboard", { replace: true });
  }, [membership, membershipLoading, navigate]);

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink dark:text-ink-dark">Sell tickets on Ticketyangu</h1>
        <p className="mt-2 text-ink-soft dark:text-ink-soft-dark">Log in or create an account first, then come back here to apply.</p>
        <Button className="mt-6" onClick={() => navigate("/login", { state: { from: "/organiser/apply" } })}>
          Log in to continue
        </Button>
      </div>
    );
  }

  if (existingApplication && existingApplication.status === "pending") {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink dark:text-ink-dark">Application submitted</h1>
        <p className="mt-2 text-ink-soft dark:text-ink-soft-dark">
          Your application for <strong>{existingApplication.organisation_name}</strong> is being reviewed. We'll
          notify {existingApplication.contact_email} once there's a decision.
        </p>
      </div>
    );
  }

  if (existingApplication && existingApplication.status === "rejected") {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink dark:text-ink-dark">Application not approved</h1>
        <p className="mt-2 text-ink-soft dark:text-ink-soft-dark">
          {existingApplication.review_reason || "Your previous application wasn't approved."} You're welcome to
          apply again with more detail below.
        </p>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !user) return;
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.from("organiser_applications").insert({
      applicant_id: user.id,
      organisation_name: orgName,
      trading_name: tradingName || null,
      contact_email: contactEmail,
      contact_phone: contactPhone || null,
      notes: notes || null,
    });
    setSubmitting(false);
    if (error) setError(error.message);
    else setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink dark:text-ink-dark">Application submitted</h1>
        <p className="mt-2 text-ink-soft dark:text-ink-soft-dark">
          We'll review it and get back to you at {contactEmail}.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-ink dark:text-ink-dark">Apply to sell tickets</h1>
      <p className="mt-1 text-ink-soft dark:text-ink-soft-dark">
        Tell us about your organisation. A platform reviewer approves every application before you can publish
        events.
      </p>

      {!configured && (
        <Card className="mt-4 border-rust/30 bg-rust/5 p-4 text-sm text-rust">
          Supabase isn't connected yet — this form won't save anything until credentials are added to <code>.env</code>.
        </Card>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="orgName" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Organisation name</label>
          <Input id="orgName" required value={orgName} onChange={(e) => setOrgName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="tradingName" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Trading name (optional)</label>
          <Input id="tradingName" value={tradingName} onChange={(e) => setTradingName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="contactEmail" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Contact email</label>
          <Input id="contactEmail" type="email" required value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="contactPhone" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Contact phone (optional)</label>
          <Input id="contactPhone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </div>
        <div>
          <label htmlFor="notes" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">
            What kind of events will you run? (optional)
          </label>
          <textarea
            id="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-border-warm bg-paper-raised px-3.5 py-2.5 text-[0.95rem] text-ink focus:border-saffron-dark dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark"
          />
        </div>
        {error && <p role="alert" className="text-sm text-rust">{error}</p>}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit application"}
        </Button>
      </form>
    </div>
  );
}
