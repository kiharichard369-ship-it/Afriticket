import { MapPin } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

export function UtilityBar() {
  const { user } = useAuth();
  return (
    <div className="hidden border-b border-border-warm bg-ink text-paper dark:border-border-dark md:block">
      <div className="mx-auto flex h-9 max-w-6xl items-center justify-between px-6 text-xs">
        <span className="inline-flex items-center gap-1.5 text-paper/80">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          Browsing events near Nakuru — change town in Filters
        </span>
        <div className="flex items-center gap-4">
          <a href="/help" className="text-paper/80 hover:text-paper">
            Help
          </a>
          {!user && (
            <a href="/login" className="text-paper/80 hover:text-paper">
              Log in
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
