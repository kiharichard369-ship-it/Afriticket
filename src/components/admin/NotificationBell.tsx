// Save as: src/components/admin/NotificationBell.tsx
//
// A bell for staff. A pulsing red light with a count appears when something new
// needs attention (an event sent for verification, a new organiser application).
// Opening the bell lists the notifications; closing it marks them as seen.
// Updates arrive live through Supabase Realtime, with a 30-second poll as backup.
// What each person sees is decided by the database (staff_notifications.min_role).
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CalendarCheck, UserPlus } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../ui/Button";

interface StaffNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  entity_id: string | null;
  created_at: string;
  is_unread: boolean;
  is_pending: boolean;
}

// Section ids on the moderation page that each kind of notification points to.
const TARGET_ANCHOR: Record<string, string> = {
  event_review: "events-awaiting-review",
  organiser_application: "organiser-applications",
};

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export function NotificationBell({
  moderationPath,
  onNew,
}: {
  /** Route of the moderation page, used when the bell is shown on another page. */
  moderationPath?: string;
  /** Called when a new notification arrives, e.g. to refresh the queues on the page. */
  onNew?: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [canSee, setCanSee] = useState(false);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<StaffNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);
  const onNewRef = useRef(onNew);
  openRef.current = open;
  onNewRef.current = onNew;

  // Admins and moderators get a bell. (The database decides what each one receives.)
  useEffect(() => {
    if (!supabase || !user || user.is_anonymous) {
      setCanSee(false);
      return;
    }
    let cancelled = false;
    supabase
      .from("platform_staff")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setCanSee(data?.role === "admin" || data?.role === "moderator");
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const refreshCount = useCallback(async () => {
    if (!supabase) return;
    const { data, error: rpcError } = await supabase.rpc("staff_unread_notification_count");
    if (!rpcError && typeof data === "number") setUnread(data);
  }, []);

  const loadList = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc("list_staff_notifications", { p_limit: 30 });
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setError(null);
    setItems((data ?? []) as StaffNotification[]);
  }, []);

  const markSeen = useCallback(async () => {
    if (!supabase) return;
    setUnread(0);
    await supabase.rpc("mark_staff_notifications_seen");
  }, []);

  // Live updates + a slow poll as a safety net.
  useEffect(() => {
    if (!canSee || !supabase) return;
    const db = supabase;
    void refreshCount();
    const poll = window.setInterval(() => void refreshCount(), 30_000);
    const channel = db
      .channel("staff-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "staff_notifications" }, () => {
        void refreshCount();
        if (openRef.current) void loadList();
        onNewRef.current?.();
        // Lets pages such as the moderation queue refresh themselves.
        window.dispatchEvent(new CustomEvent("afriticket:staff-notification"));
      })
      .subscribe();
    return () => {
      window.clearInterval(poll);
      void db.removeChannel(channel);
    };
  }, [canSee, refreshCount, loadList]);

  const closePanel = useCallback(() => {
    setOpen(false);
    void markSeen();
  }, [markSeen]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) closePanel();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closePanel();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, closePanel]);

  function toggle() {
    if (open) {
      closePanel();
    } else {
      setOpen(true);
      void loadList();
    }
  }

  function openItem(item: StaffNotification) {
    const anchor = TARGET_ANCHOR[item.kind];
    closePanel();
    if (!anchor) return;
    const target = document.getElementById(anchor);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    else if (moderationPath) navigate(`${moderationPath}#${anchor}`);
  }

  if (!canSee) return null;

  const waitingEvents = items.filter((item) => item.kind === "event_review" && item.is_pending).length;
  const waitingApplications = items.filter((item) => item.kind === "organiser_application" && item.is_pending).length;

  return (
    // Static on phones so the panel can span the header; relative from sm up.
    <div ref={rootRef} className="sm:relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread > 0 ? `Notifications, ${unread} new` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative rounded-md p-2 text-ink-soft hover:bg-ink/5 dark:text-ink-soft-dark dark:hover:bg-white/10"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unread > 0 && (
          <span className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem]" aria-hidden="true">
            <span className="absolute inset-0 animate-ping rounded-full bg-rust opacity-60" />
            <span className="relative flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rust px-1 text-[10px] font-bold leading-none text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute inset-x-4 top-full z-50 mt-2 rounded-xl border border-border-warm bg-paper-raised p-2 shadow-lg dark:border-border-dark dark:bg-surface-dark sm:inset-x-auto sm:right-0 sm:w-96"
        >
          <div className="flex items-start justify-between gap-2 px-3 py-2">
            <div>
              <p className="font-display text-base font-semibold text-ink dark:text-ink-dark">Notifications</p>
              {(waitingEvents > 0 || waitingApplications > 0) && (
                <p className="text-xs text-ink-soft dark:text-ink-soft-dark">
                  Waiting for you: {waitingEvents} event{waitingEvents === 1 ? "" : "s"} · {waitingApplications} application{waitingApplications === 1 ? "" : "s"}
                </p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={closePanel}>
              Mark all read
            </Button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {error ? (
              <p role="alert" className="px-3 py-4 text-sm text-rust">{error}</p>
            ) : loading && items.length === 0 ? (
              <p className="px-3 py-4 text-sm text-ink-soft dark:text-ink-soft-dark">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-ink-soft dark:text-ink-soft-dark">No notifications yet.</p>
            ) : (
              <ul className="space-y-1">
                {items.map((item) => {
                  const Icon = item.kind === "organiser_application" ? UserPlus : CalendarCheck;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => openItem(item)}
                        className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-ink/5 ${item.is_pending ? "" : "opacity-60"}`}
                      >
                        <span className="mt-0.5 rounded-full bg-saffron/15 p-1.5 text-saffron-text dark:text-saffron">
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-ink dark:text-ink-dark">{item.title}</span>
                            {item.is_unread && <span className="h-2 w-2 shrink-0 rounded-full bg-rust" aria-label="New" />}
                          </span>
                          {item.body && <span className="block text-xs text-ink-soft dark:text-ink-soft-dark">{item.body}</span>}
                          <span className="mt-0.5 block text-[11px] text-ink-faint">
                            {timeAgo(item.created_at)}
                            {!item.is_pending && " · handled"}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}