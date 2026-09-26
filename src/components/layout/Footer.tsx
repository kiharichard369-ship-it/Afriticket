import { Link } from "react-router-dom";
import { Camera, Globe, Hash, MessageCircle } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border-warm bg-paper-raised dark:border-border-dark dark:bg-surface-dark">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <Link to="/" className="font-display text-xl font-semibold text-ink dark:text-ink-dark">
            Ticket<span className="text-saffron-text dark:text-saffron">yangu</span>
          </Link>
          <p className="mt-3 max-w-xs text-sm text-ink-soft dark:text-ink-soft-dark">
            Find and book events across Kenya — concerts, markets, sport, theatre, and community
            gatherings, town by town.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-ink dark:text-ink-dark">Discover</h3>
          <ul className="mt-3 space-y-2 text-sm text-ink-soft dark:text-ink-soft-dark">
            <li><Link to="/" className="hover:text-ink dark:hover:text-ink-dark">Browse events</Link></li>
            <li><Link to="/calendar" className="hover:text-ink dark:hover:text-ink-dark">Calendar</Link></li>
            <li><Link to="/about" className="hover:text-ink dark:hover:text-ink-dark">About Ticketyangu</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-ink dark:text-ink-dark">Organisers</h3>
          <ul className="mt-3 space-y-2 text-sm text-ink-soft dark:text-ink-soft-dark">
            <li><Link to="/organiser/apply" className="hover:text-ink dark:hover:text-ink-dark">Start selling</Link></li>
            <li><Link to="/login" className="hover:text-ink dark:hover:text-ink-dark">Organiser log in</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-ink dark:text-ink-dark">Get help</h3>
          <ul className="mt-3 space-y-2 text-sm text-ink-soft dark:text-ink-soft-dark">
            <li><Link to="/help" className="hover:text-ink dark:hover:text-ink-dark">Support centre</Link></li>
            <li><a href="mailto:afriticket@gmail.com" className="hover:text-ink dark:hover:text-ink-dark">afriticket@gmail.com</a></li>
            <li><a href="tel:0115577319" className="hover:text-ink dark:hover:text-ink-dark">0115 577 319</a></li>
          </ul>
          {/* Real social accounts aren't set up yet — these are deliberately
              inert (not links) rather than pointing somewhere that 404s.
              Swap in real hrefs here once the accounts exist. */}
          <div className="mt-4 flex items-center gap-3 text-ink-faint">
            <span title="Facebook — coming soon" aria-label="Facebook (coming soon)" className="cursor-not-allowed"><Globe className="h-5 w-5" /></span>
            <span title="Instagram — coming soon" aria-label="Instagram (coming soon)" className="cursor-not-allowed"><Camera className="h-5 w-5" /></span>
            <span title="X (Twitter) — coming soon" aria-label="X (coming soon)" className="cursor-not-allowed"><Hash className="h-5 w-5" /></span>
            <span title="WhatsApp — coming soon" aria-label="WhatsApp (coming soon)" className="cursor-not-allowed"><MessageCircle className="h-5 w-5" /></span>
          </div>
        </div>
      </div>
      <div className="border-t border-border-warm px-6 py-4 text-center text-xs text-ink-faint dark:border-border-dark">
        © {new Date().getFullYear()} Ticketyangu, a Mirie Technologies product. All rights reserved.
      </div>
    </footer>
  );
}
