import React, { useEffect } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { UserProvider } from "@/contexts/UserContext";
import { UnderDeckProvider } from "@/contexts/UnderDeckContext";
import { I18nProvider } from "@/contexts/I18nContext";
import { SocketProvider } from "@/contexts/SocketContext";
import { ObserverProvider } from "@/contexts/ObserverContext";
import { UserModalLogin } from "@/components/user/UserModalLogin";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import OverlayDashboard from "./OverlayDashboard";
import "../index.css";

export default function OverlayApp() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById("root");

    const prevHtmlBackground = html.style.background;
    const prevBodyBackground = body.style.background;
    const prevRootBackground = root?.style.background;

    html.style.background = "transparent";
    body.style.background = "transparent";
    if (root) {
      root.style.background = "transparent";
    }

    return () => {
      html.style.background = prevHtmlBackground;
      body.style.background = prevBodyBackground;
      if (root) {
        root.style.background = prevRootBackground || "";
      }
    };
  }, []);

  return (
    <ErrorBoundary>
      <ObserverProvider>
        <I18nProvider>
          <UserProvider>
            <ThemeProvider defaultTheme="dark" switchable={true}>
              <SocketProvider>
                <UnderDeckProvider>
                  <TooltipProvider>
                    <Toaster />
                    <UserModalLogin />
                    <OverlayDashboard />
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
