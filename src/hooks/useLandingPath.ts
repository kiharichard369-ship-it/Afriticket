// Save as: src/hooks/useLandingPath.ts
//
// The page this signed-in person should land on: admin -> moderation, support -> check-in,
// organiser -> their dashboard, everyone else -> the home page.
import { useOrganisation } from "./useOrganisation";
import { usePlatformRole } from "./usePlatformRole";
import { landingPathFor } from "../lib/landing";

export function useLandingPath(): { path: string; loading: boolean } {
  const { role, loading: roleLoading } = usePlatformRole();
  const { membership, loading: membershipLoading } = useOrganisation();
  return {
    path: landingPathFor({ platformRole: role, hasOrganisation: Boolean(membership) }),
    loading: roleLoading || membershipLoading,
  };
}