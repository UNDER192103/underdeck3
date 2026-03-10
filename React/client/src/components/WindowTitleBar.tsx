import { CSSProperties, useEffect, useState } from "react";
import { Maximize2, Minimize2, Minus, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WindowControlState } from "@/types/electron";

const TITLE_BAR_HEIGHT = 38;

const dragRegionStyle = {
  WebkitAppRegion: "drag" as const,
} as CSSProperties;

const noDragRegionStyle = {
  WebkitAppRegion: "no-drag" as const,
} as CSSProperties;

const defaultState: WindowControlState = {
  maximized: false,
  minimized: false,
  fullscreen: false,
};

export function WindowTitleBar() {
  const [windowState, setWindowState] = useState<WindowControlState>(defaultState);
  const windowControls = window.underdeck?.windowControls;

  useEffect(() => {
    if (!windowControls) return;
    let mounted = true;

    void windowControls.getState().then((state) => {
      if (!mounted) return;
      setWindowState(state);
    }).catch(() => {
      // ignore
    });

    const unsubscribe = windowControls.onStateChanged((state) => {
      setWindowState(state);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [windowControls]);

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-between border-b border-border/70 ps-2 pe-1 backdrop-blur supports-[backdrop-filter]:bg-background select-none"
      style={{
        ...dragRegionStyle,
        height: `${TITLE_BAR_HEIGHT}px`,
      }}
      onDoubleClick={() => {
        if (!windowControls) return;
        void windowControls.toggleMaximize();
      }}
    >
      <div className="flex min-w-0 items-center gap-3" style={dragRegionStyle}>
        <img
          src="./favicon.ico"
          alt="Under Deck"
          className="h-7 w-7 rounded-sm object-cover"
          draggable={false}
          style={dragRegionStyle}
        />
        <span className="truncate text-sm font-semibold tracking-[0.18em] text-foreground/90">
          Under Deck
        </span>
      </div>

      <div className="flex items-center gap-1" style={noDragRegionStyle}>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-12 rounded-md text-foreground/80 hover:bg-accent/70 hover:text-foreground"
          onClick={() => {
            if (!windowControls) return;
            void windowControls.minimize();
          }}
        >
          <Minus size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-12 rounded-md text-foreground/80 hover:bg-accent/70 hover:text-foreground"
          onClick={() => {
            if (!windowControls) return;
            void windowControls.toggleMaximize();
          }}
        >
          {windowState.maximized ? <Square size={15} /> : <Maximize2 size={15} />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-12 rounded-md text-foreground/80 hover:bg-red-500/85 hover:text-white"
          onClick={() => {
            if (!windowControls) return;
            void windowControls.close();
          }}
        >
          <X size={16} />
        </Button>
      </div>
    </header>
  );
}

export { TITLE_BAR_HEIGHT };
