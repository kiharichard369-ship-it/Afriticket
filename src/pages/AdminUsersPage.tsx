// Save as: src/pages/AdminUsersPage.tsx
//
// Support / moderator: read-only list of every account.
// Admin: the same list, plus changing staff roles and adding another admin.
// The page hides controls for convenience, but the real protection is in the
// database: list_users needs support+, grant/revoke_platform_role need admin.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";

type PlatformRole = "support" | "moderator" | "admin";
type Tone = "saffron" | "sage" | "rust" | "neutral";

interface UserRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  status: string | null;
  email_confirmed: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  platform_role: PlatformRole | null;
  organisation_roles: string[] | null;
  total_count: number | string;
}

interface AuditRow {
  id: string;
  actor_email: string | null;
  action: string;
  target_email: string | null;
  metadata: { role?: string; previous_role?: string | null } | null;
  created_at: string;
}

const PAGE_SIZE = 25;
const ROLE_TONE: Record<PlatformRole, Tone> = { admin: "rust", moderator: "saffron", support: "sage" };
const STATUS_TONE: Record<string, Tone> = { active: "sage", suspended: "rust", deleted: "neutral" };

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleDateString("en-KE", { dateStyle: "medium" }) : "—");

export function AdminUsersPage() {
  const { user } = useAuth();
  const [myRole, setMyRole] = useState<PlatformRole | null | undefined>(undefined); // undefined = still checking
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<PlatformRole>("admin");
  const [granting, setGranting] = useState(false);
  const [audit, setAudit] = useState<AuditRow[]>([]);

  const isAdmin = myRole === "admin";

  // Who am I? (platform_staff lets every user read their own row.)
  useEffect(() => {
    if (!supabase || !user || user.is_anonymous) {
      setMyRole(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("platform_staff")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setMyRole((data?.role as PlatformRole | undefined) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadUsers = useCallback(async () => {
    if (!supabase || !myRole) return;
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc("list_users", {
      p_search: debouncedSearch || null,
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    });
    if (rpcError) {
      setError(rpcError.message);
    } else {
      const list = (data ?? []) as UserRow[];
      setRows(list);
      setTotal(Number(list[0]?.total_count ?? 0));
      setError(null);
    }
    setLoading(false);
  }, [myRole, debouncedSearch, page]);

  const loadAudit = useCallback(async () => {
    if (!supabase || myRole !== "admin") return;
    const { data } = await supabase.rpc("list_platform_role_audit", { p_limit: 10 });
    setAudit((data ?? []) as AuditRow[]);
  }, [myRole]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);
  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  async function changeRole(row: UserRow, next: PlatformRole | "none") {
    if (!supabase || !row.email) return;
    const from = row.platform_role ?? "no staff role";
    const to = next === "none" ? "no staff role" : next;
    if (from === to) return;
    if (!window.confirm(`Change ${row.email} from "${from}" to "${to}"?`)) return;

    setBusyId(row.user_id);
    setError(null);
    setNotice(null);
    const { error: rpcError } =
      next === "none"
        ? await supabase.rpc("revoke_platform_role", { p_user_id: row.user_id })
        : await supabase.rpc("grant_platform_role", { p_email: row.email, p_role: next });
    setBusyId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setNotice(`${row.email} is now: ${to}.`);
    await Promise.all([loadUsers(), loadAudit()]);
  }

  async function grantByEmail() {
    if (!supabase || !newEmail.trim()) return;
    if (!window.confirm(`Give ${newEmail.trim()} the "${newRole}" role?`)) return;
    setGranting(true);
    setError(null);
    setNotice(null);
    const { error: rpcError } = await supabase.rpc("grant_platform_role", { p_email: newEmail.trim(), p_role: newRole });
    setGranting(false);
    if (rpcError) {
      setError(
        rpcError.message.includes("no account found")
          ? "No account uses that email. Ask the person to sign up and confirm their email first."
          : rpcError.message,
      );
      return;
    }
    setNotice(`${newEmail.trim()} is now: ${newRole}.`);
    setNewEmail("");
    await Promise.all([loadUsers(), loadAudit()]);
  }

  if (myRole === undefined) {
    return <p className="mx-auto max-w-5xl px-6 py-10 text-ink-soft dark:text-ink-soft-dark">Checking access…</p>;
  }
  if (myRole === null) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink dark:text-ink-dark">Not available</h1>
        <p className="mt-2 text-ink-soft dark:text-ink-soft-dark">This page is for Afriticket staff.</p>
      </div>
    );
  }

  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold text-ink dark:text-ink-dark">Users</h1>
        <Badge tone={ROLE_TONE[myRole]}>You: {myRole}</Badge>
      </div>
      <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">
        {isAdmin
          ? "You can view every account and change staff roles."
          : "View only. You can see every account but cannot change anything."}
      </p>

      {isAdmin && (
        <Card className="mt-6 p-5">
          <h2 className="font-semibold text-ink dark:text-ink-dark">Add staff or another admin</h2>
          <p className="mt-1 text-xs text-ink-soft dark:text-ink-soft-dark">
            The person needs an Afriticket account with a confirmed email.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              aria-label="Email of the account"
              placeholder="person@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
            <Select aria-label="Role to give" value={newRole} onChange={(e) => setNewRole(e.target.value as PlatformRole)}>
              <option value="admin">Admin</option>
              <option value="moderator">Moderator</option>
              <option value="support">Support (view only)</option>
            </Select>
            <Button disabled={granting || !newEmail.trim()} onClick={grantByEmail}>
              {granting ? "Saving…" : "Give role"}
            </Button>
          </div>
        </Card>
      )}

      <div className="mt-6">
        <Input
          aria-label="Search users"
          placeholder="Search by name, email or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-rust">{error}</p>}
      {notice && <p role="status" className="mt-3 text-sm text-sage">{notice}</p>}

      <Card className="mt-4 overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border-warm text-xs uppercase text-ink-faint dark:border-border-dark">
            <tr>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Joined / last seen</th>
              <th className="px-4 py-3">Organiser roles</th>
              <th className="px-4 py-3">Staff role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-warm dark:divide-border-dark">
            {rows.map((row) => {
              const isSelf = row.user_id === user?.id;
              const cannotEdit = isSelf || !row.email_confirmed || !row.email;
              const reason = isSelf
                ? "You can't change your own role"
                : !row.email_confirmed
                  ? "This account hasn't confirmed its email"
                  : undefined;
              return (
                <tr key={row.user_id} className="align-top text-ink dark:text-ink-dark">
                  <td className="px-4 py-3">
                    <p className="font-medium">{row.full_name || "No name"}</p>
                    <p className="break-all text-xs text-ink-soft dark:text-ink-soft-dark">{row.email ?? "No email"}</p>
                    <p className="text-xs text-ink-faint">{row.phone ?? "No phone"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[row.status ?? ""] ?? "neutral"}>{row.status ?? "unknown"}</Badge>
                    {!row.email_confirmed && <p className="mt-1 text-xs text-ink-faint">email not confirmed</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-soft dark:text-ink-soft-dark">
                    <p>Joined {formatDate(row.created_at)}</p>
                    <p>Last seen {formatDate(row.last_sign_in_at)}</p>
                  </td>
                  <td className="px-4 py-3">
                    {row.organisation_roles && row.organisation_roles.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {row.organisation_roles.map((role) => (
                          <Badge key={role} tone="neutral">{role}</Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-ink-faint">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin ? (
                      <Select
                        aria-label={`Staff role for ${row.email ?? "this account"}`}
                        value={row.platform_role ?? "none"}
                        disabled={cannotEdit || busyId === row.user_id}
                        title={reason}
                        onChange={(e) => void changeRole(row, e.target.value as PlatformRole | "none")}
                      >
                        <option value="none">No staff role</option>
                        <option value="support">Support (view only)</option>
                        <option value="moderator">Moderator</option>
                        <option value="admin">Admin</option>
                      </Select>
                    ) : row.platform_role ? (
                      <Badge tone={ROLE_TONE[row.platform_role]}>{row.platform_role}</Badge>
                    ) : (
                      <span className="text-xs text-ink-faint">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-soft dark:text-ink-soft-dark">
                  No accounts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <div className="mt-3 flex items-center justify-between text-sm text-ink-soft dark:text-ink-soft-dark">
        <span>{loading ? "Loading…" : `${total} account${total === 1 ? "" : "s"}`}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            Previous
          </Button>
          <span>Page {page + 1} of {lastPage + 1}</span>
          <Button variant="outline" size="sm" disabled={page >= lastPage || loading} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>

      {isAdmin && audit.length > 0 && (
        <Card className="mt-8 p-5">
          <h2 className="font-semibold text-ink dark:text-ink-dark">Recent role changes</h2>
          <ul className="mt-3 divide-y divide-border-warm text-sm dark:divide-border-dark">
            {audit.map((entry) => (
              <li key={entry.id} className="py-2 text-ink dark:text-ink-dark">
                <span className="font-medium">{entry.actor_email ?? "Someone"}</span>{" "}
                {entry.action === "revoke_platform_role"
                  ? `removed the ${entry.metadata?.role ?? "staff"} role from`
                  : `set ${entry.metadata?.role ?? "a role"} for`}{" "}
                <span className="font-medium">{entry.target_email ?? "an account"}</span>
                <span className="ml-2 text-xs text-ink-faint">{formatDate(entry.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}