import { useEffect, useMemo, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { UserProvider } from "@/contexts/UserContext";
import { SocketProvider } from "@/contexts/SocketContext";
import { I18nProvider, useI18n } from "@/contexts/I18nContext";
import { ObserverProvider } from "@/contexts/ObserverContext";
import { NavigationProvider } from "@/contexts/NavigationContext";
import { BackgroundComp } from "@/components/ui/background";
import { Loader2 } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { useLocation } from "wouter";
import LoginPage from "@/pages/Login";
import RegisterPage from "@/pages/Register";
import ForgotPasswordPage from "@/pages/ForgotPassword";
import DashboardShell from "@/pages/DashboardShell";
import WebDeckRemotePage from "@/pages/dashboard/WebDeckRemote";


function Router() {
  const { t } = useI18n();
  const [progress, setProgress] = useState(0);
  const [bootReady, setBootReady] = useState(false);
  const notifyMainReady = () => {
    try {
      window.underdeck.observer.publish({
        id: "main.ready",
        channel: "app",
        sourceId: "APP_RENDERER",
      });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const interval = window.setInterval(() => {
      setProgress((prev) => {
        const step = prev < 70 ? 4 : (prev < 90 ? 2 : 1);
        const next = Math.min(100, prev + step);
        if (next >= 100) {
          window.clearInterval(interval);
          window.setTimeout(() => setBootReady(true), 120);
        }
        return next;
      });
    }, 45);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!bootReady || progress < 100) return;
    notifyMainReady();
  }, [bootReady, progress]);

  const showLoading = useMemo(() => !bootReady || progress < 100, [bootReady, progress]);

  return (
    <>
      <Switch>
        <Route path="/login" component={() => <LoginPage />} />
        <Route path="/register" component={RegisterPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/webdeck" component={WebDeckRemotePage} />
        <Route path="/dashboard/:rest*" component={DashboardShell} />
        <Route path="/404" component={NotFound} />
        <Route component={LoginGate} />
        <Route component={NotFound} />
      </Switch>
      {showLoading ? (
        <div
          className="fixed inset-x-0 bottom-0 z-[100] flex items-center justify-center"
          style={{ top: 0 }}
        >
          <BackgroundComp variant="neural" />
          <div className="relative z-[101] flex flex-col items-center gap-3 text-white">
            <Loader2 className="h-10 w-10 animate-spin text-cyan-300" />
            <p className="text-sm tracking-wide inline-flex items-center">
              Carregando
              <span className="inline-flex gap-0.5 leading-none ms-1">
                {/* Usamos o caractere · (ponto médio) em vez de . */}
                <span className="animate-[loading_1.5s_infinite_0s] opacity-0 text-2xl font-bold">·</span>
                <span className="animate-[loading_1.5s_infinite_0.2s] opacity-0 text-2xl font-bold">·</span>
                <span className="animate-[loading_1.5s_infinite_0.4s] opacity-0 text-2xl font-bold">·</span>
              </span>
            </p>
          </div>
          <style>{`
            @keyframes loading {
              0% { opacity: 0; }
              30% { opacity: 1; }
              60% { opacity: 1; }
              100% { opacity: 0; }
            }
          `}</style>
        </div>
      ) : null}
    </>
  );
}

function LoginGate() {
  const { user, loading } = useUser();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (loading) return;
    if (user) {
      navigate("/dashboard/connections", { replace: true });
    } else {
      navigate("/login", { replace: true });
    }
  }, [loading, navigate, user]);

  return null;
}


function App() {
  return (
    <ErrorBoundary>
      <ObserverProvider sourceId="APP_ELECTRON">
        <I18nProvider>
          <UserProvider>
            <ThemeProvider defaultTheme="dark" switchable={true}>
              <SocketProvider>
                <TooltipProvider>
                  <Toaster />
                  <NavigationProvider>
                    <Router />
                  </NavigationProvider>
                </TooltipProvider>
              </SocketProvider>
            </ThemeProvider>
          </UserProvider>
        </I18nProvider>
      </ObserverProvider>
    </ErrorBoundary>
  );
}


export default App;
