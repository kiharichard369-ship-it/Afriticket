import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

export function usePlatformStaff() {
  const { user } = useAuth();
  const [isStaff, setIsStaff] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!supabase || !user) {
        setIsStaff(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data } = await supabase.from("platform_staff").select("user_id").eq("user_id", user.id).maybeSingle();
      if (!cancelled) {
        setIsStaff(Boolean(data));
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { isStaff, loading };
}
