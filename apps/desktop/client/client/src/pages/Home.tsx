import React, { useEffect, useMemo, useState } from 'react';
import { useNavigation } from "@/contexts/NavigationContext";

import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { TITLE_BAR_HEIGHT } from '@/components/WindowTitleBar';

import RenderBackground from '@/components/RenderBackground';
import Apps from '@/components/dashboard/apps';
import Shortcuts from '@/components/dashboard/shortcuts';
import Theme from '@/components/dashboard/theme';
import SoundPad from '@/components/dashboard/soundpad';
import ObsStudio from '@/components/dashboard/obs';
import WebDeck from '@/components/dashboard/webdeck';
import UpdatePage from '@/components/dashboard/update';
import WebPages from '@/components/dashboard/webpages';

export default function Home() {
  const { get, set } = useNavigation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const currentTab = get("homePages") || "apps";

  useEffect(() => {
    if ((get("pages") || "home") !== "home") {
      set("pages", "home");
    }
    if (!get("homePages")) {
      set("homePages", "apps");
    }
  }, [get, set]);

  const content = useMemo(() => {
    switch (currentTab) {
      case "shortcuts":
        return <Shortcuts />;
      case "theme":
        return <Theme />;
      case "soundpad":
        return <SoundPad />;
      case "obs":
        return <ObsStudio />;
      case "deck":
        return <WebDeck />;
      case "updates":
        return <UpdatePage />;
      case "webpages":
        return <WebPages />;
      case "app":
      case "apps":
      default:
        return <Apps />;
    }
  }, [currentTab]);

  return (
    <div className="h-screen overflow-hidden flex flex-col">
      <RenderBackground />

      <div className="flex h-full w-full text-foreground overflow-hidden">

        <Sidebar onCollapsedChange={setIsCollapsed} />

        {/* Main Content */}
        <div
          className="flex h-full flex-col transition-layout min-w-0 overflow-hidden"
          style={{
            marginLeft: isCollapsed ? '60px' : '256px',
            width: isCollapsed ? 'calc(100% - 60px)' : 'calc(100% - 256px)',
            paddingTop: `${TITLE_BAR_HEIGHT}px`,
          }}
        >

          {/* Header */}
          <Navbar isCollapsed={isCollapsed} />

          {/* Main Area */}
          <div className="flex-1 flex flex-col transition-sidebar min-w-0 overflow-hidden">

            <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden mt-13">
              {content}
            </main>
          </div>
        </div>

      </div>


    </div>
  );
}
