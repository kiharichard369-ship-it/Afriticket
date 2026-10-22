import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, ArrowUpRight, CalendarDays, Check, HandHeart, MapPin, ShieldCheck, UsersRound } from "lucide-react";
import { PageBackdrop } from "../components/layout/PageBackdrop";
import { MckPartnerTierCard } from "../components/programmes/MckPartnerTierCard";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import { submitCorporatePartnershipEnquiry } from "../repositories/corporatePartnershipRepository";
import { listPublicMckPartners, listPublicMckTiers } from "../repositories/mckProgrammeRepository";
import type { MckPublicPartnerRow } from "../types/database";
import {
  partnershipTiers as fallbackPartnershipTiers,
  sharedPartnerBenefits,
  MCK_EVENTS_SEARCH_PATH,
  type PartnershipTier,
  type PartnershipTierKey,
  type PartnershipType,
} from "../data/mckPartnershipTiers";

// Location: src/pages/MissCorporateKenyaPage.tsx
// Programme content is maintained in Afriticket; live packages and approved partners come from its Supabase project.

export function MissCorporateKenyaPage() {
  const [selectedTier, setSelectedTier] = useState<PartnershipTierKey | null>(null);
  const [tiers, setTiers] = useState<PartnershipTier[]>(isSupabaseConfigured ? [] : [...fallbackPartnershipTiers]);
  const [partners, setPartners] = useState<MckPublicPartnerRow[]>([]);
  const [programmeDataLoading, setProgrammeDataLoading] = useState(isSupabaseConfigured);
  const [programmeDataError, setProgrammeDataError] = useState<string | null>(null);
  const [partnershipType, setPartnershipType] = useState<PartnershipType>("cash");
  const [organisationName, setOrganisationName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    Promise.all([listPublicMckTiers(), listPublicMckPartners()])
      .then(([tierRows, partnerRows]) => {
        if (!active) return;
        const priceFormatter = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 });
        setTiers(tierRows.map((tier) => ({
          key: tier.tier_key,
          name: tier.name,
          priceKsh: tier.price_kes,
          priceLabel: `KES ${priceFormatter.format(tier.price_kes)}`,
          benefits: tier.benefits,
          sortOrder: tier.sort_order,
          isActive: true,
        })));
        setPartners(partnerRows);
      })
      .catch(() => {
        if (active) setProgrammeDataError("Current programme data is unavailable. The administrator may need to apply MCK management migration 0028.");
      })
      .finally(() => {
        if (active) setProgrammeDataLoading(false);
      });
    return () => { active = false; };
  }, []);

  function chooseTier(tier: PartnershipTier) {
    setSelectedTier(tier.key);
    setPartnershipType("cash");
    setNotice(null);
    document.getElementById("partnership-enquiry")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }

  function chooseInKind() {
    setSelectedTier(null);
    setPartnershipType("in_kind");
    setNotice(null);
    document.getElementById("partnership-enquiry")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    setNotice(null);

    try {
      await submitCorporatePartnershipEnquiry({
        organisationName,
        contactEmail,
        partnershipType,
        tierKey: partnershipType === "cash" ? selectedTier : null,
        message,
        consentToContact: consent,
        website,
      });
      setOrganisationName("");
      setContactEmail("");
      setMessage("");
      setConsent(false);
      setWebsite("");
      setSelectedTier(null);
      setPartnershipType("cash");
      setNotice("Your enquiry has been received and is available for authorised platform-admin review.");
    } catch (submissionError) {
      const error = submissionError as { message?: string };
      if (error.message?.includes("rate_limited")) {
        setErrorMessage("Please wait before submitting another enquiry, then try again through Afriticket.");
      } else {
        setErrorMessage("We could not submit your enquiry just now. No new enquiry is shown as received; please try again later.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageBackdrop>
      <div className="mx-auto max-w-6xl px-6 py-8 sm:py-12">
        <section className="grid overflow-hidden rounded-3xl bg-[#7b2144] text-[#fff8f3] shadow-xl shadow-[#7b2144]/15 lg:grid-cols-[1.08fr_0.92fr]" aria-labelledby="mck-title">
          <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold uppercase tracking-[0.15em] text-[#f1d9bc]">
              <span className="h-2 w-2 rounded-full bg-[#d8b36e]" aria-hidden="true" />
              Miss Corporate Kenya <span aria-hidden="true">·</span> 2026 edition
            </p>
            <h1 id="mck-title" className="mt-5 max-w-xl font-display text-4xl font-semibold leading-[1.05] sm:text-5xl lg:text-6xl">
              Leadership,<br />with <em className="font-medium text-[#f1d9bc]">purpose.</em>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[#fff8f3]/85 sm:text-lg">
              A dedicated Afriticket home for programme participation, local event discovery and confirmed updates.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#partners" className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#f1d9bc] px-5 text-sm font-semibold text-[#3a1a29] transition hover:bg-white">
                Explore partner levels <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
              <a href={MCK_EVENTS_SEARCH_PATH} className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/30 px-5 text-sm font-semibold text-white transition hover:bg-white/10">
                Find MCK events <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium uppercase tracking-[0.14em] text-[#fff8f3]/70" aria-label="Programme themes">
              <span>Mentorship</span><span aria-hidden="true">·</span><span>Visibility</span><span aria-hidden="true">·</span><span>Investment</span>
            </div>
          </div>
          <figure className="relative min-h-[300px] overflow-hidden lg:min-h-[430px]">
            <img src="/images/mck-programme-hero.webp" alt="Editorial illustration of stylised women on a stage framed by an ivory and burgundy arch" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#28111d]/75 via-[#28111d]/10 to-transparent" aria-hidden="true" />
            <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-6 text-xs font-medium uppercase tracking-[0.13em] text-white sm:p-8">
              <span>Leadership · Professional presence<br />Community impact</span>
              <span className="rounded-full border border-white/40 px-3 py-2">MCK 2026</span>
            </figcaption>
          </figure>
        </section>

        <section className="mt-6 grid gap-4 rounded-2xl border border-border-warm bg-paper-raised/95 p-5 shadow-sm dark:border-border-dark dark:bg-surface-dark sm:grid-cols-[1fr_auto] sm:items-center sm:p-7" aria-labelledby="event-state-heading">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b2144] dark:text-[#f1c8d7]">The 2026 edition</p>
            <h2 id="event-state-heading" className="mt-2 font-display text-2xl font-semibold text-ink dark:text-ink-dark">Events, when they are ready.</h2>
            <p className="mt-2 text-sm text-ink-soft dark:text-ink-soft-dark">Dates and tickets will appear in Afriticket discovery after an organiser confirms and publishes an MCK event listing.</p>
          </div>
          <div className="space-y-3 sm:min-w-64 sm:border-l sm:border-border-warm sm:pl-6 dark:sm:border-border-dark">
            <p className="inline-flex items-center gap-2 rounded-full bg-[#7b2144]/10 px-3 py-1.5 text-xs font-semibold text-[#7b2144] dark:bg-[#cf8ca7]/15 dark:text-[#f1c8d7]"><CalendarDays className="h-4 w-4" aria-hidden="true" /> Afriticket event discovery</p>
            <p className="flex items-center gap-2 text-sm font-medium text-ink dark:text-ink-dark"><MapPin className="h-4 w-4 text-[#7b2144] dark:text-[#f1c8d7]" aria-hidden="true" /> Venue details appear on each event listing</p>
            <a href={MCK_EVENTS_SEARCH_PATH} className="inline-flex items-center gap-1 text-sm font-semibold text-[#7b2144] hover:underline dark:text-[#f1c8d7]">Browse MCK event listings <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>
          </div>
        </section>

        <section className="mt-16 grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end" aria-labelledby="programme-heading">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.15em] text-[#7b2144] dark:text-[#f1c8d7]">More than an event listing</p>
            <h2 id="programme-heading" className="mt-3 font-display text-3xl font-semibold leading-tight text-ink dark:text-ink-dark sm:text-4xl">Programme participation, presented <em className="font-medium text-[#7b2144] dark:text-[#f1c8d7]">in one place.</em></h2>
          </div>
          <div>
            <p className="max-w-3xl text-base leading-relaxed text-ink-soft dark:text-ink-soft-dark">
              Use this page to review participation options, send an enquiry and find MCK-related events listed on Afriticket. Programme details can be updated here as the organisers confirm them.
            </p>
            <a href={MCK_EVENTS_SEARCH_PATH} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#7b2144] hover:underline dark:text-[#f1c8d7]">Explore MCK events on Afriticket <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>
          </div>
        </section>

        <div className="mt-7 grid gap-4 md:grid-cols-3">
          {[
            { title: "Develop", icon: <HandHeart className="h-5 w-5" aria-hidden="true" />, text: "Build leadership, communication, confidence and professional presence through mentorship and guided preparation." },
            { title: "Showcase", icon: <ShieldCheck className="h-5 w-5" aria-hidden="true" />, text: "Share community initiatives and CSR work through authentic stories and evidence of impact." },
            { title: "Connect", icon: <UsersRound className="h-5 w-5" aria-hidden="true" />, text: "Meet corporate leaders, mentors, partners and fellow changemakers around shared purpose." },
          ].map((pillar, index) => (
            <Card key={pillar.title} className={`p-5 sm:p-6 ${index === 1 ? "border-[#7b2144]/30 bg-[#7b2144]/[0.035] dark:border-[#cf8ca7]/30 dark:bg-[#7b2144]/10" : ""}`}>
              <div className="flex items-center justify-between text-[#7b2144] dark:text-[#f1c8d7]"><span className="text-xs font-semibold tracking-[0.15em]">0{index + 1}</span>{pillar.icon}</div>
              <h3 className="mt-4 font-display text-xl font-semibold text-ink dark:text-ink-dark">{pillar.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft dark:text-ink-soft-dark">{pillar.text}</p>
            </Card>
          ))}
        </div>

        <section className="mt-16 grid gap-8 lg:grid-cols-[0.85fr_1.15fr]" aria-labelledby="pathways-heading">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.15em] text-[#7b2144] dark:text-[#f1c8d7]">Find your path</p>
            <h2 id="pathways-heading" className="mt-3 font-display text-3xl font-semibold leading-tight text-ink dark:text-ink-dark sm:text-4xl">One platform.<br /><em className="font-medium text-[#7b2144] dark:text-[#f1c8d7]">Many ways in.</em></h2>
          </div>
          <div className="grid gap-3">
            <a href="#partners" className="group flex items-center gap-4 rounded-xl border border-border-warm bg-paper-raised p-4 transition hover:border-[#7b2144]/40 hover:shadow-sm dark:border-border-dark dark:bg-surface-dark dark:hover:border-[#cf8ca7]/50 sm:p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#7b2144]/10 text-[#7b2144] dark:bg-[#cf8ca7]/15 dark:text-[#f1c8d7]"><HandHeart className="h-5 w-5" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><b className="block text-sm text-ink dark:text-ink-dark">For organisations</b><small className="mt-1 block text-sm leading-relaxed text-ink-soft dark:text-ink-soft-dark">Support leadership and community initiatives through a cash or in-kind partnership.</small></span>
              <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint transition group-hover:translate-x-1" aria-hidden="true" />
            </a>
            <a href="#participant-updates" className="group flex items-center gap-4 rounded-xl border border-border-warm bg-paper-raised p-4 transition hover:border-[#7b2144]/40 hover:shadow-sm dark:border-border-dark dark:bg-surface-dark dark:hover:border-[#cf8ca7]/50 sm:p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#7b2144]/10 text-[#7b2144] dark:bg-[#cf8ca7]/15 dark:text-[#f1c8d7]"><UsersRound className="h-5 w-5" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><b className="block text-sm text-ink dark:text-ink-dark">For participants</b><small className="mt-1 block text-sm leading-relaxed text-ink-soft dark:text-ink-soft-dark">Check this page for locally maintained application and nomination updates.</small></span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
            </a>
            <a href="#event-state-heading" className="group flex items-center gap-4 rounded-xl border border-border-warm bg-paper-raised p-4 transition hover:border-[#7b2144]/40 hover:shadow-sm dark:border-border-dark dark:bg-surface-dark dark:hover:border-[#cf8ca7]/50 sm:p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#7b2144]/10 text-[#7b2144] dark:bg-[#cf8ca7]/15 dark:text-[#f1c8d7]"><CalendarDays className="h-5 w-5" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><b className="block text-sm text-ink dark:text-ink-dark">For attendees</b><small className="mt-1 block text-sm leading-relaxed text-ink-soft dark:text-ink-soft-dark">Browse MCK event listings on Afriticket for organiser-confirmed dates, venues and ticket details.</small></span>
              <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint transition group-hover:translate-x-1" aria-hidden="true" />
            </a>
          </div>
        </section>

        <section id="partners" className="mt-16 scroll-mt-24" aria-labelledby="partners-heading">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.15em] text-[#7b2144] dark:text-[#f1c8d7]">Corporate &amp; CSR participation</p>
              <h2 id="partners-heading" className="mt-3 font-display text-3xl font-semibold leading-tight text-ink dark:text-ink-dark sm:text-4xl">Choose a level that fits<br className="hidden sm:block" /> your <em className="font-medium text-[#7b2144] dark:text-[#f1c8d7]">purpose.</em></h2>
            </div>
            <p className="max-w-lg text-sm leading-relaxed text-ink-soft dark:text-ink-soft-dark">Choose a contribution level for brand visibility, professional connections and community impact.</p>
          </div>

          <Card className="mt-7 overflow-hidden border-[#7b2144]/20 p-5 dark:border-[#cf8ca7]/25 sm:p-6">
            <div className="flex flex-wrap items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#7b2144]/10 text-[#7b2144] dark:bg-[#cf8ca7]/15 dark:text-[#f1c8d7]"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></span>
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b2144] dark:text-[#f1c8d7]">Included at every cash level</p>
                <h3 className="mt-1 font-display text-xl font-semibold text-ink dark:text-ink-dark">A shared foundation</h3>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {sharedPartnerBenefits.map((benefit) => <li key={benefit} className="flex items-start gap-2 text-sm text-ink-soft dark:text-ink-soft-dark"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#7b2144] dark:text-[#f1c8d7]" aria-hidden="true" />{benefit}</li>)}
                </ul>
              </div>
            </div>
          </Card>

          {programmeDataLoading && <p className="mt-5 rounded-lg border border-border-warm p-4 text-sm text-ink-soft dark:border-border-dark dark:text-ink-soft-dark" role="status">Loading current partnership packages…</p>}
          {programmeDataError && <p className="mt-5 rounded-lg border border-rust/30 bg-rust/5 p-4 text-sm text-rust" role="alert">{programmeDataError}</p>}
          {!programmeDataLoading && !programmeDataError && tiers.length === 0 && <p className="mt-5 rounded-lg border border-border-warm p-4 text-sm text-ink-soft dark:border-border-dark dark:text-ink-soft-dark">No cash partnership package is currently active. In-kind enquiries remain available.</p>}
          {tiers.length > 0 && (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {tiers.map((tier, index) => (
              <MckPartnerTierCard key={tier.key} tier={tier} index={index} selected={selectedTier === tier.key} onSelect={chooseTier} />
              ))}
            </div>
          )}

          <section className="mt-9" aria-labelledby="confirmed-partners-heading">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b2144] dark:text-[#f1c8d7]">Recognition</p>
            <h3 id="confirmed-partners-heading" className="mt-2 font-display text-xl font-semibold text-ink dark:text-ink-dark">Confirmed partner organisations</h3>
            {partners.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {partners.map((partner) => (
                  <Card key={partner.id} className="p-4">
                    <p className="font-semibold text-ink dark:text-ink-dark">{partner.public_name}</p>
                    <p className="mt-1 text-xs font-medium text-[#7b2144] dark:text-[#f1c8d7]">
                      {partner.partnership_type === "in_kind" ? "In-kind partner" : `${partner.tier_name ?? "Cash partner"} · Cash partnership`}
                    </p>
                    {partner.description && <p className="mt-2 text-sm leading-relaxed text-ink-soft dark:text-ink-soft-dark">{partner.description}</p>}
                  </Card>
                ))}
              </div>
            ) : (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft dark:text-ink-soft-dark">Confirmed partners will appear here only after an administrator approves their public listing.</p>
            )}
          </section>

          <Card className="mt-5 grid gap-5 border-[#c49a4b]/40 bg-[#c49a4b]/[0.08] p-5 dark:border-[#c49a4b]/30 dark:bg-[#c49a4b]/[0.07] sm:grid-cols-[auto_1fr_auto] sm:items-center sm:p-6">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-[#c49a4b]/20 text-[#6b4b12] dark:text-[#f1d9a9]"><HandHeart className="h-6 w-6" aria-hidden="true" /></span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#6b4b12] dark:text-[#f1d9a9]">Professional support</p>
              <h3 className="mt-1 font-display text-xl font-semibold text-ink dark:text-ink-dark">Partnership can be <em>in-kind.</em></h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft dark:text-ink-soft-dark">Venue, hospitality, transport, media, healthcare, event production, professional services or participant support can be discussed with the programme team.</p>
              <p className="mt-2 text-xs leading-relaxed text-ink-faint dark:text-ink-soft-dark">In-kind offers are reviewed by the programme team. Supporting-level visibility is the baseline; any enhanced recognition should be agreed individually.</p>
            </div>
            <Button type="button" variant="outline" onClick={chooseInKind} className="w-full sm:w-auto">Discuss in-kind support <ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
          </Card>
        </section>

        <section className="mt-12 grid gap-6 rounded-2xl bg-[#2b211a] p-6 text-[#fff8f3] dark:bg-[#251d16] sm:p-8 lg:grid-cols-[auto_1fr_auto] lg:items-center" aria-labelledby="impact-heading">
          <div className="font-display text-xl font-semibold tracking-tight text-[#f1d9bc]" aria-hidden="true">MCK <span className="text-[#c49a4b]">×</span> CESRA</div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#f1d9bc]">Accountability matters</p>
            <h2 id="impact-heading" className="mt-2 font-display text-2xl font-semibold">Purpose deserves responsible follow-through.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/75">Any impact initiative, grant or community-support commitment should have clear responsibilities and reporting agreed with the programme team before a partnership is confirmed.</p>
          </div>
          <a href="#partnership-enquiry" className="inline-flex items-center gap-1 text-sm font-semibold text-[#f1d9bc] hover:underline">Discuss a partnership <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
        </section>

        <section id="participant-updates" className="mt-12 grid gap-4 rounded-2xl border border-border-warm bg-paper-raised/90 p-5 dark:border-border-dark dark:bg-surface-dark/90 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6" aria-labelledby="stories-heading">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#7b2144] dark:text-[#f1c8d7]">Programme updates</p>
            <h2 id="stories-heading" className="mt-2 font-display text-xl font-semibold text-ink dark:text-ink-dark">Participant information belongs here, with permission.</h2>
            <p className="mt-2 text-sm text-ink-soft dark:text-ink-soft-dark">Applications, nominations, event details and participant stories will be added to Afriticket only after the programme team confirms them. Nothing is open for application or ticketing through this page today.</p>
          </div>
          <a href={MCK_EVENTS_SEARCH_PATH} className="inline-flex items-center gap-1 text-sm font-semibold text-[#7b2144] hover:underline dark:text-[#f1c8d7]">Explore Afriticket events <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>
        </section>

        <section id="partnership-enquiry" className="mt-16 scroll-mt-24 grid gap-8 lg:grid-cols-[0.85fr_1.15fr]" aria-labelledby="enquiry-heading">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.15em] text-[#7b2144] dark:text-[#f1c8d7]">Start a conversation</p>
            <h2 id="enquiry-heading" className="mt-3 font-display text-3xl font-semibold leading-tight text-ink dark:text-ink-dark sm:text-4xl">Let’s explore<br />what <em className="font-medium text-[#7b2144] dark:text-[#f1c8d7]">fits.</em></h2>
            <p className="mt-4 max-w-md leading-relaxed text-ink-soft dark:text-ink-soft-dark">Send a partnership enquiry for review. This form does not take sponsorship payments or sell event tickets.</p>
            <a href="#partners" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#7b2144] hover:underline dark:text-[#f1c8d7]">Review the participation levels <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
          </div>

          <Card className="p-5 sm:p-7">
            {!isSupabaseConfigured && (
              <div className="mb-5 rounded-lg border border-[#c49a4b]/40 bg-[#c49a4b]/10 p-3 text-sm text-ink-soft dark:text-ink-soft-dark" role="note">
                Online enquiry intake is not enabled in this Afriticket environment yet; the form will remain unavailable until it is configured.
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="mck-organisation" className="mb-1.5 block text-sm font-medium text-ink dark:text-ink-dark">Organisation name</label>
                  <Input id="mck-organisation" autoComplete="organization" required minLength={2} maxLength={160} value={organisationName} onChange={(event) => setOrganisationName(event.target.value)} />
                </div>
                <div>
                  <label htmlFor="mck-email" className="mb-1.5 block text-sm font-medium text-ink dark:text-ink-dark">Work email</label>
                  <Input id="mck-email" type="email" autoComplete="email" required maxLength={254} value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} />
                </div>
              </div>
              <div>
                <label htmlFor="mck-partnership-type" className="mb-1.5 block text-sm font-medium text-ink dark:text-ink-dark">Partnership interest</label>
                <Select id="mck-partnership-type" value={partnershipType} onChange={(event) => {
                  const nextType = event.target.value as PartnershipType;
                  setPartnershipType(nextType);
                  if (nextType === "in_kind") setSelectedTier(null);
                }}>
                  <option value="cash">Cash partnership package</option>
                  <option value="in_kind">In-kind partnership</option>
                </Select>
              </div>
              {partnershipType === "cash" && (
                <div>
                  <label htmlFor="mck-tier" className="mb-1.5 block text-sm font-medium text-ink dark:text-ink-dark">Package level</label>
                  <Select id="mck-tier" required value={selectedTier ?? ""} onChange={(event) => setSelectedTier((event.target.value || null) as PartnershipTierKey | null)}>
                    <option value="" disabled>Choose a contribution level</option>
                    {tiers.map((tier) => <option key={tier.key} value={tier.key}>{tier.name} — {tier.priceLabel}</option>)}
                  </Select>
                </div>
              )}
              <div>
                <label htmlFor="mck-message" className="mb-1.5 block text-sm font-medium text-ink dark:text-ink-dark">What would you like to support? <span className="font-normal text-ink-faint">Optional</span></label>
                <textarea id="mck-message" rows={4} maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} className="w-full rounded-lg border border-border-warm bg-paper-raised px-3.5 py-3 text-sm text-ink placeholder:text-ink-faint focus:border-[#7b2144] dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark dark:placeholder:text-ink-soft-dark" placeholder="Share a short note about your organisation’s interest." />
                <p className="mt-1 text-right text-xs text-ink-faint">{message.length}/2000</p>
              </div>
              <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
                <label htmlFor="mck-website">Leave this field blank</label>
                <input id="mck-website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
              </div>
              <label className="flex items-start gap-3 rounded-lg border border-border-warm p-3 text-sm leading-relaxed text-ink-soft dark:border-border-dark dark:text-ink-soft-dark">
                <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[#7b2144]" required checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                <span>I consent to Afriticket storing and reviewing these details to respond to this partnership enquiry. I will not include confidential information.</span>
              </label>
              <p className="text-xs leading-relaxed text-ink-faint dark:text-ink-soft-dark">Only authorised Afriticket platform administrators can view submitted enquiries. This form does not process payments or issue tickets.</p>
              {errorMessage && <p role="alert" className="rounded-lg border border-rust/30 bg-rust/5 p-3 text-sm text-rust">{errorMessage}</p>}
              {notice && <p role="status" aria-live="polite" className="rounded-lg border border-sage/30 bg-sage/5 p-3 text-sm text-sage">{notice}</p>}
              <Button type="submit" disabled={!isSupabaseConfigured || submitting || !consent} className="w-full justify-between sm:w-auto">
                <span>{submitting ? "Sending enquiry…" : "Submit partnership enquiry"}</span><ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </form>
          </Card>
        </section>
      </div>
    </PageBackdrop>
  );
}
