import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

export function SignUpPage() {
  const { signUp, configured } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signUp(email, password, fullName);
    setSubmitting(false);
    if (error) setError(error);
    else setDone(true);
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink dark:text-ink-dark">Check your email</h1>
        <p className="mt-2 text-ink-soft dark:text-ink-soft-dark">
          We've sent a confirmation link. Once verified, you can log in.
        </p>
        <Button className="mt-6" onClick={() => navigate("/login")}>Go to log in</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-ink dark:text-ink-dark">Create an account</h1>
      <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">Buy tickets, or apply to sell them.</p>

      {!configured && (
        <Card className="mt-4 border-rust/30 bg-rust/5 p-4 text-sm text-rust">
          Supabase isn't connected yet — accounts won't work until credentials are added to <code>.env</code>.
        </Card>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="fullName" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Full name</label>
          <Input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Email</label>
          <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Password</label>
          <Input id="password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-rust">{error}</p>}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-soft dark:text-ink-soft-dark">
        Already have an account? <Link to="/login" className="font-semibold text-saffron-text hover:underline dark:text-saffron">Log in</Link>
      </p>
    </div>
  );
}
