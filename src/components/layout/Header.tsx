import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { LayoutDashboard, LogOut, Menu, Moon, ScanLine, Search, ShieldCheck, Sun, Ticket, User } from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
import { useAuth } from "../../context/AuthContext";
import { useOrganisation } from "../../hooks/useOrganisation";
import { usePlatformRole } from "../../hooks/usePlatformRole";
import { buttonVariants } from "../ui/Button";
import { MobileMenu } from "./MobileMenu";
import { NotificationBell } from "../admin/NotificationBell";

const NAV_LINKS = [
  { to: "/", label: "Events" },
  { to: "/calendar", label: "Calendar" },
];

export function Header() {
  const { theme, toggle } = useTheme();
  const { user, signOut } = useAuth();
  // Guest checkout creates an anonymous session: that is not a logged-in account.
  const loggedIn = Boolean(user && !user.is_anonymous);
  const { membership } = useOrganisation();
  const { role: platformRole } = usePlatformRole();
  const isAdmin = platformRole === "admin";
  const canCheckIn = platformRole === "support" || platformRole === "admin";
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-border-warm bg-paper/95 backdrop-blur dark:border-border-dark dark:bg-paper-dark/95">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
        <Link to="/" className="flex items-center gap-2 text-ink dark:text-ink-dark">
          <img src="/afriticket-logo-transparent.png" alt="Afriticket" className="h-9 w-auto max-w-[180px] object-contain" />
          <span className="sr-only">Afriticket</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium ${
                  isActive
                    ? "text-ink dark:text-ink-dark"
                    : "text-ink-soft hover:text-ink dark:text-ink-soft-dark dark:hover:text-ink-dark"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link to="/?focus=search" className="rounded-md p-2 text-ink-soft hover:bg-ink/5 md:hidden" aria-label="Search events">
            <Search className="h-5 w-5" />
          </Link>
          <button
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="rounded-md p-2 text-ink-soft hover:bg-ink/5 dark:text-ink-soft-dark dark:hover:bg-white/10"
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <Link to="/organiser/apply" className={buttonVariants({ variant: "outline", size: "sm", className: "hidden sm:inline-flex" })}>
            Sell tickets
          </Link>
          {loggedIn && (
            <Link
              to="/my-tickets"
              aria-label="My tickets"
              className="hidden rounded-md p-2 text-ink-soft hover:bg-ink/5 dark:text-ink-soft-dark dark:hover:bg-white/10 sm:inline-flex"
            >
              <Ticket className="h-5 w-5" />
            </Link>
          )}
          {membership && (
            <Link
              to="/organiser/dashboard"
              aria-label="Organiser dashboard"
              className="hidden rounded-md p-2 text-ink-soft hover:bg-ink/5 dark:text-ink-soft-dark dark:hover:bg-white/10 sm:inline-flex"
            >
              <LayoutDashboard className="h-5 w-5" />
            </Link>
          )}
          {isAdmin && (
            <Link
              to="/admin/moderation"
              aria-label="Moderation (Super User)"
              title="Moderation"
              className="hidden rounded-md p-2 text-ink-soft hover:bg-ink/5 dark:text-ink-soft-dark dark:hover:bg-white/10 sm:inline-flex"
            >
              <ShieldCheck className="h-5 w-5" />
            </Link>
          )}
          {canCheckIn && (
            <Link
              to="/staff/checkin"
              aria-label="Event check-in"
              title="Event check-in"
              className="hidden rounded-md p-2 text-ink-soft hover:bg-ink/5 dark:text-ink-soft-dark dark:hover:bg-white/10 sm:inline-flex"
            >
              <ScanLine className="h-5 w-5" />
            </Link>
          )}
          {loggedIn && (
            <Link
              to="/profile"
              aria-label="Profile and password"
              title="Profile"
              className="hidden rounded-md p-2 text-ink-soft hover:bg-ink/5 dark:text-ink-soft-dark dark:hover:bg-white/10 sm:inline-flex"
            >
              <User className="h-5 w-5" />
            </Link>
          )}
          {isAdmin && <NotificationBell moderationPath="/admin/moderation" />}
          {loggedIn ? (
            <button
              onClick={() => signOut()}
              aria-label="Log out"
              className="hidden rounded-md p-2 text-ink-soft hover:bg-ink/5 dark:text-ink-soft-dark dark:hover:bg-white/10 sm:inline-flex"
            >
              <LogOut className="h-5 w-5" />
            </button>
          ) : (
            <Link to="/login" className="hidden text-sm font-medium text-ink-soft hover:text-ink dark:text-ink-soft-dark dark:hover:text-ink-dark sm:inline-flex">
              Log in
            </Link>
          )}
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="rounded-md p-2 text-ink-soft hover:bg-ink/5 dark:text-ink-soft-dark dark:hover:bg-white/10 md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      <MobileMenu open={menuOpen} onOpenChange={setMenuOpen} links={NAV_LINKS} />
    </header>
  );
}