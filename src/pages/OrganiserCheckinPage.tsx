import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { BrowserQRCodeReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { Camera, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

interface ScanLogEntry {
  code: string;
  result: string;
  at: Date;
}

type ScannerState = "idle" | "starting" | "active" | "error";

const RESULT_LABEL: Record<string, string> = {
  valid: "Valid — admitted",
  already_used: "Already used",
  cancelled: "Ticket cancelled",
  refunded: "Ticket refunded",
  wrong_event: "Wrong event",
  expired: "Expired hold",
  not_found: "Code not found",
};

const SCAN_DEDUPLICATION_WINDOW_MS = 3_000;

function cameraSupportMessage(): string | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "Camera scanning is not available in this browser. Use manual code entry instead.";
  }
  if (!window.isSecureContext) {
    return "Camera access requires HTTPS (or localhost). Use manual code entry on this connection.";
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return "This browser does not support camera access. Use manual code entry instead.";
  }
  return null;
}

function cameraErrorMessage(error: unknown): string {
  const name =
    error && typeof error === "object" && "name" in error && typeof error.name === "string"
      ? error.name
      : "";

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera permission was denied. Allow camera access in your browser settings, then try again, or use manual code entry.";
    case "NotFoundError":
      return "No camera was found on this device. Use manual code entry instead.";
    case "NotReadableError":
      return "The camera is already in use or could not be read. Close other camera apps and try again, or use manual code entry.";
    case "OverconstrainedError":
      return "This camera does not support the requested setting. Try again or use manual code entry.";
    default:
      return "The camera could not be started. Check your browser permissions and try again, or use manual code entry.";
  }
}

export function OrganiserCheckinPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [code, setCode] = useState("");
  const [log, setLog] = useState<ScanLogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannerState, setScannerState] = useState<ScannerState>("idle");
  const [scannerRequested, setScannerRequested] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scannerNotice, setScannerNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const busyRef = useRef(false);
  const recentScanRef = useRef<{ code: string; at: number } | null>(null);
  const processedScannerCodesRef = useRef(new Set<string>());

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Door staff scanning with the camera never touch the keyboard or mouse, so while the
  // camera is on, keep the idle-logout timer from signing them out mid-shift.
  useEffect(() => {
    if (scannerState !== "active") return undefined;
    const timer = window.setInterval(() => window.dispatchEvent(new Event("afriticket:activity")), 30_000);
    return () => window.clearInterval(timer);
  }, [scannerState]);

  const checkInCode = useCallback(
    async (rawCode: string, fromScanner = false) => {
      const trimmedCode = rawCode.trim();
      if (!trimmedCode) {
        if (fromScanner) {
          setScannerNotice("That QR code did not contain a ticket code. Try another code.");
        } else {
          setError("Enter or scan a ticket code.");
        }
        return;
      }

      if (busyRef.current) return;

      if (fromScanner) {
        if (processedScannerCodesRef.current.has(trimmedCode)) return;
        const recentScan = recentScanRef.current;
        const now = Date.now();
        if (recentScan && recentScan.code === trimmedCode && now - recentScan.at < SCAN_DEDUPLICATION_WINDOW_MS) {
          setScannerNotice("That code was just scanned; waiting for the result.");
          return;
        }
        recentScanRef.current = { code: trimmedCode, at: now };
        setScannerNotice("QR code detected. Checking ticket…");
      }

      if (!supabase || !eventId) {
        setError("Check-in is unavailable because the event or server is not configured.");
        return;
      }

      busyRef.current = true;
      setBusy(true);
      setError(null);
      window.dispatchEvent(new Event("afriticket:activity")); // a scan is activity

      try {
        const { data, error: rpcError } = await supabase.rpc("check_in_ticket", {
          p_public_code: trimmedCode,
          p_event_id: eventId,
        });

        if (rpcError) {
          setError(rpcError.message);
          if (fromScanner) setScannerNotice("The QR code was read, but check-in could not be completed.");
        } else {
          const result = typeof data === "string" ? data : String(data ?? "unknown");
          if (fromScanner) processedScannerCodesRef.current.add(trimmedCode);
          setLog((prev) => [{ code: trimmedCode, result, at: new Date() }, ...prev].slice(0, 20));
          if (fromScanner) setScannerNotice("Scan complete. Point the camera at the next ticket.");
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
        setCode("");
        inputRef.current?.focus();
      }
    },
    [eventId]
  );

  useEffect(() => {
    if (!scannerRequested) return undefined;

    const unsupportedMessage = cameraSupportMessage();
    if (unsupportedMessage) {
      setScannerState("error");
      setScannerError(unsupportedMessage);
      setScannerRequested(false);
      return undefined;
    }

    let cancelled = false;
    const reader = new BrowserQRCodeReader();
    readerRef.current = reader;
    setScannerState("starting");
    setScannerError(null);
    setScannerNotice("Requesting camera access…");

    async function startDecoding() {
      try {
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: { facingMode: { ideal: "environment" } },
          },
          videoRef.current ?? undefined,
          (result, _decodeError, callbackControls) => {
            if (cancelled || !result) return;
            controlsRef.current ??= callbackControls;
            void checkInCode(result.getText(), true);
          }
        );

        if (cancelled) {
          controls.stop();
          BrowserQRCodeReader.releaseAllStreams();
          return;
        }

        controlsRef.current = controls;
        setScannerState("active");
        setScannerNotice("Camera is active. Point it at a ticket QR code.");
      } catch (startError) {
        if (cancelled) return;
        setScannerState("error");
        setScannerError(cameraErrorMessage(startError));
        setScannerNotice(null);
        setScannerRequested(false);
      }
    }

    void startDecoding();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      BrowserQRCodeReader.releaseAllStreams();
      readerRef.current = null;
    };
  }, [checkInCode, scannerRequested]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void checkInCode(code);
  }

  function stopScanner() {
    processedScannerCodesRef.current.clear();
    setScannerRequested(false);
    setScannerState("idle");
    setScannerError(null);
    setScannerNotice(null);
  }

  const latest = log[0];
  const scannerIsVisible = scannerRequested && (scannerState === "starting" || scannerState === "active");

  return (
    <div className="mx-auto max-w-lg px-6 py-10">
      <h1 className="font-display text-3xl font-semibold text-ink dark:text-ink-dark">Check-in</h1>
      <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">
        Scan a ticket QR code with your camera, or enter its code manually below. Camera scanning is optional;
        check-in uses the same secure server check for either method.
      </p>

      <Card className="mt-6 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-ink dark:text-ink-dark">Camera scanner</h2>
            <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">
              Use a well-lit QR code and keep it inside the camera frame.
            </p>
          </div>
          {scannerIsVisible ? (
            <Button type="button" variant="outline" size="sm" onClick={stopScanner}>
              Stop camera
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setScannerError(null);
                setScannerNotice(null);
                processedScannerCodesRef.current.clear();
                setScannerRequested(true);
              }}
            >
              <Camera aria-hidden="true" className="h-4 w-4" />
              {scannerState === "error" ? "Try camera again" : "Start camera"}
            </Button>
          )}
        </div>

        {scannerRequested && (
          <div className="mt-4 overflow-hidden rounded-lg bg-ink dark:bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              aria-label="Live camera preview for QR code scanning"
              className={`aspect-[4/3] w-full object-cover ${scannerIsVisible ? "" : "hidden"}`}
            />
            {!scannerIsVisible && <div className="p-6" aria-hidden="true" />}
          </div>
        )}

        <p aria-live="polite" className="mt-3 text-sm text-ink-soft dark:text-ink-soft-dark">
          {scannerState === "starting"
            ? "Requesting camera access…"
            : scannerState === "active"
              ? "Point the camera at a ticket QR code."
              : "Camera is off. Manual code entry is always available."}
        </p>
        {scannerError && (
          <p role="alert" className="mt-2 text-sm text-rust">
            {scannerError}
          </p>
        )}
        {scannerNotice && (
          <p aria-live="polite" className="mt-2 text-sm text-sage">
            {scannerNotice}
          </p>
        )}
      </Card>

      <h2 className="mt-8 text-sm font-semibold text-ink-soft dark:text-ink-soft-dark">Manual code entry</h2>
      <form onSubmit={submit} className="mt-2 flex gap-2">
        <Input
          ref={inputRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Scan or type the ticket code"
          autoComplete="off"
          aria-label="Ticket code"
        />
        <Button type="submit" disabled={busy || !code.trim()}>
          Check in
        </Button>
      </form>
      {error && <p role="alert" className="mt-2 text-sm text-rust">{error}</p>}

      {latest && (
        <Card
          className={`mt-6 flex items-center gap-3 p-4 ${
            latest.result === "valid" ? "border-sage/40 bg-sage/10" : "border-rust/40 bg-rust/10"
          }`}
        >
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
              <li key={`${entry.code}-${entry.at.getTime()}-${i}`} className="flex items-center justify-between gap-4 py-2">
                <span className="font-mono text-xs text-ink-faint">{entry.code}</span>
                <span className={entry.result === "valid" ? "text-sage" : "text-rust"}>
                  {RESULT_LABEL[entry.result] ?? entry.result}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}