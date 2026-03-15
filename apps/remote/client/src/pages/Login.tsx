import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { BackgroundComp } from "@/components/ui/background";
import { Button } from "@/components/ui/button";
import { Input, InputPassword } from "@/components/ui/input";
import { useUser } from "@/contexts/UserContext";
import { useI18n } from "@/contexts/I18nContext";

export default function LoginPage({ enableRedirect }: { enableRedirect?: boolean } = { enableRedirect: true }) {
  const { user, loading, login } = useUser();
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (user) navigate("/dashboard/connections", { replace: true });
  }, [loading, navigate, user]);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const ok = await login({ identifier, password });
      if(enableRedirect) if (ok) navigate("/dashboard/connections", { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full overflow-hidden">
      <BackgroundComp variant="neural" />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_30px_80px_rgba(0,0,0,0.55)] backdrop-blur">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              {t("remote.login.title", "Sign in")}
            </h1>
            <p className="mt-1 text-sm text-white/70">
              {t("remote.login.subtitle", "Use your email or username.")}
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-white/80">
                {t("remote.login.identifier.label", "Email or username")}
              </label>
              <Input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={t("remote.login.identifier.placeholder", "you@example.com")}
                autoComplete="username"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-white/80">
                {t("remote.login.password.label", "Password")}
              </label>
              <InputPassword
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("remote.login.password.placeholder", "••••••••")}
                type="password"
                autoComplete="current-password"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
              />
            </div>
            <Button
              className="mt-2 w-full"
              disabled={submitting || !identifier.trim() || !password}
              onClick={() => void submit()}
            >
              {submitting
                ? t("remote.login.submitting", "Signing in...")
                : t("remote.login.submit", "Sign in")}
            </Button>
          </div>
          {enableRedirect && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <Link href="/forgot-password" className="text-cyan-200/90 hover:text-cyan-200 hover:underline">
                {t("remote.login.forgot", "Forgot password?")}
              </Link>
              <Link href="/register" className="text-white/80 hover:text-white hover:underline">
                {t("remote.login.create", "Create account")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
