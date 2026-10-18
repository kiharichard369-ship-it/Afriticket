// Save as: src/pages/ForgotPasswordPage.tsx   (route: /forgot-password)
//
// Asks for an email and sends a reset LINK (never the password itself: passwords are
// stored scrambled and can't be read back). The answer is the same whether or not an
// account exists, so the page can't be used to find out who has an account.
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";

const COOLDOWN_SECONDS = 60;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordPage() {
  const location = useLocation();
  // The login page can pass along the email already typed there.
  const prefill = (location.state as { email?: string } | null)?.email ?? "";
  const [email, setEmail] = useState(prefill);
  const [sent, setSent] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function sendLink() {
    if (!supabase || cooldown > 0) return;
    const address = email.trim();
    if (!EMAIL_PATTERN.test(address)) {
      setError("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);

    if (resetError) {
      if (/second|rate|too many|limit/i.test(resetError.message)) {
        setError("Please wait a minute before asking for another email.");
        setCooldown(COOLDOWN_SECONDS);
        return;
      }
      if ((resetError.status ?? 0) >= 500) {
        console.warn("password reset email failed:", resetError.message);
        setError("We couldn't send the email right now. Please try again in a few minutes.");
        return;
      }
      console.warn("password reset request:", resetError.message);
    }
    // Same message whether or not the address has an account.
    setSentTo(address);
    setSent(true);
    setCooldown(COOLDOWN_SECONDS);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    void sendLink();
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16">
        <h1 className="font-display text-3xl font-semibold text-ink dark:text-ink-dark">Check your email</h1>
        <p className="mt-3 text-ink-soft dark:text-ink-soft-dark">
          If an account exists for <strong className="text-ink dark:text-ink-dark">{sentTo}</strong>, we've sent a link to choose a new password.
          The link works once and expires in 1 hour. If you don't see it, check your spam folder.
        </p>
        {error && <p role="alert" className="mt-3 text-sm text-rust">{error}</p>}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button variant="outline" disabled={cooldown > 0 || submitting} onClick={() => void sendLink()}>
            {cooldown > 0 ? `Send again in ${cooldown}s` : submitting ? "Sending…" : "Send again"}
          </Button>
          <Link to="/login" className="text-sm underline">Back to log in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-ink dark:text-ink-dark">Forgot your password?</h1>
      <p className="mt-2 text-ink-soft dark:text-ink-soft-dark">
        Enter the email you signed up with and we'll send you a link to choose a new password.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="forgot-email" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Email</label>
          <Input id="forgot-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-rust">{error}</p>}
        <Button type="submit" className="w-full" disabled={submitting || cooldown > 0 || !email.trim()}>
          {submitting ? "Sending…" : cooldown > 0 ? `Wait ${cooldown}s` : "Email me a reset link"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-soft dark:text-ink-soft-dark">
        Remembered it? <Link to="/login" className="underline">Back to log in</Link>
      </p>
    </div>
  );
}