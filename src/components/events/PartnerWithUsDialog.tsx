// Location: src/components/events/PartnerWithUsDialog.tsx
// Event-scoped partnership application and M-Pesa checkout.
import { useEffect, useRef, useState } from "react";
import { Check, Handshake, ImagePlus } from "lucide-react";
import { supabase, isSupabaseConfigured } from "../../lib/supabaseClient";
import { formatKes } from "../../lib/currency";
import {
  beginEventPartnershipPayment,
  checkEventPartnershipPayment,
  listPublicEventPartnershipPackages,
  requestEventPartnershipLogoUpload,
  submitEventPartnershipApplication,
} from "../../repositories/eventPartnershipRepository";
import type { EventPartnershipPublicPackageRow } from "../../types/database";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Input";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_LOGO_SIZE = 3 * 1024 * 1024;

type Step = "packages" | "details" | "starting" | "pending" | "success" | "failed";

function toInternationalPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9 && /^[17]/.test(digits)) return `254${digits}`;
  return "";
}

export function PartnerWithUsDialog({
  eventId,
  eventTitle,
  open,
  onOpenChange,
  onConfirmed,
}: {
  eventId: string;
  eventTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmed: () => void;
}) {
  const [packages, setPackages] = useState<EventPartnershipPublicPackageRow[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [step, setStep] = useState<Step>("packages");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logoNotice, setLogoNotice] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [applicantName, setApplicantName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [offeredServices, setOfferedServices] = useState("");
  const [consent, setConsent] = useState(false);
  const [pollMessage, setPollMessage] = useState("Waiting for Safaricom to confirm payment…");
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const ticks = useRef(0);
  const selectedPackage = packages.find((item) => item.id === selectedPackageId) ?? null;

  useEffect(() => {
    let active = true;
    listPublicEventPartnershipPackages(eventId)
      .then((rows) => { if (active) setPackages(rows); })
      .catch(() => { if (active) setError("Partnership options could not be loaded. Please try again later."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [eventId]);

  useEffect(() => {
    if (step !== "pending" || !applicationId || !pollingEnabled) return;
    let active = true;
    let checking = false;
    ticks.current = 0;

    async function check() {
      if (checking) return;
      checking = true;
      ticks.current += 1;
      try {
        const result = await checkEventPartnershipPayment(applicationId!);
        if (!active) return;
        if (result.status === "succeeded") {
          setPollingEnabled(false);
          setStep("success");
          onConfirmed();
        } else if (result.status === "failed") {
          setPollingEnabled(false);
          setStep("failed");
          setError("M-Pesa reports that this payment was not completed. You can try again.");
        } else {
          setPollMessage(ticks.current >= 30
            ? "Confirmation is taking longer than usual. Keep this window open; only a verified payment will publish your partnership."
            : "Payment request received. Keep this window open while Safaricom confirms it…");
        }
      } catch {
        if (active) setPollMessage("Still waiting for a server-verified M-Pesa confirmation…");
      } finally {
        checking = false;
      }
    }

    void check();
    const timer = window.setInterval(() => void check(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [step, applicationId, pollingEnabled, onConfirmed]);

  function close() {
    setPollingEnabled(false);
    onOpenChange(false);
  }

  function chooseLogo(file: File | undefined) {
    if (!file) return;
    if (!IMAGE_TYPES.has(file.type)) {
      setError("Choose a JPEG, PNG, or WebP logo.");
      return;
    }
    if (file.size > MAX_LOGO_SIZE) {
      setError("Choose a logo smaller than 3 MB.");
      return;
    }
    setError(null);
    setLogoFile(file);
  }

  async function uploadLogo(createdApplicationId: string) {
    if (!logoFile || !supabase) return;
    const target = await requestEventPartnershipLogoUpload(createdApplicationId, logoFile.type);
    const { error: uploadError } = await supabase.storage
      .from("event-partner-logos")
      .uploadToSignedUrl(target.path, target.token, logoFile, { contentType: logoFile.type, upsert: false });
    if (uploadError) throw uploadError;
  }

  async function submitApplication(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPackage) return;
    const internationalPhone = toInternationalPhone(phone);
    if (!internationalPhone) {
      setError("Enter a valid Kenyan M-Pesa number, such as 0712 345 678 or 254712345678.");
      return;
    }
    if (!consent) {
      setError("Please consent to displaying your business name, service summary and logo on this event after payment confirmation.");
      return;
    }
    if (!isSupabaseConfigured) {
      setError("Partnership applications and payments are not available in this preview build.");
      return;
    }

    setLoading(true);
    setError(null);
    setLogoNotice(null);
    try {
      let currentApplicationId = applicationId;
      if (!currentApplicationId) {
        currentApplicationId = await submitEventPartnershipApplication({
          packageId: selectedPackage.id,
          idempotencyKey,
          applicantName: applicantName.trim(),
          businessName: businessName.trim(),
          contactEmail: email.trim(),
          contactPhone: internationalPhone,
          offeredServices: offeredServices.trim(),
        });
        setApplicationId(currentApplicationId);
      }
      if (logoFile && !applicationId) {
        try {
          await uploadLogo(currentApplicationId);
        } catch {
          setLogoNotice("Your application was saved, but the logo could not be uploaded. The partner listing can still appear without a logo.");
        }
      }
      setStep("starting");
      const payment = await beginEventPartnershipPayment(currentApplicationId, internationalPhone);
      if (payment.status === "succeeded") {
        setStep("success");
        onConfirmed();
      } else if (payment.status === "failed") {
        setStep("failed");
        setError("M-Pesa did not complete the payment. You can try again.");
      } else {
        setStep("pending");
        setPollingEnabled(true);
      }
    } catch (submitError) {
      setError((submitError as Error).message || "Your application could not be submitted. Please try again.");
      setStep(applicationId ? "failed" : "details");
    } finally {
      setLoading(false);
    }
  }

  const title = step === "success" ? "Partnership confirmed"
    : step === "pending" || step === "starting" ? "Confirm with M-Pesa"
    : "Partner with us";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={title}
      description={`Event partnership options for ${eventTitle}. Payment is confirmed by Safaricom before the public listing is shown.`}
    >
      {!isSupabaseConfigured && (
        <p className="mb-4 rounded-lg border border-saffron/30 bg-saffron/10 p-3 text-sm text-ink dark:text-ink-dark">
          Preview only: applications and payment are unavailable until this site is connected to its Supabase backend.
        </p>
      )}

      {step === "packages" && (
        <div className="space-y-4">
          {loading ? <p className="text-sm text-ink-soft dark:text-ink-soft-dark">Loading partnership options…</p>
            : packages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border-warm p-5 text-center dark:border-border-dark">
                <Handshake className="mx-auto h-7 w-7 text-[#7b2144]" aria-hidden="true" />
                <h3 className="mt-2 font-semibold text-ink dark:text-ink-dark">No open partnership packages</h3>
                <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">The event team has not published partnership options for this event yet.</p>
              </div>
            ) : (
              <fieldset className="space-y-3">
                <legend className="mb-2 text-sm text-ink-soft dark:text-ink-soft-dark">Choose a package to see its price and agreed services.</legend>
                {packages.map((item) => (
                  <label key={item.id} className={`block cursor-pointer rounded-xl border p-4 transition ${selectedPackageId === item.id ? "border-[#7b2144] bg-[#7b2144]/5 dark:bg-[#7b2144]/10" : "border-border-warm dark:border-border-dark"}`}>
                    <input
                      type="radio"
                      name="event-partnership-package"
                      className="sr-only"
                      checked={selectedPackageId === item.id}
                      onChange={() => setSelectedPackageId(item.id)}
                    />
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-wide text-[#7b2144] dark:text-[#f1c8d7]">{item.category}</span>
                        <h3 className="mt-1 font-display text-lg font-semibold text-ink dark:text-ink-dark">{item.name}</h3>
                      </div>
                      <span className="shrink-0 font-semibold text-ink dark:text-ink-dark">{formatKes(item.price_kes * 100)}</span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-ink-soft dark:text-ink-soft-dark">{item.service_description}</p>
                  </label>
                ))}
              </fieldset>
            )}
          {error && <p role="alert" className="text-sm text-rust">{error}</p>}
          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={close}>Close</Button>
            <Button type="button" className="flex-1" disabled={!selectedPackage || loading} onClick={() => { setError(null); setStep("details"); }}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {(step === "details" || step === "failed") && (
        <form className="space-y-4" onSubmit={(event) => void submitApplication(event)}>
          {selectedPackage && (
            <div className="rounded-lg bg-paper-raised p-3 text-sm dark:bg-surface-dark">
              <div className="flex justify-between gap-3"><span className="font-medium text-ink dark:text-ink-dark">{selectedPackage.name}</span><span className="font-semibold text-ink dark:text-ink-dark">{formatKes(selectedPackage.price_kes * 100)}</span></div>
              <button type="button" disabled={Boolean(applicationId)} className="mt-1 text-xs text-[#7b2144] underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-[#f1c8d7]" onClick={() => setStep("packages")}>{applicationId ? "Package locked for this application" : "Change package"}</button>
            </div>
          )}
          <div>
            <label htmlFor="partner-applicant-name" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Your name</label>
            <Input id="partner-applicant-name" required minLength={2} maxLength={120} autoComplete="name" value={applicantName} onChange={(event) => setApplicantName(event.target.value)} />
          </div>
          <div>
            <label htmlFor="partner-business-name" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Business or partner name</label>
            <Input id="partner-business-name" required minLength={2} maxLength={160} autoComplete="organization" value={businessName} onChange={(event) => setBusinessName(event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="partner-email" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Contact email</label>
              <Input id="partner-email" required type="email" maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div>
              <label htmlFor="partner-phone" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">M-Pesa phone</label>
              <Input id="partner-phone" required type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0712 345 678" />
            </div>
          </div>
          <div>
            <label htmlFor="partner-offer" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Describe the services you plan to provide</label>
            <textarea id="partner-offer" required minLength={10} maxLength={2000} rows={4} value={offeredServices} onChange={(event) => setOfferedServices(event.target.value)} className="w-full rounded-lg border border-border-warm bg-paper-raised px-3.5 py-2.5 text-sm text-ink focus:border-saffron-dark dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark" />
          </div>
          <div>
            <label htmlFor="partner-logo" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Logo image (optional)</label>
            <div className="flex flex-wrap items-center gap-3">
              <Input id="partner-logo" type="file" accept="image/jpeg,image/png,image/webp" className="h-auto py-2" onChange={(event) => chooseLogo(event.target.files?.[0])} />
              <ImagePlus className="h-5 w-5 text-ink-faint" aria-hidden="true" />
            </div>
            <p className="mt-1 text-xs text-ink-faint">JPEG, PNG or WebP; up to 3 MB. The logo stays private until payment is confirmed.</p>
            {logoFile && <p className="mt-1 text-xs text-ink-soft dark:text-ink-soft-dark">Selected: {logoFile.name}</p>}
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-border-warm p-3 text-sm dark:border-border-dark">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[#7b2144]" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span className="text-ink-soft dark:text-ink-soft-dark">I agree that, after successful M-Pesa confirmation, my business name, service summary and uploaded logo may be displayed as an event partner. My contact details will not be shown publicly.</span>
          </label>
          {logoNotice && <p role="status" className="rounded-lg border border-saffron/30 bg-saffron/10 p-3 text-sm text-ink dark:text-ink-dark">{logoNotice}</p>}
          {error && <p role="alert" className="rounded-lg border border-rust/30 bg-rust/5 p-3 text-sm text-rust">{error}</p>}
          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" disabled={loading} onClick={close}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={loading || !selectedPackage || !consent}>
              {loading ? "Preparing…" : `Continue to pay ${selectedPackage ? formatKes(selectedPackage.price_kes * 100) : ""}`}
            </Button>
          </div>
        </form>
      )}

      {(step === "starting" || step === "pending") && (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#7b2144]/10 text-[#7b2144] dark:text-[#f1c8d7]">
            <Handshake className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="font-medium text-ink dark:text-ink-dark">{step === "starting" ? "Sending the secure M-Pesa request…" : "Check your phone and approve the STK prompt."}</p>
          {logoNotice && <p role="status" className="rounded-lg border border-saffron/30 bg-saffron/10 p-3 text-left text-sm text-ink dark:text-ink-dark">{logoNotice}</p>}
          {step === "pending" && <p role="status" className="text-sm text-ink-soft dark:text-ink-soft-dark">{pollMessage}</p>}
          <p className="text-xs text-ink-faint">The public listing appears only after the payment provider confirms the exact package amount.</p>
          <Button type="button" variant="outline" className="w-full" onClick={close}>Close and check the event later</Button>
        </div>
      )}

      {step === "success" && (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sage/10 text-sage"><Check className="h-6 w-6" aria-hidden="true" /></div>
          <p className="font-display text-xl font-semibold text-ink dark:text-ink-dark">Payment confirmed</p>
          <p className="text-sm text-ink-soft dark:text-ink-soft-dark">Your partnership is now eligible to appear on {eventTitle}. The event page will show your business name, service summary and logo if one was uploaded.</p>
          {applicationId && <p className="text-xs text-ink-faint">Application reference: {applicationId.slice(0, 8).toUpperCase()}</p>}
          <Button type="button" className="w-full" onClick={close}>Done</Button>
        </div>
      )}
    </Dialog>
  );
}
