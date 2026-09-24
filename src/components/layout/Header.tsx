import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { LayoutDashboard, LogOut, Menu, Moon, Search, Sun, Ticket } from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
import { useAuth } from "../../context/AuthContext";
import { useOrganisation } from "../../hooks/useOrganisation";
import { buttonVariants } from "../ui/Button";
import { MobileMenu } from "./MobileMenu";

const NAV_LINKS = [
  { to: "/", label: "Events" },
  { to: "/calendar", label: "Calendar" },
];

export function Header() {
  const { theme, toggle } = useTheme();
  const { user, signOut } = useAuth();
  const { membership } = useOrganisation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-border-warm bg-paper/95 backdrop-blur dark:border-border-dark dark:bg-paper-dark/95">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
        <Link to="/" className="font-display text-2xl font-semibold tracking-tight text-ink dark:text-ink-dark">
          Ticket<span className="text-saffron-text dark:text-saffron">yangu</span>
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
          <a href="/organiser/apply" className={buttonVariants({ variant: "outline", size: "sm", className: "hidden sm:inline-flex" })}>
            Sell tickets
          </a>
          {user && (
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
          {user ? (
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
