import { useEffect, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { formatEventDate } from "../lib/date";
import { formatKes } from "../lib/currency";
import type { CategoryRow, EventRow, OrganiserApplicationRow } from "../types/database";
import { siteSettingsRepository, type ThemeEvent } from "../repositories/siteSettingsRepository";

interface RefundRow {
  id: string;
  order_id: string;
  amount_minor: number;
  reason: string | null;
  order?: { reference: string } | null;
}

type PlatformRole = "support" | "moderator" | "admin";
interface PlatformStaffRow {
  user_id: string;
  email: string;
  full_name: string | null;
  role: PlatformRole;
  created_at: string;
}
interface PlatformUserRow {
  user_id: string;
  email: string;
  full_name: string | null;
  account_status: "active" | "suspended" | "deleted";
  registered_at: string;
  role: PlatformRole | null;
}
interface PlatformRoleAuditRow {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: "grant_platform_role" | "revoke_platform_role";
  target_user_id: string | null;
  target_email: string | null;
  target_full_name: string | null;
  metadata: { role?: PlatformRole; email?: string } | null;
  created_at: string;
}

function csvCell(value: string | null | undefined) {
  return `"${(value ?? "").replace(/"/g, '""')}"`;
}

function exportFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AdminModerationPage() {
  const { user } = useAuth();
  const [applications, setApplications] = useState<OrganiserApplicationRow[] | null>(null);
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [refunds, setRefunds] = useState<RefundRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);
  const [wallpaperError, setWallpaperError] = useState<string | null>(null);
  const [wallpaperMessage, setWallpaperMessage] = useState<string | null>(null);
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const [themeEvents, setThemeEvents] = useState<ThemeEvent[]>([]);
  const [selectedThemeEventId, setSelectedThemeEventId] = useState("");
  const [themeEventUntil, setThemeEventUntil] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [newCategoryNames, setNewCategoryNames] = useState("");
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categoryMessage, setCategoryMessage] = useState<string | null>(null);
  const [platformStaff, setPlatformStaff] = useState<PlatformStaffRow[]>([]);
  const [platformUsers, setPlatformUsers] = useState<PlatformUserRow[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleDrafts, setUserRoleDrafts] = useState<Record<string, PlatformRole>>({});
  const [staffEmail, setStaffEmail] = useState("");
  const [staffRole, setStaffRole] = useState<PlatformRole>("moderator");
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffMessage, setStaffMessage] = useState<string | null>(null);
  const [roleAudit, setRoleAudit] = useState<PlatformRoleAuditRow[]>([]);
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [auditAction, setAuditAction] = useState<"all" | PlatformRoleAuditRow["action"]>("all");

  async function refresh() {
    if (!supabase) return;
    const [{ data: apps }, { data: evts }, { data: rfds }, { data: cats }, { data: staffRows }, { data: auditRows }, { data: themeRows }, { data: userRows }] = await Promise.all([
      supabase.from("organiser_applications").select("*").eq("status", "pending").order("created_at"),
      supabase.from("events").select("*, category:categories(*), venue:venues(*)").eq("status", "pending_review").order("created_at"),
      supabase.from("refunds").select("id, order_id, amount_minor, reason, order:orders(reference)").eq("status", "requested").order("created_at"),
      supabase.from("categories").select("*").order("sort_order").order("name"),
      supabase.rpc("list_platform_staff"),
      supabase.rpc("list_platform_role_audit", { p_limit: 50 }),
      supabase.from("events_public").select("id, title, cover_image_url, starts_at").not("cover_image_url", "is", null).gte("starts_at", new Date().toISOString()).order("starts_at", { ascending: true }).limit(100),
      supabase.rpc("list_platform_users", { p_search: userSearch || null }),
    ]);
    setApplications((apps as OrganiserApplicationRow[]) ?? []);
    setEvents((evts as EventRow[]) ?? []);
    setRefunds((rfds as unknown as RefundRow[]) ?? []);
    setCategories((cats as CategoryRow[]) ?? []);
    setPlatformStaff((staffRows as PlatformStaffRow[]) ?? []);
    setRoleAudit((auditRows as PlatformRoleAuditRow[]) ?? []);
    setThemeEvents((themeRows as ThemeEvent[]) ?? []);
    setPlatformUsers((userRows as PlatformUserRow[]) ?? []);
    const settings = await siteSettingsRepository.getPublic().catch(() => null);
    setWallpaperUrl(settings?.wallpaperUrl ?? null);
    setSelectedThemeEventId(settings?.landingThemeEventId ?? "");
    setThemeEventUntil(settings?.landingThemeEventUntil ?? null);
  }

  async function addCategories() {
    if (!supabase) return;
    setCategoryError(null);
    setCategoryMessage(null);
    const names = [...new Set(newCategoryNames.split(/[\n,]+/).map((name) => name.trim()).filter(Boolean))];
    if (names.length === 0 || names.some((name) => name.length < 2)) {
      setCategoryError("Enter one or more category names with at least 2 characters each.");
      return;
    }
    setBusyId("category");
    const added: CategoryRow[] = [];
    const failures: string[] = [];
    for (const name of names) {
      const { data, error } = await supabase.rpc("create_category", { p_name: name });
      if (error) failures.push(`${name}: ${error.message}`);
      else if (data) added.push(data as CategoryRow);
    }
    setBusyId(null);
    if (added.length > 0) {
      setCategories((current) => [...current, ...added].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
      setNewCategoryNames("");
      setCategoryMessage(`${added.length} categor${added.length === 1 ? "y is" : "ies are"} now available when posting an event.`);
    }
    if (failures.length > 0) setCategoryError(failures.join("; "));
  }

  async function grantPlatformRole() {
    if (!supabase) return;
    const email = staffEmail.trim();
    setStaffError(null);
    setStaffMessage(null);
    if (!email || !email.includes("@")) {
      setStaffError("Enter the email address of an existing Afriticket account.");
      return;
    }
    setBusyId("platform-role");
    const { data, error } = await supabase.rpc("grant_platform_role", { p_email: email, p_role: staffRole }).single();
    setBusyId(null);
    if (error) {
      setStaffError(error.message);
      return;
    }
    if (data) {
      const row = data as PlatformStaffRow;
      setPlatformStaff((current) => [...current.filter((staff) => staff.user_id !== row.user_id), row].sort((a, b) => a.email.localeCompare(b.email)));
    }
    setStaffEmail("");
    setStaffMessage(`${email} now has the ${staffRole} platform role.`);
  }

  async function assignRoleToUser(account: PlatformUserRow) {
    if (!supabase) return;
    const role = userRoleDrafts[account.user_id] ?? account.role ?? "moderator";
    setBusyId(`user-role-${account.user_id}`);
    setStaffError(null);
    setStaffMessage(null);
    const { error } = await supabase.rpc("grant_platform_role", { p_email: account.email, p_role: role });
    setBusyId(null);
    if (error) {
      setStaffError(error.message);
      return;
    }
    setStaffMessage(`${account.email} now has the ${role} platform role.`);
    await refresh();
  }

  async function revokePlatformRole(staff: PlatformStaffRow) {
    if (!supabase) return;
    if (!window.confirm(`Remove the ${staff.role} role from ${staff.email}?`)) return;
    setStaffError(null);
    setStaffMessage(null);
    setBusyId(`platform-role-${staff.user_id}`);
    const { error } = await supabase.rpc("revoke_platform_role", { p_user_id: staff.user_id });
    setBusyId(null);
    if (error) {
      setStaffError(error.message);
      return;
    }
    setPlatformStaff((current) => current.filter((row) => row.user_id !== staff.user_id));
    setStaffMessage(`Platform role removed from ${staff.email}.`);
  }

  function exportRoleAuditCsv() {
    const header = ["Timestamp", "Action", "Role", "Actor email", "Target name", "Target email", "Target user ID"];
    const rows = filteredRoleAudit.map((entry) => [
      new Date(entry.created_at).toISOString(),
      entry.action === "grant_platform_role" ? "granted or updated" : "removed",
      entry.metadata?.role ?? "",
      entry.actor_email ?? entry.actor_id ?? "",
      entry.target_full_name ?? "",
      entry.target_email ?? entry.metadata?.email ?? "",
      entry.target_user_id ?? "",
    ]);
    const csv = [header, ...rows].map((row) => row.map((value) => csvCell(value)).join(",")).join("\r\n");
    exportFile(new Blob([`\ufeff${csv}\r\n`], { type: "text/csv;charset=utf-8" }), `afriticket-role-audit-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function exportRoleAuditPdf() {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 42;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 48;
    doc.setFontSize(18);
    doc.text("Afriticket platform role audit", margin, y);
    y += 18;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated ${new Date().toLocaleString()} · ${filteredRoleAudit.length} entries`, margin, y);
    y += 24;
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(9);
    const lineHeight = 13;
    filteredRoleAudit.forEach((entry, index) => {
      const action = entry.action === "grant_platform_role" ? "Granted/updated" : "Removed";
      const role = entry.metadata?.role ? ` (${entry.metadata.role})` : "";
      const actor = entry.actor_email ?? entry.actor_id ?? "Unknown admin";
      const target = entry.target_full_name || entry.target_email || entry.target_user_id || "Unknown account";
      const text = `${index + 1}. ${new Date(entry.created_at).toLocaleString()} — ${action}${role} for ${target}; by ${actor}`;
      const lines = doc.splitTextToSize(text, pageWidth - margin * 2) as string[];
      if (y + lines.length * lineHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(lines, margin, y);
      y += lines.length * lineHeight + 6;
    });
    doc.save(`afriticket-role-audit-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  async function uploadWallpaper(file: File) {
    if (!user) return;
    setBusyId("wallpaper");
    setWallpaperError(null);
    setWallpaperMessage(null);
    try {
      const settings = await siteSettingsRepository.uploadWallpaper(file, user.id);
      setWallpaperUrl(settings.wallpaperUrl);
      setWallpaperMessage("Landing-page theme image updated.");
    } catch (uploadError) {
      setWallpaperError((uploadError as Error).message);
    } finally {
      setBusyId(null);
      if (wallpaperInputRef.current) wallpaperInputRef.current.value = "";
    }
  }
  async function clearWallpaper() {
    setBusyId("wallpaper");
    setWallpaperError(null);
    setWallpaperMessage(null);
    try {
      const settings = await siteSettingsRepository.clearWallpaper();
      setWallpaperUrl(settings.wallpaperUrl);
      setWallpaperMessage("Landing-page theme image cleared.");
    } catch (clearError) {
      setWallpaperError((clearError as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function setEventTheme() {
    if (!selectedThemeEventId) return;
    setBusyId("event-theme");
    setWallpaperError(null);
    setWallpaperMessage(null);
    try {
      const settings = await siteSettingsRepository.setEventTheme(selectedThemeEventId);
      setThemeEventUntil(settings.landingThemeEventUntil);
      setWallpaperMessage("Event image is now the landing background for 24 hours.");
    } catch (themeError) {
      setWallpaperError((themeError as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function clearEventTheme() {
    setBusyId("event-theme");
    setWallpaperError(null);
    setWallpaperMessage(null);
    try {
      await siteSettingsRepository.clearEventTheme();
      setSelectedThemeEventId("");
      setThemeEventUntil(null);
      setWallpaperMessage("Manual event theme cleared. Automatic one-week priority remains enabled.");
    } catch (themeError) {
      setWallpaperError((themeError as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function approveApplication(id: string) {
    if (!supabase) return;
    setBusyId(id);
    const { error } = await supabase.rpc("approve_organiser_application", { p_application_id: id, p_reason: null });
    setBusyId(null);
    if (error) alert(error.message);
    else refresh();
  }

  async function rejectApplication(id: string) {
    if (!supabase) return;
    const reason = window.prompt("Reason for rejecting this application?");
    if (reason === null) return;
    setBusyId(id);
    const { error } = await supabase.rpc("reject_organiser_application", { p_application_id: id, p_reason: reason });
    setBusyId(null);
    if (error) alert(error.message);
    else refresh();
  }

  async function decideEvent(id: string, status: "published" | "draft", reason?: string) {
    if (!supabase) return;
    setBusyId(id);
    const { error } = await supabase
      .from("events")
      .update({ status, published_at: status === "published" ? new Date().toISOString() : null, moderation_reason: reason ?? null })
      .eq("id", id);
    setBusyId(null);
    if (error) alert(error.message);
    else refresh();
  }

  async function changeEventCategory(eventId: string, categoryId: string) {
    if (!supabase || !categoryId) return;
    setBusyId(`category-${eventId}`);
    const { error } = await supabase.from("events").update({ category_id: categoryId }).eq("id", eventId);
    setBusyId(null);
    if (error) alert(error.message);
    else refresh();
  }

  async function approveRefund(refundId: string) {
    if (!supabase || !user) return;
    setBusyId(refundId);
    const { error } = await supabase.rpc("approve_refund", { p_refund_id: refundId, p_approved_by: user.id });
    setBusyId(null);
    if (error) alert(error.message);
    else refresh();
  }

  const auditFromTime = auditFrom ? new Date(`${auditFrom}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
  const auditToTime = auditTo ? new Date(`${auditTo}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
  const invalidAuditRange = auditFromTime > auditToTime;
  const filteredRoleAudit = invalidAuditRange
    ? []
    : roleAudit.filter((entry) => {
        const timestamp = new Date(entry.created_at).getTime();
        return timestamp >= auditFromTime && timestamp <= auditToTime && (auditAction === "all" || entry.action === auditAction);
      });

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display text-3xl font-semibold text-ink dark:text-ink-dark">Moderation queue</h1>
      <Card className="mt-6 overflow-hidden p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl text-ink dark:text-ink-dark">Landing-page theme image</h2>
            <p className="mt-1 max-w-2xl text-sm text-ink-soft dark:text-ink-soft-dark">
              Upload a wide, text-free image for the public Afriticket landing hero. It is stored in the site-assets bucket and shown publicly with a readability overlay.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={busyId === "wallpaper"} onClick={() => wallpaperInputRef.current?.click()}>
              {busyId === "wallpaper" ? "Uploading…" : "Choose image"}
            </Button>
            {wallpaperUrl && <Button size="sm" variant="outline" disabled={busyId === "wallpaper"} onClick={clearWallpaper}>Use default</Button>}
          </div>
        </div>
        <input
          ref={wallpaperInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadWallpaper(file);
          }}
        />
        {wallpaperUrl && <img src={wallpaperUrl} alt="Current landing-page theme" className="mt-4 aspect-[21/7] w-full rounded-lg object-cover" />}
        <div className="mt-4 rounded-lg border border-border-warm p-3 dark:border-border-dark">
          <h3 className="font-medium text-ink dark:text-ink-dark">Event theme priority</h3>
          <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">
            Select a published event image for a 24-hour landing-page takeover. If no manual theme is active, the nearest event with an image starting within 7 days is automatically used.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="landing-event-theme" className="mb-1 block text-xs text-ink-soft dark:text-ink-soft-dark">Event image</label>
              <Select id="landing-event-theme" value={selectedThemeEventId} onChange={(event) => setSelectedThemeEventId(event.target.value)}>
                <option value="">Choose an event</option>
                {themeEvents.map((event) => <option key={event.id} value={event.id}>{event.title} — {formatEventDate(event.starts_at)}</option>)}
              </Select>
            </div>
            <Button size="sm" disabled={!selectedThemeEventId || busyId === "event-theme"} onClick={() => void setEventTheme()}>
              {busyId === "event-theme" ? "Saving…" : "Use for 24 hours"}
            </Button>
            {themeEventUntil && <Button size="sm" variant="outline" disabled={busyId === "event-theme"} onClick={() => void clearEventTheme()}>Clear event theme</Button>}
          </div>
          {themeEventUntil && <p className="mt-2 text-xs text-sage">Manual event theme active until {new Date(themeEventUntil).toLocaleString()}.</p>}
          {themeEvents.length === 0 && <p className="mt-2 text-xs text-ink-faint">No upcoming published events with cover images are available.</p>}
        </div>
        {wallpaperMessage && <p className="mt-3 text-sm text-sage" role="status">{wallpaperMessage}</p>}
        {wallpaperError && <p className="mt-3 text-sm text-rust" role="alert">{wallpaperError}</p>}
      </Card>

      <Card className="mt-6 p-5">
        <div>
          <h2 className="font-display text-xl text-ink dark:text-ink-dark">Event categories</h2>
          <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">
            These categories appear on the landing page and in the event-posting selector. Add one or several at once when the existing list does not fit an event.
          </p>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="new-category-names" className="mb-1 block text-xs text-ink-soft dark:text-ink-soft-dark">Names separated by commas or new lines</label>
            <textarea
              id="new-category-names"
              value={newCategoryNames}
              onChange={(event) => setNewCategoryNames(event.target.value)}
              placeholder={'e.g. Food & Dining, Sports\nFamily & Kids'}
              aria-label="New category names"
              maxLength={500}
              rows={2}
              className="w-full rounded-lg border border-border-warm bg-paper-raised px-3.5 py-2.5 text-[0.95rem] text-ink focus:border-saffron-dark dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark"
            />
          </div>
          <Button disabled={busyId === "category"} onClick={() => void addCategories()}>
            {busyId === "category" ? "Adding…" : "Add categories"}
          </Button>
        </div>
        {categoryError && <p className="mt-2 text-sm text-rust" role="alert">{categoryError}</p>}
        {categoryMessage && <p className="mt-2 text-sm text-sage" role="status">{categoryMessage}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {categories.map((category) => <Badge key={category.id} tone="saffron">{category.name}</Badge>)}
        </div>
      </Card>

      <Card className="mt-6 p-5">
        <div>
          <h2 className="font-display text-xl text-ink dark:text-ink-dark">Platform roles</h2>
          <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">
            Grant or update a role for an existing Afriticket account by email. Only administrators can manage this list.
          </p>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="staff-email" className="mb-1 block text-xs text-ink-soft dark:text-ink-soft-dark">Account email</label>
            <Input id="staff-email" type="email" value={staffEmail} onChange={(event) => setStaffEmail(event.target.value)} placeholder="person@example.com" />
          </div>
          <div className="sm:w-44">
            <label htmlFor="staff-role" className="mb-1 block text-xs text-ink-soft dark:text-ink-soft-dark">Role</label>
            <Select id="staff-role" value={staffRole} onChange={(event) => setStaffRole(event.target.value as PlatformRole)}>
              <option value="support">Support</option>
              <option value="moderator">Moderator</option>
              <option value="admin">Administrator</option>
            </Select>
          </div>
          <Button disabled={busyId === "platform-role"} onClick={() => void grantPlatformRole()}>
            {busyId === "platform-role" ? "Saving…" : "Grant role"}
          </Button>
        </div>
        {staffError && <p className="mt-2 text-sm text-rust" role="alert">{staffError}</p>}
        {staffMessage && <p className="mt-2 text-sm text-sage" role="status">{staffMessage}</p>}
        <div className="mt-4 space-y-2">
          {platformStaff.length === 0 ? (
            <p className="text-sm text-ink-faint">No platform roles found, or migration 0021 has not been applied yet.</p>
          ) : platformStaff.map((staff) => (
            <div key={staff.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-warm p-3 dark:border-border-dark">
              <div>
                <p className="font-medium text-ink dark:text-ink-dark">{staff.full_name || staff.email}</p>
                {staff.full_name && <p className="text-xs text-ink-soft dark:text-ink-soft-dark">{staff.email}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="saffron">{staff.role}</Badge>
                <Button size="sm" variant="outline" disabled={busyId === `platform-role-${staff.user_id}`} onClick={() => void revokePlatformRole(staff)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-6 p-5">
        <div>
          <h2 className="font-display text-xl text-ink dark:text-ink-dark">Registered accounts</h2>
          <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">
            New accounts appear here automatically. Leave an account unchanged, or assign/update its platform role directly from this list.
          </p>
        </div>
        <div className="mt-4 flex gap-2">
          <Input aria-label="Search registered accounts" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Search by email or name" />
          <Button variant="outline" onClick={() => void refresh()}>Search</Button>
        </div>
        <div className="mt-4 space-y-2">
          {platformUsers.length === 0 ? (
            <p className="text-sm text-ink-faint">No accounts found, or migration 0024 has not been applied yet.</p>
          ) : platformUsers.map((account) => {
            const draftRole = userRoleDrafts[account.user_id] ?? account.role ?? "moderator";
            const isDeleted = account.account_status === "deleted";
            return (
              <div key={account.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-warm p-3 dark:border-border-dark">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink dark:text-ink-dark">{account.full_name || account.email}</p>
                  {account.full_name && <p className="truncate text-xs text-ink-soft dark:text-ink-soft-dark">{account.email}</p>}
                  <p className="text-xs text-ink-faint">Registered {new Date(account.registered_at).toLocaleDateString()} · {account.account_status}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {account.role ? <Badge tone="saffron">{account.role}</Badge> : <Badge tone="neutral">No platform role</Badge>}
                  <Select
                    aria-label={`Role for ${account.email}`}
                    value={draftRole}
                    disabled={isDeleted}
                    className="h-9 min-w-36 text-sm"
                    onChange={(event) => setUserRoleDrafts((current) => ({ ...current, [account.user_id]: event.target.value as PlatformRole }))}
                  >
                    <option value="support">Support</option>
                    <option value="moderator">Moderator</option>
                    <option value="admin">Administrator</option>
                  </Select>
                  <Button size="sm" disabled={isDeleted || busyId === `user-role-${account.user_id}`} onClick={() => void assignRoleToUser(account)}>
                    {busyId === `user-role-${account.user_id}` ? "Saving…" : account.role ? "Update role" : "Assign role"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="mt-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-ink dark:text-ink-dark">Role-change activity</h2>
            <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">
              Recent grants, role updates, and removals made through the platform-role controls.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="saffron">Showing {filteredRoleAudit.length} of {roleAudit.length}</Badge>
            <Button size="sm" variant="outline" disabled={filteredRoleAudit.length === 0} onClick={exportRoleAuditCsv}>Download CSV</Button>
            <Button size="sm" variant="outline" disabled={filteredRoleAudit.length === 0} onClick={exportRoleAuditPdf}>Download PDF</Button>
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-border-warm p-3 dark:border-border-dark">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="audit-from" className="mb-1 block text-xs text-ink-soft dark:text-ink-soft-dark">From date</label>
              <Input id="audit-from" type="date" value={auditFrom} onChange={(event) => setAuditFrom(event.target.value)} />
            </div>
            <div>
              <label htmlFor="audit-to" className="mb-1 block text-xs text-ink-soft dark:text-ink-soft-dark">To date</label>
              <Input id="audit-to" type="date" value={auditTo} onChange={(event) => setAuditTo(event.target.value)} />
            </div>
            <div className="min-w-52">
              <label htmlFor="audit-action" className="mb-1 block text-xs text-ink-soft dark:text-ink-soft-dark">Action type</label>
              <Select id="audit-action" value={auditAction} onChange={(event) => setAuditAction(event.target.value as typeof auditAction)}>
                <option value="all">All actions</option>
                <option value="grant_platform_role">Granted or updated</option>
                <option value="revoke_platform_role">Removed</option>
              </Select>
            </div>
            {(auditFrom || auditTo || auditAction !== "all") && (
              <Button size="sm" variant="ghost" onClick={() => { setAuditFrom(""); setAuditTo(""); setAuditAction("all"); }}>
                Clear filters
              </Button>
            )}
          </div>
          {invalidAuditRange && <p className="mt-2 text-sm text-rust" role="alert">The “From date” must be on or before the “To date”.</p>}
          <p className="mt-2 text-xs text-ink-faint">Filters apply to the latest 50 loaded audit entries and to both downloads.</p>
        </div>
        <div className="mt-4 space-y-2">
          {roleAudit.length === 0 ? (
            <p className="text-sm text-ink-faint">No role changes recorded yet, or migration 0022 has not been applied.</p>
          ) : filteredRoleAudit.length === 0 ? (
            <p className="text-sm text-ink-faint">No audit entries match the selected filters.</p>
          ) : filteredRoleAudit.map((entry) => {
            const target = entry.target_full_name || entry.target_email || entry.target_user_id || "Unknown account";
            const role = entry.metadata?.role;
            const verb = entry.action === "grant_platform_role" ? "granted/updated" : "removed";
            return (
              <div key={entry.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border-warm p-3 dark:border-border-dark">
                <div className="min-w-0">
                  <p className="text-sm text-ink dark:text-ink-dark">
                    <strong>{entry.actor_email || entry.actor_id || "Unknown admin"}</strong> {verb} {role ? <><strong>{role}</strong> for </> : "the platform role for "}<strong>{target}</strong>
                  </p>
                  {entry.target_full_name && entry.target_email && <p className="text-xs text-ink-soft dark:text-ink-soft-dark">{entry.target_email}</p>}
                </div>
                <time className="shrink-0 text-xs text-ink-faint" dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time>
              </div>
            );
          })}
        </div>
      </Card>

      <section className="mt-8">
        <h2 className="font-display text-xl text-ink dark:text-ink-dark">Organiser applications</h2>
        <div className="mt-3 space-y-3">
          {applications === null ? (
            <p className="text-ink-soft dark:text-ink-soft-dark">Loading…</p>
          ) : applications.length === 0 ? (
            <p className="text-sm text-ink-faint">Nothing pending.</p>
          ) : (
            applications.map((app) => (
              <Card key={app.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium text-ink dark:text-ink-dark">{app.organisation_name}</p>
                  <p className="text-sm text-ink-soft dark:text-ink-soft-dark">{app.contact_email}{app.notes ? ` — ${app.notes}` : ""}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={busyId === app.id} onClick={() => rejectApplication(app.id)}>Reject</Button>
                  <Button size="sm" disabled={busyId === app.id} onClick={() => approveApplication(app.id)}>Approve</Button>
                </div>
              </Card>
            ))
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl text-ink dark:text-ink-dark">Events awaiting review</h2>
        <div className="mt-3 space-y-3">
          {events === null ? (
            <p className="text-ink-soft dark:text-ink-soft-dark">Loading…</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-ink-faint">Nothing pending.</p>
          ) : (
            events.map((event) => (
              <Card key={event.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink dark:text-ink-dark">{event.title}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">
                    {formatEventDate(event.starts_at)} · {event.venue?.name}, {event.venue?.town}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <label htmlFor={`category-${event.id}`} className="text-xs text-ink-soft dark:text-ink-soft-dark">Category</label>
                    <Select
                      id={`category-${event.id}`}
                      value={event.category_id}
                      disabled={busyId === `category-${event.id}`}
                      onChange={(change) => void changeEventCategory(event.id, change.target.value)}
                      className="min-w-44 py-1 text-sm"
                    >
                      {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === event.id}
                    onClick={() => {
                      const reason = window.prompt("Reason for sending this back to draft?") ?? undefined;
                      decideEvent(event.id, "draft", reason);
                    }}
                  >
                    Send back
                  </Button>
                  <Button size="sm" disabled={busyId === event.id} onClick={() => decideEvent(event.id, "published")}>
                    Publish
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl text-ink dark:text-ink-dark">Refund requests</h2>
        <div className="mt-3 space-y-3">
          {refunds === null ? (
            <p className="text-ink-soft dark:text-ink-soft-dark">Loading…</p>
          ) : refunds.length === 0 ? (
            <p className="text-sm text-ink-faint">Nothing pending.</p>
          ) : (
            refunds.map((refund) => (
              <Card key={refund.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium text-ink dark:text-ink-dark">
                    {refund.order?.reference ?? refund.order_id} — {formatKes(refund.amount_minor)}
                  </p>
                  {refund.reason && <p className="text-sm text-ink-soft dark:text-ink-soft-dark">{refund.reason}</p>}
                </div>
                <Button size="sm" disabled={busyId === refund.id} onClick={() => approveRefund(refund.id)}>
                  Approve refund
                </Button>
              </Card>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
