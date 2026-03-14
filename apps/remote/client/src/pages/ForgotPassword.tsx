import { useState } from "react";
import { Link } from "wouter";
import { BackgroundComp } from "@/components/ui/background";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/contexts/I18nContext";

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <div className="min-h-screen w-full overflow-hidden">
      <BackgroundComp variant="neural" />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_30px_80px_rgba(0,0,0,0.55)] backdrop-blur">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              {t("remote.forgot.title", "Forgot password")}
            </h1>
            <p className="mt-1 text-sm text-white/70">
              {t("remote.forgot.subtitle", "Reset flow is not wired yet. This screen is ready for when the API exists.")}
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-white/80">
                {t("remote.forgot.email.label", "Email")}
              </label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("remote.forgot.email.placeholder", "you@example.com")}
              />
            </div>
            <Button
              className="w-full"
              disabled={!email.trim().includes("@")}
              onClick={() => setSent(true)}
            >
              {t("remote.forgot.submit", "Send reset link")}
            </Button>
          </div>

          {sent ? (
            <p className="mt-3 text-sm text-emerald-200/90">
              {t("remote.forgot.sent", "If an account exists for this email, you will receive a reset link.")}
            </p>
          ) : null}

          <div className="mt-4 text-sm text-white/80">
            <Link href="/login" className="text-cyan-200/90 hover:text-cyan-200 hover:underline">
              {t("remote.forgot.back_login", "Back to sign in")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
