import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useOrganisation } from "../../hooks/useOrganisation";
import { usePlatformStaff } from "../../hooks/usePlatformStaff";

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[40vh] items-center justify-center text-ink-soft dark:text-ink-soft-dark">{children}</div>;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Centered>Loading…</Centered>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function RequireOrganiser({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { membership, loading } = useOrganisation();
  const location = useLocation();
  if (authLoading || loading) return <Centered>Loading…</Centered>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!membership) return <Navigate to="/organiser/apply" replace />;
  return <>{children}</>;
}

export function RequirePlatformStaff({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { isStaff, loading } = usePlatformStaff();
  const location = useLocation();
  if (authLoading || loading) return <Centered>Loading…</Centered>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!isStaff) {
    // Deliberately NOT a silent redirect to "/" — that looks like nothing
    // happened and gives no way to tell "you're not staff" apart from
    // "the app is broken". If you expected access, confirm your account
    // has a row in the platform_staff table (see the handover guide).
    return (
      <div className="mx-auto flex min-h-[40vh] max-w-lg flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink dark:text-ink-dark">Staff access required</h1>
        <p className="text-ink-soft dark:text-ink-soft-dark">
          This account isn't set up as a Super User yet. If you expected access, ask whoever
          manages the Supabase project to add your account to the <code>platform_staff</code> table.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
