import React, { useState } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import { useTheme } from "@/contexts/ThemeContext";
import NotFound from "@/components/dashboard/NotFound";

import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';

import RenderBackground from '@/components/RenderBackground';
import Apps from '@/components/dashboard/apps';
import Shortcuts from '@/components/dashboard/shortcuts';
import Theme from '@/components/dashboard/theme';
import SoundPad from '@/components/dashboard/soundpad';
import ObsStudio from '@/components/dashboard/obs';
import WebDeck from '@/components/dashboard/webdeck';
import UpdatePage from '@/components/dashboard/update';

export default function Home() {
  const [location, setLocation] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const CurrentTab = `/${location.split('/')[1] || ''}`;

  return (
    <div className="min-h-screen flex flex-col">
      <RenderBackground />

      <div className="flex w-full min-h-screen text-foreground overflow-x-hidden">

        <Sidebar onCollapsedChange={setIsCollapsed} />

        {/* Main Content */}
        <div
          className="flex flex-col transition-layout min-h-screen min-w-0"
          style={{
            marginLeft: isCollapsed ? '60px' : '256px',
            width: isCollapsed ? 'calc(100% - 60px)' : 'calc(100% - 256px)',
          }}
        >

          {/* Header */}
          <Navbar isCollapsed={isCollapsed} />

          {/* Main Area */}
          <div className="flex-1 flex flex-col transition-sidebar min-w-0 overflow-x-hidden">

            <main className="flex-1 pt-15 min-w-0 overflow-x-hidden">
              <Switch location={CurrentTab}>
                <Route path="/">{() => <Apps />}</Route>
                <Route path="/app">{() => <Apps />}</Route>
                <Route path="/shortcuts">{() => <Shortcuts />}</Route>
                <Route path="/theme">{() => <Theme />}</Route>
                <Route path="/soundpad">{() => <SoundPad />}</Route>
                <Route path="/obs">{() => <ObsStudio />}</Route>
                <Route path="/deck">{() => <WebDeck />}</Route>
                <Route path="/updates">{() => <UpdatePage />}</Route>
                <Route component={NotFound} />
              </Switch>
            </main>

            {/*
            <footer className="border-t py-4 text-center text-muted-foreground mt-auto">
              
            </footer>
            */}
          </div>
        </div>

      </div>


    </div>
  );
}
