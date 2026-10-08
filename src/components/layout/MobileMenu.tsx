import { NavLink } from "react-router-dom";
import { Dialog } from "../ui/Dialog";
import { useAuth } from "../../context/AuthContext";
import { useOrganisation } from "../../hooks/useOrganisation";
import { usePlatformRole } from "../../hooks/usePlatformRole";

interface MobileMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  links: Array<{ to: string; label: string }>;
}

export function MobileMenu({ open, onOpenChange, links }: MobileMenuProps) {
  const { user, signOut } = useAuth();
  const loggedIn = Boolean(user && !user.is_anonymous); // guests have an anonymous session
  const { membership } = useOrganisation();
  const { role: platformRole } = usePlatformRole();
  const isAdmin = platformRole === "admin";
  const canCheckIn = platformRole === "support" || platformRole === "admin";

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Menu" side="right">
      <nav aria-label="Mobile" className="flex flex-col gap-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/"}
            onClick={() => onOpenChange(false)}
            className={({ isActive }) =>
              `rounded-lg px-3 py-3 text-base font-medium ${
                isActive
                  ? "bg-saffron/15 text-saffron-text dark:text-saffron"
                  : "text-ink hover:bg-ink/5 dark:text-ink-dark dark:hover:bg-white/10"
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
        {membership && (
          <NavLink
            to="/organiser/dashboard"
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-3 py-3 text-base font-medium text-ink hover:bg-ink/5 dark:text-ink-dark dark:hover:bg-white/10"
          >
            Organiser dashboard
          </NavLink>
        )}
        {canCheckIn && (
          <NavLink
            to="/staff/checkin"
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-3 py-3 text-base font-medium text-ink hover:bg-ink/5 dark:text-ink-dark dark:hover:bg-white/10"
          >
            Event check-in
          </NavLink>
        )}
        {isAdmin && (
          <NavLink
            to="/admin/moderation"
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-3 py-3 text-base font-medium text-ink hover:bg-ink/5 dark:text-ink-dark dark:hover:bg-white/10"
          >
            Moderation (Super User)
          </NavLink>
        )}
        {loggedIn && (
          <NavLink
            to="/my-tickets"
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-3 py-3 text-base font-medium text-ink hover:bg-ink/5 dark:text-ink-dark dark:hover:bg-white/10"
          >
            My tickets
          </NavLink>
        )}
        {loggedIn && (
          <NavLink
            to="/profile"
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-3 py-3 text-base font-medium text-ink hover:bg-ink/5 dark:text-ink-dark dark:hover:bg-white/10"
          >
            Profile and password
          </NavLink>
        )}
        {loggedIn && (
          <NavLink
            to="/account"
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-3 py-3 text-base font-medium text-ink hover:bg-ink/5 dark:text-ink-dark dark:hover:bg-white/10"
          >
            Account settings
          </NavLink>
        )}
        <NavLink
          to="/organiser/apply"
          onClick={() => onOpenChange(false)}
          className="rounded-lg px-3 py-3 text-base font-medium text-ink hover:bg-ink/5 dark:text-ink-dark dark:hover:bg-white/10"
        >
          Sell tickets
        </NavLink>
        {loggedIn ? (
          <button
            onClick={() => {
              signOut();
              onOpenChange(false);
            }}
            className="rounded-lg px-3 py-3 text-left text-base font-medium text-ink hover:bg-ink/5 dark:text-ink-dark dark:hover:bg-white/10"
          >
            Log out
          </button>
        ) : (
          <NavLink
            to="/login"
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-3 py-3 text-base font-medium text-ink hover:bg-ink/5 dark:text-ink-dark dark:hover:bg-white/10"
          >
            Log in
          </NavLink>
        )}
      </nav>
    </Dialog>
  );
}