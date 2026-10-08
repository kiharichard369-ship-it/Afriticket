// Save as: src/hooks/usePlatformRole.ts
//
// Which platform role does the signed-in person hold? (admin, support, moderator, or none)
// Everyone can read their own row in platform_staff, so this needs no special access.
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

export type PlatformRole = "support" | "moderator" | "admin";

export function usePlatformRole(): { role: PlatformRole | null; loading: boolean } {
  const { user } = useAuth();
  const [state, setState] = useState<{ role: PlatformRole | null; loading: boolean }>({ role: null, loading: true });
  // Guest checkout sessions are anonymous: they never hold a staff role.
  const userId = user && !user.is_anonymous ? user.id : null;

  useEffect(() => {
    if (!supabase || !userId) {
      setState({ role: null, loading: false });
      return;
    }
    let cancelled = false;
    setState((current) => ({ ...current, loading: true }));
    supabase
      .from("platform_staff")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setState({ role: (data?.role as PlatformRole | undefined) ?? null, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return state;
}