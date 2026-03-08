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
import Home from "@/pages/Home";


function Router() {
  return (
    <Switch>
      <Route path="/404" component={NotFound} />
      <Route path="/" component={Home} />
      <Route path="/:tab?/:type?/:id?" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}


function App() {
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
                    <Router />
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
