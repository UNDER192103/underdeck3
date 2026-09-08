import * as React from "react";
import { cn } from "@/lib/utils";
import { RevealPropsCard, Reveal } from "@/components/ui/reveal";

interface CardProps {
  useReveal?: boolean;
  revealProps?: RevealPropsCard;
  disableHover?: boolean;
  disableShadow?: boolean;
  disableGradient?: boolean;
}

function Card({
  className,
  useReveal = false,
  revealProps,
  disableHover = true,
  disableShadow = false,
  disableGradient = false,
  ...props
}: React.ComponentProps<"div"> & CardProps) {
  const card = (
    <div
      data-slot="card"
      className={cn(
        "text-card-foreground relative z-0 flex min-w-0 max-w-full flex-col gap-6 rounded-xl border border-border/80 py-6 backdrop-blur-xl transition-all duration-300 ease-out will-change-transform",

        disableGradient && "before:!hidden after:!hidden",

        !disableShadow && "shadow-[var(--card-shadow)]",

        !disableHover &&
        "hover:z-20 hover:-translate-y-1.5 hover:border-primary/40",

        !disableHover &&
        !disableShadow &&
        "hover:shadow-[var(--card-shadow-hover)]",

        className,
      )}
      {...props}
    />
  );

  if (!useReveal) {
    return card;
  }

  return (
    <Reveal delay={80} {...revealProps}>
      {card}
    </Reveal>
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  );
}

type ResizableCardContentProps = React.ComponentProps<"section"> & {
  defaultSize?: number;
  minSize?: number;
};

function ResizableCardContent({
  className,
  defaultSize,
  minSize = 220,
  style,
  ...props
}: ResizableCardContentProps) {
  return (
    <section
      data-slot="resizable-card-content"
      data-default-size={defaultSize}
      data-min-size={minSize}
      className={cn("h-full min-h-0 min-w-0 w-full max-w-full overflow-hidden", className)}
      // minSize is enforced while dragging. A CSS min-width here would make the
      // entire workspace overflow whenever the available area is narrower.
      style={{ minWidth: 0, ...style }}
      {...props}
    />
  );
}

type ResizableCardProps = React.ComponentProps<"div"> & {
  orientation?: "horizontal";
};

function ResizableCardRoot({
  className,
  children,
  orientation = "horizontal",
  ...props
}: ResizableCardProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const panels = React.Children.toArray(children).filter(React.isValidElement);
  const panelCount = panels.length;
  const [sizes, setSizes] = React.useState<number[]>([]);
  const panelRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const dragRef = React.useRef<{
    index: number;
    startX: number;
    startSizes: number[];
    lastSizes: number[];
    leftMin: number;
    rightMin: number;
  } | null>(null);

  const applyPanelSizes = React.useCallback((nextSizes: number[]) => {
    nextSizes.forEach((size, index) => {
      const panel = panelRefs.current[index];
      if (!panel) return;
      const value = `${size}%`;
      panel.style.flexBasis = value;
      panel.style.maxWidth = value;
    });
  }, []);

  React.useEffect(() => {
    if (panelCount === 0) {
      setSizes([]);
      return;
    }

    setSizes((current) => {
      if (current.length === panelCount) return current;

      const defaults = panels.map((panel) => {
        const props = panel.props as ResizableCardContentProps;
        return props.defaultSize;
      });
      const explicitTotal = defaults.reduce<number>(
        (total, size) => total + (typeof size === "number" ? size : 0),
        0,
      );
      const missingCount = defaults.filter((size) => typeof size !== "number").length;
      const fallbackSize = missingCount > 0 ? Math.max(0, 100 - explicitTotal) / missingCount : 0;

      return defaults.map((size) =>
        typeof size === "number" ? size : fallbackSize,
      );
    });
  }, [panelCount, panels]);

  React.useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      const container = containerRef.current;
      if (!drag || !container) return;

      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;

      const delta = ((event.clientX - drag.startX) / rect.width) * 100;
      const pairTotal = drag.startSizes[drag.index] + drag.startSizes[drag.index + 1];
      const minLeft = (drag.leftMin / rect.width) * 100;
      const minRight = (drag.rightMin / rect.width) * 100;

      let nextLeft = drag.startSizes[drag.index] + delta;
      nextLeft = Math.max(minLeft, Math.min(pairTotal - minRight, nextLeft));

      const next = [...drag.startSizes];
      next[drag.index] = nextLeft;
      next[drag.index + 1] = pairTotal - nextLeft;
      drag.lastSizes = next;
      applyPanelSizes(next);
    };

    const handlePointerUp = () => {
      const drag = dragRef.current;
      if (drag) {
        setSizes((current) => (
          current.length === drag.lastSizes.length
            && current.every((size, index) => size === drag.lastSizes[index])
            ? current
            : drag.lastSizes
        ));
        panelRefs.current.forEach((panel) => {
          if (panel) panel.style.willChange = "";
        });
      }
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [applyPanelSizes]);

  return (
    <div
      ref={containerRef}
      data-slot="resizable-card"
      data-orientation={orientation}
      className={cn(
        "text-card-foreground relative flex min-h-0 min-w-0 overflow-hidden rounded-xl border border-border/80 bg-card/40 backdrop-blur-xl",
        className,
      )}
      {...props}
    >
      {panels.map((panel, index) => (
        <React.Fragment key={(panel as React.ReactElement).key ?? index}>
          <div
            ref={(element) => {
              panelRefs.current[index] = element;
            }}
            className="h-full min-h-0 min-w-0 max-w-full overflow-hidden"
            style={{
              flexBasis: `${sizes[index] ?? 100 / Math.max(panelCount, 1)}%`,
              maxWidth: `${sizes[index] ?? 100 / Math.max(panelCount, 1)}%`,
              flexGrow: 0,
              flexShrink: 0,
            }}
          >
            {panel}
          </div>
          {index < panelCount - 1 && (
            <div
              role="separator"
              aria-orientation="vertical"
              className="group relative z-10 w-0 shrink-0 cursor-col-resize"
              onPointerDown={(event) => {
                event.preventDefault();
                const leftPanel = panels[index];
                const rightPanel = panels[index + 1];
                const startSizes = sizes.length === panelCount
                  ? sizes
                  : Array.from({ length: panelCount }, () => 100 / panelCount);
                dragRef.current = {
                  index,
                  startX: event.clientX,
                  startSizes,
                  lastSizes: startSizes,
                  leftMin: ((leftPanel?.props ?? {}) as ResizableCardContentProps).minSize ?? 220,
                  rightMin: ((rightPanel?.props ?? {}) as ResizableCardContentProps).minSize ?? 220,
                };
                panelRefs.current.forEach((panel) => {
                  if (panel) panel.style.willChange = "flex-basis, max-width";
                });
                document.body.style.cursor = "col-resize";
                document.body.style.userSelect = "none";
              }}
            >
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-primary" />
              <div className="absolute inset-y-0 left-1/2 w-3 -translate-x-1/2" />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

const ResizableCard = Object.assign(ResizableCardRoot, {
  Content: ResizableCardContent,
});

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  ResizableCard,
  ResizableCardContent,
};
