import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { usePlatformRole } from "../../hooks/usePlatformRole";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";

const MINUTE = 60_000;
const MEMBER_LIMIT_MS = 30 * MINUTE; // customers and organisers
const STAFF_LIMIT_MS = 15 * MINUTE;  // admin, support, moderator
const WARNING_MS = 60_000;           // warn this long before logging out
const WRITE_THROTTLE_MS = 5_000;     // how often activity is recorded
const STORAGE_KEY = "afriticket.lastActivity";
const ACTIVITY_EVENTS = ["pointerdown", "mousemove", "keydown", "scroll", "wheel", "touchstart"] as const;

type Phase = "active" | "warning" | "expired";

function readLastActivity(fallback: number): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const value = raw ? Number(raw) : NaN;
    if (Number.isFinite(value)) return value;
  } catch {
    /* storage can be unavailable (private mode) */
  }
  return fallback;
}

export function IdleLogout() {
  const { user, signOut } = useAuth();
  const { role } = usePlatformRole();
  const navigate = useNavigate();

  const isMember = Boolean(user && !user.is_anonymous);
  const limitMs = role ? STAFF_LIMIT_MS : MEMBER_LIMIT_MS;

  const [phase, setPhase] = useState<Phase>("active");
  const [secondsLeft, setSecondsLeft] = useState(Math.round(WARNING_MS / 1000));
  const [expiredAfterMinutes, setExpiredAfterMinutes] = useState(Math.round(MEMBER_LIMIT_MS / MINUTE));

  // Refs so the timers always see current values without being restarted.
  const phaseRef = useRef<Phase>("active");
  const limitRef = useRef(limitMs);
  const signOutRef = useRef(signOut);
  const lastWriteRef = useRef(0);
  const memoryActivityRef = useRef(Date.now());
  const loggingOutRef = useRef(false);
  phaseRef.current = phase;
  limitRef.current = limitMs;
  signOutRef.current = signOut;

  const markActive = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastWriteRef.current < WRITE_THROTTLE_MS) return;
    lastWriteRef.current = now;
    memoryActivityRef.current = now;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(now));
    } catch {
      /* ignore */
    }
  }, []);

  const endSession = useCallback(async () => {
    try {
      // Local scope: only this device is signed out.
      if (supabase) await supabase.auth.signOut({ scope: "local" });
      else await signOutRef.current();
    } catch {
      /* the session is cleared on this device either way */
    }
  }, []);

  const logoutForInactivity = useCallback(async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    setExpiredAfterMinutes(Math.round(limitRef.current / MINUTE));
    setPhase("expired");
    await endSession();
    loggingOutRef.current = false;
  }, [endSession]);

  const stayLoggedIn = useCallback(() => {
    markActive(true);
    setPhase("active");
  }, [markActive]);

  useEffect(() => {
    if (!isMember) return;
    loggingOutRef.current = false;
    setPhase("active");
    markActive(true);

    // A real person doing something. Ignored while the warning is up: that needs a click.
    function onActivity() {
      if (phaseRef.current !== "active") return;
      // Woke from sleep or came back after the limit: don't let a mouse nudge rescue it.
      if (Date.now() - readLastActivity(memoryActivityRef.current) >= limitRef.current) {
        void logoutForInactivity();
        return;
      }
      markActive();
    }

    // Work that has no mouse or keyboard, such as the check-in camera, can announce itself.
    function onExternalActivity() {
      if (phaseRef.current === "expired") return;
      markActive(true);
      if (phaseRef.current === "warning") setPhase("active");
    }

    function tick() {
      if (phaseRef.current === "expired") return;
      const idle = Date.now() - readLastActivity(memoryActivityRef.current);
      const limit = limitRef.current;
      if (idle >= limit) {
        void logoutForInactivity();
      } else if (idle >= limit - WARNING_MS) {
        setSecondsLeft(Math.max(1, Math.ceil((limit - idle) / 1000)));
        if (phaseRef.current !== "warning") setPhase("warning");
      } else if (phaseRef.current === "warning") {
        setPhase("active"); // activity in another tab
      }
    }

    function onVisible() {
      if (document.visibilityState === "visible") tick();
    }

    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, onActivity, { passive: true }));
    window.addEventListener("afriticket:activity", onExternalActivity);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(tick, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, onActivity));
      window.removeEventListener("afriticket:activity", onExternalActivity);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [isMember, markActive, logoutForInactivity]);

  async function logOutNow() {
    setPhase("active");
    await endSession();
    navigate("/");
  }

  return (
    <>
      <Dialog
        open={phase === "warning"}
        onOpenChange={(open) => {
          if (!open) stayLoggedIn();
        }}
        title="Are you still there?"
        description="For your security, we log you out when an account has been inactive for a while."
      >
        <div className="space-y-4">
          <p role="timer" aria-live="polite" className="text-ink dark:text-ink-dark">
            You'll be logged out in <strong>{secondsLeft}</strong> second{secondsLeft === 1 ? "" : "s"}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={stayLoggedIn}>Stay logged in</Button>
            <Button variant="outline" onClick={() => void logOutNow()}>Log out now</Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={phase === "expired"}
        onOpenChange={(open) => {
          if (!open) setPhase("active");
        }}
        title="You've been logged out"
        description="This keeps your account safe if you step away."
      >
        <div className="space-y-4">
          <p className="text-ink dark:text-ink-dark">
            We logged you out after {expiredAfterMinutes} minutes of inactivity.
          </p>
          <Button
            onClick={() => {
              setPhase("active");
              navigate("/login", { state: { from: window.location.pathname } });
            }}
          >
            Log in again
          </Button>
        </div>
      </Dialog>
    </>
  );
}