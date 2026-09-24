import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";
import type { OrganisationMemberRow } from "../types/database";

export function useOrganisation() {
  const { user } = useAuth();
  const [membership, setMembership] = useState<OrganisationMemberRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!supabase || !user) {
        setMembership(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data } = await supabase
        .from("organisation_members")
        .select("organisation_id, user_id, role, organisation:organisations(*)")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) {
        setMembership((data as unknown as OrganisationMemberRow) ?? null);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { membership, loading };
}
