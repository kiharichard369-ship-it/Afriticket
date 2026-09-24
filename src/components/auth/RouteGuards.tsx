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
  if (!isStaff) return <Navigate to="/" replace />;
  return <>{children}</>;
}
