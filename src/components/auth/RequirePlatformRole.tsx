// Save as: src/components/auth/RequirePlatformRole.tsx
//
// Shows its children only to people holding one of the listed platform roles.
// Use it INSIDE RequireAuth, which handles "not logged in". The database still
// enforces every action; this just keeps the wrong screens from opening.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { usePlatformRole, type PlatformRole } from "../../hooks/usePlatformRole";

export function RequirePlatformRole({ allow, children }: { allow: PlatformRole[]; children: ReactNode }) {
  const { role, loading } = usePlatformRole();

  if (loading) {
    return <p className="mx-auto max-w-3xl px-6 py-16 text-ink-soft dark:text-ink-soft-dark">Checking access…</p>;
  }
  if (!role || !allow.includes(role)) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink dark:text-ink-dark">No access</h1>
        <p className="mt-2 text-ink-soft dark:text-ink-soft-dark">Your account doesn't have permission to open this page.</p>
        <Link to="/" className="mt-6 inline-block text-sm underline">Back to events</Link>
      </div>
    );
  }
  return <>{children}</>;
}