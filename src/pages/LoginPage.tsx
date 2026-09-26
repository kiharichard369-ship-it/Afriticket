import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

export function LoginPage() {
  const { signIn, configured } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const explicitFrom = (location.state as { from?: string } | null)?.from;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signIn(email, password);
    if (error) {
      setError(error);
      setSubmitting(false);
      return;
    }

    // If the person got sent here for a specific reason (e.g. "log in to
    // apply", "log in to see my tickets"), always honor that — don't
    // second-guess it with a role-based redirect below.
    if (explicitFrom) {
      navigate(explicitFrom, { replace: true });
      return;
    }

    // Otherwise, take each role to the page they actually want: a Super
    // User to moderation, an organiser to their dashboard, everyone else
    // to the homepage. Queried directly here (rather than waiting on
    // useOrganisation/usePlatformStaff's own effects) so the redirect
    // happens in the same action as a successful login, not a beat later.
    let destination = "/";
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: staffRow } = await supabase.from("platform_staff").select("user_id").eq("user_id", user.id).maybeSingle();
        if (staffRow) {
          destination = "/admin/moderation";
        } else {
          const { data: memberRow } = await supabase.from("organisation_members").select("organisation_id").eq("user_id", user.id).maybeSingle();
          if (memberRow) destination = "/organiser/dashboard";
        }
      }
    }
    setSubmitting(false);
    navigate(destination, { replace: true });
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-ink dark:text-ink-dark">Log in</h1>
      <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">
        Buyers and organisers use the same account.
      </p>

      {!configured && (
        <Card className="mt-4 border-rust/30 bg-rust/5 p-4 text-sm text-rust">
          Supabase isn't connected yet — accounts won't work until credentials are added to <code>.env</code>.
        </Card>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Email</label>
          <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Password</label>
          <Input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-rust">{error}</p>}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Logging in…" : "Log in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-soft dark:text-ink-soft-dark">
        New here? <Link to="/signup" className="font-semibold text-saffron-text hover:underline dark:text-saffron">Create an account</Link>
      </p>
    </div>
  );
}
