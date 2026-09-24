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
            <li><a href="/about" className="hover:text-ink dark:hover:text-ink-dark">About Ticketyangu</a></li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-ink dark:text-ink-dark">Organisers</h3>
          <ul className="mt-3 space-y-2 text-sm text-ink-soft dark:text-ink-soft-dark">
            <li><a href="/organiser/apply" className="hover:text-ink dark:hover:text-ink-dark">Start selling</a></li>
            <li><a href="/organiser/login" className="hover:text-ink dark:hover:text-ink-dark">Organiser log in</a></li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-ink dark:text-ink-dark">Get help</h3>
          <ul className="mt-3 space-y-2 text-sm text-ink-soft dark:text-ink-soft-dark">
            <li><a href="/help" className="hover:text-ink dark:hover:text-ink-dark">Support centre</a></li>
            <li><a href="mailto:afriticket@gmail.com" className="hover:text-ink dark:hover:text-ink-dark">afriticket@gmail.com</a></li>
            <li><a href="tel:0115577319" className="hover:text-ink dark:hover:text-ink-dark">0115 577 319</a></li>
          </ul>
          <div className="mt-4 flex items-center gap-3 text-ink-soft dark:text-ink-soft-dark">
            <a href="/social/facebook" aria-label="Ticketyangu on Facebook" className="hover:text-ink dark:hover:text-ink-dark"><Globe className="h-5 w-5" /></a>
            <a href="/social/instagram" aria-label="Ticketyangu on Instagram" className="hover:text-ink dark:hover:text-ink-dark"><Camera className="h-5 w-5" /></a>
            <a href="/social/twitter" aria-label="Ticketyangu on X" className="hover:text-ink dark:hover:text-ink-dark"><Hash className="h-5 w-5" /></a>
            <a href="/social/whatsapp" aria-label="Chat with Ticketyangu on WhatsApp" className="hover:text-ink dark:hover:text-ink-dark"><MessageCircle className="h-5 w-5" /></a>
          </div>
        </div>
      </div>
      <div className="border-t border-border-warm px-6 py-4 text-center text-xs text-ink-faint dark:border-border-dark">
        © {new Date().getFullYear()} Ticketyangu, a Mirie Technologies product. All rights reserved.
      </div>
    </footer>
  );
}
