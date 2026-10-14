// Save as: src/lib/landing.ts
//
// Where each kind of person "lives" on the site. One place to change it.
import type { PlatformRole } from "../hooks/usePlatformRole";

export function landingPathFor(opts: { platformRole: PlatformRole | null; hasOrganisation: boolean }): string {
  if (opts.platformRole === "admin") return "/admin/moderation";
  if (opts.platformRole === "support") return "/staff/checkin";
  if (opts.hasOrganisation) return "/organiser/dashboard"; // organisers (and moderators who belong to one)
  return "/";
}