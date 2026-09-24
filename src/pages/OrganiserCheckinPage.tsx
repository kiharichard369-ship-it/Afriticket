import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

interface ScanLogEntry {
  code: string;
  result: string;
  at: Date;
}

const RESULT_LABEL: Record<string, string> = {
  valid: "Valid — admitted",
  already_used: "Already used",
  cancelled: "Ticket cancelled",
  refunded: "Ticket refunded",
  wrong_event: "Wrong event",
  expired: "Expired hold",
  not_found: "Code not found",
};

export function OrganiserCheckinPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [code, setCode] = useState("");
  const [log, setLog] = useState<ScanLogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !eventId || !code.trim()) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("check_in_ticket", { p_public_code: code.trim(), p_event_id: eventId });
    setBusy(false);
    if (error) {
      setError(error.message);
    } else {
      setLog((prev) => [{ code: code.trim(), result: data as string, at: new Date() }, ...prev].slice(0, 20));
    }
    setCode("");
    inputRef.current?.focus();
  }

  const latest = log[0];

  return (
    <div className="mx-auto max-w-lg px-6 py-10">
      <h1 className="font-display text-3xl font-semibold text-ink dark:text-ink-dark">Check-in</h1>
      <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">
        Manual code entry for now — camera-based QR scanning is a natural next addition (the browser's
        BarcodeDetector API or a library like @zxing/browser would slot in here without changing the
        backend, since <code>check_in_ticket</code> only needs the decoded code string).
      </p>

      <form onSubmit={submit} className="mt-6 flex gap-2">
        <Input
          ref={inputRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Scan or type the ticket code"
          autoComplete="off"
        />
        <Button type="submit" disabled={busy || !code.trim()}>Check in</Button>
      </form>
      {error && <p role="alert" className="mt-2 text-sm text-rust">{error}</p>}

      {latest && (
        <Card className={`mt-6 flex items-center gap-3 p-4 ${latest.result === "valid" ? "border-sage/40 bg-sage/10" : "border-rust/40 bg-rust/10"}`}>
          {latest.result === "valid" ? (
            <CheckCircle2 className="h-8 w-8 shrink-0 text-sage" />
          ) : (
            <XCircle className="h-8 w-8 shrink-0 text-rust" />
          )}
          <div>
            <p className="font-semibold text-ink dark:text-ink-dark">{RESULT_LABEL[latest.result] ?? latest.result}</p>
            <p className="text-xs text-ink-faint">{latest.code}</p>
          </div>
        </Card>
      )}

      {log.length > 1 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-ink-soft dark:text-ink-soft-dark">Recent scans</h2>
          <ul className="mt-2 divide-y divide-border-warm text-sm dark:divide-border-dark">
            {log.slice(1).map((entry, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <span className="font-mono text-xs text-ink-faint">{entry.code}</span>
                <span className={entry.result === "valid" ? "text-sage" : "text-rust"}>{RESULT_LABEL[entry.result] ?? entry.result}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
