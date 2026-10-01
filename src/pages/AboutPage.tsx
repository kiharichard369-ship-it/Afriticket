import { PageBackdrop } from "../components/layout/PageBackdrop";

export function AboutPage() {
  return (
    <PageBackdrop>
      <div className="mx-auto max-w-2xl px-6 py-16">
        <article className="rounded-3xl border border-border-warm/70 bg-paper/90 p-7 shadow-lg shadow-ink/5 backdrop-blur-sm dark:border-border-dark/70 dark:bg-paper-dark/90 sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-saffron-text dark:text-saffron">Our story</p>
          <h1 className="mt-3 font-display text-4xl font-semibold text-ink dark:text-ink-dark">
            About <span className="text-saffron-text dark:text-saffron">Afriticket</span>
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-soft dark:text-ink-soft-dark">
            Afriticket is a Kenya-focused event discovery and ticketing platform, built to make it
            easy to find and book concerts, markets, sport, theatre, and community gatherings —
            town by town, not just Nairobi.
          </p>
          <p className="mt-4 leading-relaxed text-ink-soft dark:text-ink-soft-dark">
            We built Afriticket because organisers deserve tools that actually fit how events are
            run here — M-Pesa checkout, QR tickets that work at the door, and real-time inventory so
            an event never oversells its capacity. Buyers get a straightforward way to discover
            what's happening near them and hold a valid ticket on their phone, no printing required.
          </p>
          <p className="mt-4 leading-relaxed text-ink-soft dark:text-ink-soft-dark">
            Afriticket is an Africa Media Group product.
          </p>
        </article>
      </div>
    </PageBackdrop>
  );
}
