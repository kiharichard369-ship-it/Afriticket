// Save as: src/components/admin/NotificationBell.tsx
//
// One bell for everyone who works with the platform:
//   * admins     system alerts + messages, and a "Send message" tab
//   * support / moderators   messages sent to staff
//   * organisers             messages sent to organisers, and notices about their events
// Customers (and people with no role) get no bell at all.
// The pulsing red light shows when something new has arrived. Opening the bell lists
// everything; closing it marks it as seen. Updates arrive live, with a 30-second backup poll.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CalendarCheck, Megaphone, Trash2, UserPlus } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";

interface InboxItem {
  id: string;
  source: "alert" | "message";
  kind: string;
  title: string;
  body: string | null;
  entity_id: string | null;
  created_at: string;
  is_unread: boolean;
  is_pending: boolean;
}

interface SentMessage {
  id: string;
  audience: string;
  title: string;
  created_at: string;
}

// Where clicking a notification takes you.
const TARGETS: Record<string, { anchor?: string; path?: string }> = {
  event_review: { anchor: "events-awaiting-review" },
  organiser_application: { anchor: "organiser-applications" },
  event_cleanup_appeal: { anchor: "event-cleanup" },
  event_cleanup: { path: "/organiser/dashboard" },
  event_cleanup_decision: { path: "/organiser/dashboard" },
};

const AUDIENCE_LABEL: Record<string, string> = { organisers: "All organisers", staff: "All staff" };

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

function iconFor(kind: string) {
  if (kind === "organiser_application") return UserPlus;
  if (kind === "admin_message") return Megaphone;
  if (kind.startsWith("event_cleanup")) return Trash2;
  return CalendarCheck;
}

export function NotificationBell({
  moderationPath,
  onNew,
}: {
  /** Route of the moderation page, used when an admin alert is clicked on another page. */
  moderationPath?: string;
  /** Called when a new admin alert arrives. */
  onNew?: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [access, setAccess] = useState<string[] | null>(null);
  // true when the latest database update is missing: the bell then works as the earlier admin-only bell.
  const [legacy, setLegacy] = useState(false);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"inbox" | "compose">("inbox");
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Composer (admins)
  const [audience, setAudience] = useState<"organisers" | "staff">("organisers");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [sent, setSent] = useState<SentMessage[]>([]);

  const rootRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);
  const onNewRef = useRef(onNew);
  const legacyRef = useRef(false);
  openRef.current = open;
  legacyRef.current = legacy;
  onNewRef.current = onNew;

  const hasBell = Boolean(access && access.length > 0);
  const isAdmin = Boolean(access?.includes("admin"));
  const userId = user && !user.is_anonymous ? user.id : null;

  // Does this person get a bell?
  useEffect(() => {
    if (!supabase || !userId) {
      setAccess(null);
      return;
    }
    const db = supabase;
    let cancelled = false;
    db.rpc("inbox_access").then(async ({ data, error: rpcError }) => {
      if (cancelled) return;
      if (!rpcError && Array.isArray(data)) {
        setLegacy(false);
        setAccess(data as string[]);
        return;
      }
      // The new database functions are missing (or failed to install). Don't lose the bell:
      // admins fall back to the earlier admin-only version.
      console.warn("inbox_access failed, using the admin-only bell:", rpcError?.message);
      const { data: staff } = await db.from("platform_staff").select("role").eq("user_id", userId).maybeSingle();
      if (cancelled) return;
      setLegacy(true);
      setAccess(staff?.role === "admin" ? ["admin"] : []);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const refreshCount = useCallback(async () => {
    if (!supabase) return;
    const { data, error: rpcError } = await supabase.rpc(legacyRef.current ? "staff_unread_notification_count" : "inbox_unread_count");
    if (!rpcError && typeof data === "number") setUnread(data);
  }, []);

  const loadList = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc(legacyRef.current ? "list_staff_notifications" : "list_inbox", { p_limit: 30 });
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setError(null);
    setItems(((data ?? []) as Array<Omit<InboxItem, "source">>).map((row) => ({ ...row, source: "alert" as const })) as InboxItem[]);
  }, []);

  const loadSent = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.rpc("list_sent_broadcasts", { p_limit: 5 });
    setSent((data ?? []) as SentMessage[]);
  }, []);

  const markSeen = useCallback(async () => {
    if (!supabase) return;
    setUnread(0);
    await supabase.rpc(legacyRef.current ? "mark_staff_notifications_seen" : "mark_inbox_seen");
  }, []);

  // Live updates + a slow poll as a safety net.
  useEffect(() => {
    if (!hasBell || !supabase) return;
    const db = supabase;
    void refreshCount();
    const poll = window.setInterval(() => void refreshCount(), 30_000);
    let channel = db
      .channel("inbox-bell")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "staff_notifications" }, () => {
        void refreshCount();
        if (openRef.current) void loadList();
        onNewRef.current?.();
        // Lets pages such as the moderation queue refresh themselves.
        window.dispatchEvent(new CustomEvent("afriticket:staff-notification"));
      });
    if (!legacy) {
      channel = channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "inbox_messages" }, () => {
        void refreshCount();
        if (openRef.current) void loadList();
      });
    }
    channel.subscribe();
    return () => {
      window.clearInterval(poll);
      void db.removeChannel(channel);
    };
  }, [hasBell, legacy, refreshCount, loadList]);

  const closePanel = useCallback(() => {
    setOpen(false);
    void markSeen();
  }, [markSeen]);

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
      setTab("inbox");
      void loadList();
    }
  }

  function openItem(item: InboxItem) {
    const target = TARGETS[item.kind];
    closePanel();
    if (!target) return;
    if (target.path) {
      navigate(target.path);
      return;
    }
    if (target.anchor) {
      const element = document.getElementById(target.anchor);
      if (element) element.scrollIntoView({ behavior: "smooth", block: "start" });
      else if (moderationPath) navigate(`${moderationPath}#${target.anchor}`);
    }
  }

  async function sendMessage() {
    if (!supabase) return;
    const who = audience === "staff" ? "all staff (support, moderators and admins)" : "all organisers";
    if (!window.confirm(`Send this message to ${who}?`)) return;
    setSending(true);
    setSendError(null);
    setSendResult(null);
    const { data, error: rpcError } = await supabase.rpc("send_broadcast_message", {
      p_audience: audience,
      p_title: title.trim(),
      p_body: body.trim() || null,
    });
    setSending(false);
    if (rpcError) {
      setSendError(rpcError.message);
      return;
    }
    const count = Number(data ?? 0);
    setSendResult(`Sent to ${count} ${count === 1 ? "person" : "people"}.`);
    setTitle("");
    setBody("");
    void loadSent();
  }

  if (!hasBell) return null;

  const waitingEvents = items.filter((item) => item.kind === "event_review" && item.is_pending).length;
  const waitingApplications = items.filter((item) => item.kind === "organiser_application" && item.is_pending).length;
  const waitingAppeals = items.filter((item) => item.kind === "event_cleanup_appeal" && item.is_pending).length;
  const waiting = [
    waitingEvents > 0 ? `${waitingEvents} event${waitingEvents === 1 ? "" : "s"}` : null,
    waitingApplications > 0 ? `${waitingApplications} application${waitingApplications === 1 ? "" : "s"}` : null,
    waitingAppeals > 0 ? `${waitingAppeals} appeal${waitingAppeals === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

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
          {isAdmin && !legacy && (
            <div className="mb-1 flex gap-1 px-1">
              {(["inbox", "compose"] as const).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setTab(name);
                    if (name === "compose") void loadSent();
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    tab === name ? "bg-saffron/15 text-saffron-text dark:text-saffron" : "text-ink-soft hover:bg-ink/5 dark:text-ink-soft-dark"
                  }`}
                >
                  {name === "inbox" ? "Notifications" : "Send message"}
                </button>
              ))}
            </div>
          )}

          {tab === "inbox" ? (
            <>
              <div className="flex items-start justify-between gap-2 px-3 py-2">
                <div>
                  <p className="font-display text-base font-semibold text-ink dark:text-ink-dark">Notifications</p>
                  {waiting.length > 0 && (
                    <p className="text-xs text-ink-soft dark:text-ink-soft-dark">Waiting for you: {waiting.join(" · ")}</p>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={closePanel}>Mark all read</Button>
              </div>
              {legacy && isAdmin && (
                <p className="mx-3 mb-2 rounded-md bg-saffron/10 px-2 py-1.5 text-xs text-ink-soft dark:text-ink-soft-dark">
                  Messaging and event clean-up notices need the latest database update (event_cleanup_and_inbox.sql). Showing admin alerts only.
                </p>
              )}
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
                      const Icon = iconFor(item.kind);
                      return (
                        <li key={`${item.source}-${item.id}`}>
                          <button
                            type="button"
                            onClick={() => openItem(item)}
                            className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-ink/5 ${item.is_pending || item.source === "message" ? "" : "opacity-60"}`}
                          >
                            <span className="mt-0.5 rounded-full bg-saffron/15 p-1.5 text-saffron-text dark:text-saffron">
                              <Icon className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="truncate text-sm font-medium text-ink dark:text-ink-dark">{item.title}</span>
                                {item.is_unread && <span className="h-2 w-2 shrink-0 rounded-full bg-rust" aria-label="New" />}
                              </span>
                              {item.body && <span className="block whitespace-pre-line text-xs text-ink-soft dark:text-ink-soft-dark">{item.body}</span>}
                              <span className="mt-0.5 block text-[11px] text-ink-faint">
                                {item.kind === "admin_message" ? "Afriticket team · " : ""}
                                {timeAgo(item.created_at)}
                                {item.source === "alert" && !item.is_pending && " · handled"}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-3 px-3 py-2">
              <p className="font-display text-base font-semibold text-ink dark:text-ink-dark">Send a message</p>
              <div>
                <label htmlFor="bell-audience" className="mb-1 block text-xs font-medium text-ink-soft dark:text-ink-soft-dark">Send to</label>
                <Select id="bell-audience" value={audience} onChange={(e) => setAudience(e.target.value as "organisers" | "staff")}>
                  <option value="organisers">All organisers</option>
                  <option value="staff">All staff (support, moderators, admins)</option>
                </Select>
              </div>
              <div>
                <label htmlFor="bell-title" className="mb-1 block text-xs font-medium text-ink-soft dark:text-ink-soft-dark">Title</label>
                <Input id="bell-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Scheduled maintenance on Sunday" />
              </div>
              <div>
                <label htmlFor="bell-body" className="mb-1 block text-xs font-medium text-ink-soft dark:text-ink-soft-dark">Message (optional)</label>
                <textarea
                  id="bell-body"
                  rows={4}
                  maxLength={2000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full rounded-lg border border-border-warm bg-paper-raised px-3 py-2 text-sm text-ink focus:border-saffron-dark dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark"
                />
              </div>
              {sendError && <p role="alert" className="text-sm text-rust">{sendError}</p>}
              {sendResult && <p role="status" className="text-sm text-sage">{sendResult}</p>}
              <Button className="w-full" disabled={sending || !title.trim()} onClick={sendMessage}>
                {sending ? "Sending…" : "Send message"}
              </Button>
              {sent.length > 0 && (
                <div className="border-t border-border-warm pt-2 dark:border-border-dark">
                  <p className="text-xs font-medium text-ink-soft dark:text-ink-soft-dark">Recently sent</p>
                  <ul className="mt-1 space-y-1">
                    {sent.map((message) => (
                      <li key={message.id} className="text-xs text-ink dark:text-ink-dark">
                        <span className="font-medium">{message.title}</span>
                        <span className="text-ink-faint"> · {AUDIENCE_LABEL[message.audience] ?? message.audience} · {timeAgo(message.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}