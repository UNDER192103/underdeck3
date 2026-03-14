import React, { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";
import { Input, InputPassword } from "@/components/ui/input";
import { FormItem } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/contexts/I18nContext";
import { Send } from "lucide-react";
import { toast } from "sonner";

type Mode = "login" | "register";

export function UserModalLogin() {
  const { login, register, options, setOptions } = useUser();
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("login");
  const [loginData, setLoginData] = useState({ identifier: "", password: "" });
  const [registerData, setRegisterData] = useState({
    displayName: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const onClose = () => {
    setOptions((prev) => ({ ...prev, modalLogin: false }));
  };

  const tryLogin = async () => {
    const ok = await login(loginData);
    if (ok) {
      toast.success(t("auth.login.success", "Login realizado com sucesso."));
      setLoginData({ identifier: "", password: "" });
    }
  };

  const tryRegister = async () => {
    const ok = await register(registerData);
    if (ok) {
      toast.success(t("auth.register.success", "Conta criada com sucesso."));
      setRegisterData({
        displayName: "",
        username: "",
        email: "",
        password: "",
        confirmPassword: "",
      });
    }
  };

  return (
    <Dialog open={options.modalLogin} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[525px] select-none rounded-xl bg-background/50 backdrop-blur supports-[backdrop-filter]:bg-background/50">
        <DialogHeader>
          <DialogTitle>{mode === "login" ? t("auth.login", "Login") : t("auth.register", "Registrar")}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Button
            variant={mode === "login" ? "primary" : "outline"}
            rounded="xl"
            className="flex-1 h-10"
            onClick={() => setMode("login")}
          >
            {t("auth.login", "Login")}
          </Button>
          <Button
            variant={mode === "register" ? "primary" : "outline"}
            rounded="xl"
            className="flex-1 h-10"
            onClick={() => setMode("register")}
          >
            {t("auth.register", "Registrar")}
          </Button>
        </div>

        {mode === "login" ? (
          <div className="flex flex-col gap-4 py-4">
            <FormItem>
              <Label>{t("auth.identifier.label", "Username ou E-mail")}</Label>
              <Input
                value={loginData.identifier}
                rounded="xl"
                onChange={(e) => setLoginData((prev) => ({ ...prev, identifier: e.target.value }))}
                placeholder={t("auth.identifier.placeholder", "Username ou e-mail")}
                className="text-xs pr-9"
              />
            </FormItem>

            <FormItem>
              <Label>{t("auth.password", "Senha")}</Label>
              <InputPassword
                value={loginData.password}
                rounded="xl"
                eyeRounded="lg"
                type="password"
                onChange={(e) => setLoginData((prev) => ({ ...prev, password: e.target.value }))}
                placeholder={t("auth.password", "Senha")}
                className="text-xs pr-9"
              />
            </FormItem>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-4">
            <FormItem>
              <Label>{t("auth.display_name", "Nome de exibicao")}</Label>
              <Input
                value={registerData.displayName}
                rounded="xl"
                onChange={(e) => setRegisterData((prev) => ({ ...prev, displayName: e.target.value }))}
                placeholder={t("auth.display_name", "Nome de exibicao")}
                className="text-xs pr-9"
              />
            </FormItem>
            <FormItem>
              <Label>{t("auth.username", "Username")}</Label>
              <Input
                value={registerData.username}
                rounded="xl"
                onChange={(e) => setRegisterData((prev) => ({ ...prev, username: e.target.value }))}
                placeholder={t("auth.username", "Username")}
                className="text-xs pr-9"
              />
            </FormItem>
            <FormItem>
              <Label>{t("auth.email", "E-mail")}</Label>
              <Input
                value={registerData.email}
                rounded="xl"
                onChange={(e) => setRegisterData((prev) => ({ ...prev, email: e.target.value }))}
                placeholder={t("auth.email", "E-mail")}
                className="text-xs pr-9"
              />
            </FormItem>
            <FormItem>
              <Label>{t("auth.password", "Senha")}</Label>
              <InputPassword
                value={registerData.password}
                rounded="xl"
                eyeRounded="lg"
                type="password"
                onChange={(e) => setRegisterData((prev) => ({ ...prev, password: e.target.value }))}
                placeholder={t("auth.password", "Senha")}
                className="text-xs pr-9"
              />
            </FormItem>
            <FormItem>
              <Label>{t("auth.confirm_password", "Confirmar senha")}</Label>
              <InputPassword
                value={registerData.confirmPassword}
                rounded="xl"
                eyeRounded="lg"
                type="password"
                onChange={(e) => setRegisterData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                placeholder={t("auth.confirm_password", "Confirmar senha")}
                className="text-xs pr-9"
              />
            </FormItem>
          </div>
        )}

        <DialogFooter className="sm:justify-center">
          {mode === "login" ? (
            <Button className="w-full h-10" variant="primary" rounded="xl" onClick={tryLogin}>
              <Send size={20} /> {t("auth.login", "Login")}
            </Button>
          ) : (
            <Button className="w-full h-10" variant="primary" rounded="xl" onClick={tryRegister}>
              <Send size={20} /> {t("auth.register", "Registrar")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
