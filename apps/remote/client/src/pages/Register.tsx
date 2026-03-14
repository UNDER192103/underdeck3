import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { BackgroundComp } from "@/components/ui/background";
import { Button } from "@/components/ui/button";
import { Input, InputPassword } from "@/components/ui/input";
import { useUser } from "@/contexts/UserContext";
import { useI18n } from "@/contexts/I18nContext";

export default function RegisterPage() {
  const { user, loading, register } = useUser();
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (user) navigate("/dashboard/connections", { replace: true });
  }, [loading, navigate, user]);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const ok = await register({
        displayName,
        username,
        email,
        password,
        confirmPassword,
      });
      if (ok) navigate("/dashboard/connections", { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    displayName.trim().length >= 3 &&
    username.trim().length >= 3 &&
    email.trim().includes("@") &&
    password.length >= 6 &&
    password === confirmPassword;

  return (
    <div className="min-h-screen w-full overflow-hidden">
      <BackgroundComp variant="neural" />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_30px_80px_rgba(0,0,0,0.55)] backdrop-blur">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              {t("remote.register.title", "Create account")}
            </h1>
            <p className="mt-1 text-sm text-white/70">
              {t("remote.register.subtitle", "This account is used by both desktop and web.")}
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-white/80">
                {t("remote.register.display_name.label", "Display name")}
              </label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t("remote.register.display_name.placeholder", "Under")}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-white/80">
                {t("remote.register.username.label", "Username")}
              </label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("remote.register.username.placeholder", "under_1921")}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-white/80">
                {t("remote.register.email.label", "Email")}
              </label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("remote.register.email.placeholder", "you@example.com")}
                autoComplete="email"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-white/80">
                {t("remote.register.password.label", "Password")}
              </label>
              <InputPassword
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-white/80">
                {t("remote.register.confirm_password.label", "Confirm password")}
              </label>
              <InputPassword
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                type="password"
                autoComplete="new-password"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
              />
            </div>
            <Button className="mt-2 w-full" disabled={submitting || !canSubmit} onClick={() => void submit()}>
              {submitting
                ? t("remote.register.submitting", "Creating...")
                : t("remote.register.submit", "Create account")}
            </Button>
          </div>

          <div className="mt-4 text-sm text-white/80">
            {t("remote.register.have_account", "Already have an account?")}{" "}
            <Link href="/login" className="text-cyan-200/90 hover:text-cyan-200 hover:underline">
              {t("remote.register.sign_in", "Sign in")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
