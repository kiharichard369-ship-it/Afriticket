// Save as: src/pages/ResetPasswordPage.tsx   (route: /reset-password)
//
// Where the emailed link lands. Only works for someone who arrived through that link:
// the link signs them in briefly, which is what allows choosing a new password here.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { clearRecovery, recoveryPending } from "../lib/recoveryFlag";
import { useLandingPath } from "../hooks/useLandingPath";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { path: landing } = useLandingPath();
  const [state, setState] = useState<"checking" | "ready" | "invalid" | "done">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setState("invalid");
      return;
    }
    const db = supabase;
    let cancelled = false;
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && !cancelled) setState("ready");
    });
    // Give the client a moment to read the link, then decide.
    const timer = window.setTimeout(async () => {
      const { data } = await db.auth.getSession();
      if (cancelled) return;
      setState((current) => (current !== "checking" ? current : data.session && recoveryPending() ? "ready" : "invalid"));
    }, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (password !== confirm) return setError("The two passwords don't match.");

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setSaving(false);
      setError(updateError.message);
      return;
    }
    clearRecovery();
    // Anyone who had the old password and is signed in elsewhere is signed out.
    await supabase.auth.signOut({ scope: "others" });
    setSaving(false);
    setState("done");
  }

  if (state === "checking") {
    return <p className="mx-auto max-w-lg px-6 py-16 text-ink-soft dark:text-ink-soft-dark">Checking your reset link…</p>;
  }

  if (state === "invalid") {
    return (
      <div className="mx-auto max-w-lg px-6 py-16">
        <h1 className="font-display text-3xl font-semibold text-ink dark:text-ink-dark">This link has expired</h1>
        <p className="mt-3 text-ink-soft dark:text-ink-soft-dark">
          Reset links work once and last 1 hour. It may have been used already, or opened in a different browser. Request a new one and open it on this device.
        </p>
        <Link to="/forgot-password"><Button className="mt-6">Get a new link</Button></Link>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="mx-auto max-w-lg px-6 py-16">
        <h1 className="font-display text-3xl font-semibold text-ink dark:text-ink-dark">Password changed</h1>
        <p className="mt-3 text-ink-soft dark:text-ink-soft-dark">You're signed in with your new password. Any other devices have been signed out.</p>
        <Button className="mt-6" onClick={() => navigate(landing, { replace: true })}>Continue</Button>
      </div>
    );
  }

  const inputType = showPasswords ? "text" : "password";
  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-ink dark:text-ink-dark">Choose a new password</h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="reset-password" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">New password</label>
          <Input id="reset-password" type={inputType} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="mt-1 text-xs text-ink-faint">At least {MIN_PASSWORD_LENGTH} characters.</p>
        </div>
        <div>
          <label htmlFor="reset-confirm" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Confirm new password</label>
          <Input id="reset-confirm" type={inputType} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-soft dark:text-ink-soft-dark">
          <input type="checkbox" className="h-4 w-4 accent-saffron" checked={showPasswords} onChange={(e) => setShowPasswords(e.target.checked)} />
          Show passwords
        </label>
        {error && <p role="alert" className="text-sm text-rust">{error}</p>}
        <Button type="submit" className="w-full" disabled={saving || !password || !confirm}>
          {saving ? "Saving…" : "Change password"}
        </Button>
      </form>
    </div>
  );
}