import { useEffect, useMemo, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { UserProvider } from "@/contexts/UserContext";
import { SocketProvider } from "@/contexts/SocketContext";
import { UserModalLogin } from "@/components/user/UserModalLogin";
import { UnderDeckProvider } from "@/contexts/UnderDeckContext";
import { I18nProvider } from "@/contexts/I18nContext";
import { ObserverProvider } from "@/contexts/ObserverContext";
import { NavigationProvider } from "@/contexts/NavigationContext";
import Home from "@/pages/Home";
import { BackgroundComp } from "@/components/ui/background";
import { Loader2 } from "lucide-react";


function Router() {
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
        <Route path="/404" component={NotFound} />
        <Route component={Home} />
      </Switch>
      {showLoading ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <BackgroundComp variant="neural" />
          <div className="relative z-[101] flex flex-col items-center gap-3 text-white">
            <Loader2 className="h-10 w-10 animate-spin text-cyan-300" />
            <p className="text-sm tracking-wide">
              Carregando
              <span className="inline-flex w-6 justify-start text-left">
                <span className="animate-[blinkDots_1s_infinite_steps(1)]">...</span>
              </span>
            </p>
          </div>
          <style>{`
            @keyframes blinkDots {
              0%, 20% { opacity: 0; }
              40%, 60% { opacity: 0.5; }
              80%, 100% { opacity: 1; }
            }
          `}</style>
        </div>
      ) : null}
    </>
  );
}


function App() {
  return (
    <ErrorBoundary>
      <ObserverProvider sourceId="APP_ELECTRON">
        <I18nProvider>
          <UserProvider>
            <ThemeProvider defaultTheme="dark" switchable={true}>
              <SocketProvider>
                <UnderDeckProvider>
                  <TooltipProvider>
                    <Toaster />
                    <UserModalLogin />
                    <NavigationProvider>
                      <Router />
                    </NavigationProvider>
                  </TooltipProvider>
                </UnderDeckProvider>
              </SocketProvider>
            </ThemeProvider>
          </UserProvider>
        </I18nProvider>
      </ObserverProvider>
    </ErrorBoundary>
  );
}


export default App;
