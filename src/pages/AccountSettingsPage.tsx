import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

export function AccountSettingsPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center text-ink-soft dark:text-ink-soft-dark">
        Log in to manage your account.
      </div>
    );
  }

  async function exportData() {
    if (!supabase) return;
    setExporting(true);
    const { data, error } = await supabase.rpc("export_my_data");
    setExporting(false);
    if (error) {
      alert(error.message);
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ticketyangu-my-data.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAccount() {
    if (!supabase) return;
    if (!window.confirm("This clears your name and phone number and signs you out. Past orders are kept (without your contact details) for accounting records. Continue?")) return;
    setDeleting(true);
    setDeleteError(null);
    const { error } = await supabase.rpc("request_account_deletion");
    setDeleting(false);
    if (error) {
      setDeleteError(error.message);
      return;
    }
    await signOut();
    navigate("/");
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-10">
      <h1 className="font-display text-3xl font-semibold text-ink dark:text-ink-dark">Account settings</h1>
      <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">Signed in as {user.email}</p>

      <Card className="mt-6 space-y-3 p-5">
        <h2 className="font-display text-lg text-ink dark:text-ink-dark">Export your data</h2>
        <p className="text-sm text-ink-soft dark:text-ink-soft-dark">
          Download a JSON file with your profile, orders, tickets, and organisation memberships.
        </p>
        <Button variant="outline" disabled={exporting} onClick={exportData}>
          {exporting ? "Preparing…" : "Download my data"}
        </Button>
      </Card>

      <Card className="mt-6 space-y-3 border-rust/30 bg-rust/5 p-5">
        <h2 className="font-display text-lg text-rust">Delete account</h2>
        <p className="text-sm text-ink-soft dark:text-ink-soft-dark">
          Clears your name and phone number and signs you out. Past order records are kept without your
          contact details, for accounting purposes. Organisation owners need to transfer or close their
          organisation first — contact support.
        </p>
        {deleteError && <p role="alert" className="text-sm text-rust">{deleteError}</p>}
        <Button variant="outline" className="border-rust text-rust hover:bg-rust/10" disabled={deleting} onClick={deleteAccount}>
          {deleting ? "Deleting…" : "Delete my account"}
        </Button>
      </Card>
    </div>
  );
}
