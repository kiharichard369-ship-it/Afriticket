// Save as: src/pages/ProfilePage.tsx   (route: /profile)
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

const MIN_PASSWORD_LENGTH = 8;

export function ProfilePage() {
  const { user } = useAuth();
  const isGuest = !user || Boolean(user.is_anonymous);

  // Profile details
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [changing, setChanging] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const userId = user?.id;
  useEffect(() => {
    if (!supabase || !userId || isGuest) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setProfileError(error.message);
        setFullName(data?.full_name ?? "");
        setPhone(data?.phone ?? "");
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, isGuest]);

  async function saveProfile() {
    if (!supabase) return;
    setSaving(true);
    setProfileError(null);
    setProfileMessage(null);
    const { error } = await supabase.rpc("update_my_profile", { p_full_name: fullName, p_phone: phone });
    setSaving(false);
    if (error) {
      setProfileError(error.message);
      return;
    }
    setProfileMessage("Profile saved.");
  }

  async function changePassword() {
    if (!supabase || !user?.email) return;
    setPasswordError(null);
    setPasswordMessage(null);

    if (!currentPassword) return setPasswordError("Enter your current password.");
    if (newPassword.length < MIN_PASSWORD_LENGTH) return setPasswordError(`Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (newPassword !== confirmPassword) return setPasswordError("The new passwords don't match.");
    if (newPassword === currentPassword) return setPasswordError("Choose a password different from your current one.");

    setChanging(true);
    // Prove it's really the account owner, even on a shared or unattended device.
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
    if (verifyError) {
      setChanging(false);
      setPasswordError("Your current password is incorrect.");
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setChanging(false);
      setPasswordError(updateError.message);
      return;
    }
    // Sign out every other device, in case someone else had access.
    await supabase.auth.signOut({ scope: "others" });
    setChanging(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordMessage("Password changed. Other devices have been signed out.");
  }

  if (isGuest) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink dark:text-ink-dark">Your profile</h1>
        <p className="mt-2 text-ink-soft dark:text-ink-soft-dark">Log in to see and edit your profile.</p>
        <Link to="/login" state={{ from: "/profile" }}>
          <Button className="mt-6">Log in</Button>
        </Link>
      </div>
    );
  }

  // Accounts created with Google or similar have no password to change here.
  const providers = (user?.app_metadata?.providers as string[] | undefined) ?? ["email"];
  const hasPassword = providers.includes("email");
  const inputType = showPasswords ? "text" : "password";

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="font-display text-3xl font-semibold text-ink dark:text-ink-dark">Your profile</h1>

      <Card className="mt-6 p-5">
        <h2 className="font-display text-xl text-ink dark:text-ink-dark">Your details</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="profile-email" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Email</label>
            <Input id="profile-email" value={user?.email ?? ""} readOnly disabled />
            <p className="mt-1 text-xs text-ink-faint">This is the email you log in with. To change it, contact support.</p>
          </div>
          <div>
            <label htmlFor="profile-name" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Full name</label>
            <Input id="profile-name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={!loaded} />
          </div>
          <div>
            <label htmlFor="profile-phone" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Phone number</label>
            <Input id="profile-phone" type="tel" autoComplete="tel" placeholder="0712345678" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!loaded} />
          </div>
        </div>
        {profileError && <p role="alert" className="mt-3 text-sm text-rust">{profileError}</p>}
        {profileMessage && <p role="status" className="mt-3 text-sm text-sage">{profileMessage}</p>}
        <Button className="mt-4" disabled={!loaded || saving} onClick={saveProfile}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </Card>

      <Card className="mt-6 p-5">
        <h2 className="font-display text-xl text-ink dark:text-ink-dark">Change password</h2>
        {!hasPassword ? (
          <p className="mt-2 text-sm text-ink-soft dark:text-ink-soft-dark">
            You signed in with an outside account, so there is no Afriticket password to change here.
          </p>
        ) : (
          <>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="current-password" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Current password</label>
                <Input id="current-password" type={inputType} autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              </div>
              <div>
                <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">New password</label>
                <Input id="new-password" type={inputType} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                <p className="mt-1 text-xs text-ink-faint">At least {MIN_PASSWORD_LENGTH} characters.</p>
              </div>
              <div>
                <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Confirm new password</label>
                <Input id="confirm-password" type={inputType} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm text-ink-soft dark:text-ink-soft-dark">
                <input type="checkbox" className="h-4 w-4 accent-saffron" checked={showPasswords} onChange={(e) => setShowPasswords(e.target.checked)} />
                Show passwords
              </label>
            </div>
            {passwordError && <p role="alert" className="mt-3 text-sm text-rust">{passwordError}</p>}
            {passwordMessage && <p role="status" className="mt-3 text-sm text-sage">{passwordMessage}</p>}
            <Button className="mt-4" disabled={changing || !currentPassword || !newPassword || !confirmPassword} onClick={changePassword}>
              {changing ? "Changing…" : "Change password"}
            </Button>
          </>
        )}
      </Card>

      <p className="mt-6 text-sm text-ink-soft dark:text-ink-soft-dark">
        Looking for your tickets? <Link to="/my-tickets" className="underline">Go to My tickets</Link>.
      </p>
    </div>
  );
}