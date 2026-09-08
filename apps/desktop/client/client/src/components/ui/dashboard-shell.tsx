"use client";

import * as React from "react";
import { Menu, X } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Reveal } from "./reveal";

export type DashboardSide = "left" | "right";
export type HeaderLayout = "single" | "split" | "three";
export type DashboardScrollMode = "content" | "page";
export type DashboardFixedSidebars =
  boolean | DashboardSide | "both" | "none" | "auto";
export type DashboardSidebarCollapsible =
  boolean | "mobile" | "desktop" | "always";
export type DashboardContextValue = {
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  fixedHeader: boolean;
  fixedFooter: boolean;
  scrollMode: DashboardScrollMode;
  rootScrollsContent: boolean;
  setSidebarOpen: (side: DashboardSide, open: boolean) => void;
  toggleSidebar: (side: DashboardSide) => void;
  isSidebarFixed: (side: DashboardSide) => boolean;
};

const DashboardContext = React.createContext<DashboardContextValue | null>(
  null,
);

function useDashboard() {
  const context = React.useContext(DashboardContext);

  if (!context) {
    throw new Error("Dashboard components must be used inside <Dashboard>.");
  }

  return context;
}

function useControllableBoolean({
  value,
  defaultValue = false,
  onChange,
}: {
  value?: boolean;
  defaultValue?: boolean;
  onChange?: (value: boolean) => void;
}) {
  const [uncontrolledValue, setUncontrolledValue] =
    React.useState(defaultValue);
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : uncontrolledValue;

  const setValue = React.useCallback(
    (nextValue: boolean) => {
      if (!isControlled) {
        setUncontrolledValue(nextValue);
      }

      onChange?.(nextValue);
    },
    [isControlled, onChange],
  );

  return [currentValue, setValue] as const;
}

type DashboardRootProps = React.ComponentPropsWithoutRef<"div"> & {
  scrollMode?: DashboardScrollMode;
  fixedHeader?: boolean;
  fixedFooter?: boolean;
  fixedSidebar?: DashboardFixedSidebars;
  fixedSidebars?: DashboardFixedSidebars;
  defaultSidebarOpen?: boolean;
  defaultLeftSidebarOpen?: boolean;
  defaultRightSidebarOpen?: boolean;
  leftSidebarOpen?: boolean;
  rightSidebarOpen?: boolean;
  onLeftSidebarOpenChange?: (open: boolean) => void;
  onRightSidebarOpenChange?: (open: boolean) => void;
};

const DashboardRoot = React.forwardRef<HTMLDivElement, DashboardRootProps>(
  (
    {
      className,
      scrollMode = "content",
      fixedHeader = false,
      fixedFooter = false,
      fixedSidebar,
      fixedSidebars = fixedSidebar ?? "auto",
      defaultSidebarOpen,
      defaultLeftSidebarOpen = defaultSidebarOpen ?? false,
      defaultRightSidebarOpen = defaultSidebarOpen ?? false,
      children,
      leftSidebarOpen: controlledLeftSidebarOpen,
      rightSidebarOpen: controlledRightSidebarOpen,
      onLeftSidebarOpenChange,
      onRightSidebarOpenChange,
      style,
      ...props
    },
    ref,
  ) => {
    const [leftSidebarOpen, setLeftSidebarOpen] = useControllableBoolean({
      value: controlledLeftSidebarOpen,
      defaultValue: defaultLeftSidebarOpen,
      onChange: onLeftSidebarOpenChange,
    });
    const [rightSidebarOpen, setRightSidebarOpen] = useControllableBoolean({
      value: controlledRightSidebarOpen,
      defaultValue: defaultRightSidebarOpen,
      onChange: onRightSidebarOpenChange,
    });

    const setSidebarOpen = React.useCallback(
      (side: DashboardSide, open: boolean) => {
        if (side === "left") {
          setLeftSidebarOpen(open);
          return;
        }

        setRightSidebarOpen(open);
      },
      [setLeftSidebarOpen, setRightSidebarOpen],
    );

    const toggleSidebar = React.useCallback(
      (side: DashboardSide) => {
        setSidebarOpen(
          side,
          side === "left" ? !leftSidebarOpen : !rightSidebarOpen,
        );
      },
      [leftSidebarOpen, rightSidebarOpen, setSidebarOpen],
    );

    const isSidebarFixed = React.useCallback(
      (side: DashboardSide) => {
        if (fixedSidebars === true || fixedSidebars === "both") {
          return true;
        }

        if (
          fixedSidebars === false ||
          fixedSidebars === "none" ||
          fixedSidebars === "auto"
        ) {
          return false;
        }

        return fixedSidebars === side;
      },
      [fixedSidebars],
    );

    const childItems = React.Children.toArray(children);
    const fixedTopChildren: React.ReactNode[] = [];
    const fixedBottomChildren: React.ReactNode[] = [];
    const scrollChildren: React.ReactNode[] = [];
    let hasScrollableShellChrome = false;

    if (scrollMode === "content") {
      for (const child of childItems) {
        if (!React.isValidElement(child)) {
          scrollChildren.push(child);
          continue;
        }

        const type = child.type as { displayName?: string };
        const slotName = type.displayName;
        const isHeader = slotName === "DashboardHeader";
        const isFooter = slotName === "DashboardFooter";
        const fixedProp = (child.props as { fixed?: boolean }).fixed;
        const isFixed =
          fixedProp ??
          (isHeader ? fixedHeader : isFooter ? fixedFooter : false);

        if (isHeader && isFixed) {
          fixedTopChildren.push(child);
          continue;
        }

        if (isFooter && isFixed) {
          fixedBottomChildren.push(child);
          continue;
        }

        if (isHeader || isFooter) {
          hasScrollableShellChrome = true;
        }

        scrollChildren.push(child);
      }
    }

    const rootScrollsContent =
      scrollMode === "content" && hasScrollableShellChrome;
    const hasFixedTop = fixedTopChildren.length > 0;
    const hasFixedBottom = fixedBottomChildren.length > 0;
    const shouldRenderTopSlot =
      rootScrollsContent && (hasFixedTop || hasFixedBottom);
    const shouldRenderBottomSlot =
      rootScrollsContent && (hasFixedTop || hasFixedBottom);

    const value = React.useMemo(
      () => ({
        leftSidebarOpen,
        rightSidebarOpen,
        fixedHeader,
        fixedFooter,
        scrollMode,
        rootScrollsContent,
        setSidebarOpen,
        toggleSidebar,
        isSidebarFixed,
      }),
      [
        leftSidebarOpen,
        rightSidebarOpen,
        fixedHeader,
        fixedFooter,
        scrollMode,
        rootScrollsContent,
        setSidebarOpen,
        toggleSidebar,
        isSidebarFixed,
      ],
    );

    return (
      <DashboardContext.Provider value={value}>
        <div
          ref={ref}
          data-slot="dashboard"
          className={cn(
            "flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-background text-foreground",
            className,
          )}
          style={style}
          {...props}
        >
          {scrollMode === "page" ? (
            <ScrollArea
              className="h-full w-full"
              viewportClassName="[&>div]:!block [&>div]:h-full [&>div]:min-h-full"
              contentClassName="flex min-h-dvh w-full flex-col p-0"
              scrollbarClassName="z-50"
            >
              {children}
            </ScrollArea>
          ) : rootScrollsContent ? (
            <>
              {shouldRenderTopSlot &&
                (hasFixedTop ? (
                  fixedTopChildren
                ) : (
                  <div
                    data-slot="dashboard-fixed-header-placeholder"
                    className="shrink-0"
                  />
                ))}
              <ScrollArea
                className="min-h-0 w-full flex-1"
                viewportClassName="[&>div]:!block [&>div]:h-full [&>div]:min-h-full"
                contentClassName="flex min-h-full w-full flex-col p-0"
                scrollbarClassName="z-50"
              >
                {scrollChildren}
              </ScrollArea>
              {shouldRenderBottomSlot &&
                (hasFixedBottom ? (
                  fixedBottomChildren
                ) : (
                  <div
                    data-slot="dashboard-fixed-footer-placeholder"
                    className="shrink-0"
                  />
                ))}
            </>
          ) : (
            <div className="flex h-full min-h-0 w-full flex-col">
              {children}
            </div>
          )}
        </div>
      </DashboardContext.Provider>
    );
  },
);
DashboardRoot.displayName = "Dashboard";

type DashboardHeaderProps = React.ComponentPropsWithoutRef<"header"> & {
  layout?: HeaderLayout;
  useReveal?: boolean;
  left?: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
  start?: React.ReactNode;
  end?: React.ReactNode;
  contentClassName?: string;
  unstyled?: boolean;
  fixed?: boolean;
};

const DashboardHeader = React.forwardRef<HTMLElement, DashboardHeaderProps>(
  (
    {
      className,
      contentClassName,
      children,
      layout,
      useReveal = true,
      left,
      center,
      right,
      start,
      end,
      unstyled = false,
      fixed,
      ...props
    },
    ref,
  ) => {
    const { fixedHeader, scrollMode } = useDashboard();
    const isFixed = fixed ?? fixedHeader;
    const resolvedLayout =
      layout ??
      (center !== undefined || right !== undefined
        ? "three"
        : end !== undefined
          ? "split"
          : "single");

    const leftSlot = left ?? start;
    const rightSlot = right ?? end;

    return (
      <Reveal
        asChild
        forwardedRef={ref}
        delay={100}
        direction="down"
        disabled={!useReveal}
      >
        <header
          data-slot="dashboard-header"
          className={cn(
            "shrink-0",
            isFixed && scrollMode === "page" && "sticky top-0 z-40",
            !unstyled && "border-b border-border/60 bg-background/95",
            className,
          )}
          {...props}
        >
          {children ?? (
            <div
              className={cn(
                "min-h-14 w-full px-4",
                resolvedLayout === "single" && "flex items-center gap-2",
                resolvedLayout === "split" &&
                  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3",
                resolvedLayout === "three" &&
                  "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3",
                contentClassName,
              )}
            >
              {resolvedLayout === "single" && leftSlot}
              {resolvedLayout === "split" && (
                <>
                  <div className="min-w-0">{leftSlot}</div>
                  <div className="min-w-0 justify-self-end">{rightSlot}</div>
                </>
              )}
              {resolvedLayout === "three" && (
                <>
                  <div className="min-w-0">{leftSlot}</div>
                  <div className="min-w-0 justify-self-center">{center}</div>
                  <div className="min-w-0 justify-self-end">{rightSlot}</div>
                </>
              )}
            </div>
          )}
        </header>
      </Reveal>
    );
  },
);
DashboardHeader.displayName = "DashboardHeader";

const DashboardBody = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  const { scrollMode, rootScrollsContent } = useDashboard();

  return (
    <div
      ref={ref}
      data-slot="dashboard-body"
      className={cn(
        "flex min-h-0 flex-1",
        scrollMode === "content" &&
          (rootScrollsContent
            ? "min-h-fit overflow-visible"
            : "overflow-hidden"),
        scrollMode === "page" && "overflow-visible",
        className,
      )}
      {...props}
    />
  );
});
DashboardBody.displayName = "DashboardBody";

type DashboardContentProps = React.ComponentPropsWithoutRef<"main"> & {
  scroll?: boolean;
  classNameScroll?: string;
  scrollbarClassName?: string;
};

const DashboardContent = React.forwardRef<HTMLElement, DashboardContentProps>(
  (
    {
      className,
      classNameScroll,
      scrollbarClassName,
      children,
      scroll: scrollProp,
      style,
      ...props
    },
    ref,
  ) => {
    const { scrollMode, rootScrollsContent } = useDashboard();
    const shouldScroll =
      scrollProp ?? (scrollMode === "content" && !rootScrollsContent);
    const isManagedContentArea = scrollMode === "content";

    return (
      <main
        ref={ref}
        data-slot="dashboard-content"
        className={cn(
          "min-w-0 flex-1",
          shouldScroll || isManagedContentArea ? "min-h-0" : "min-h-fit",
          shouldScroll || isManagedContentArea
            ? "overflow-hidden"
            : "overflow-visible",
          className,
        )}
        style={style}
        {...props}
      >
        {shouldScroll ? (
          <ScrollArea
            className={cn("h-full w-full", classNameScroll)}
            scrollbarClassName={scrollbarClassName}
          >
            {children}
          </ScrollArea>
        ) : (
          children
        )}
      </main>
    );
  },
);
DashboardContent.displayName = "DashboardContent";

type DashboardFooterProps = React.ComponentPropsWithoutRef<"footer"> & {
  contentClassName?: string;
  unstyled?: boolean;
  fixed?: boolean;
  useReveal?: boolean;
};

const DashboardFooter = React.forwardRef<HTMLElement, DashboardFooterProps>(
  (
    {
      className,
      contentClassName,
      children,
      unstyled = false,
      fixed,
      useReveal = true,
      ...props
    },
    ref,
  ) => {
    const { fixedFooter, scrollMode } = useDashboard();
    const isFixed = fixed ?? fixedFooter;

    return (
      <Reveal
        asChild
        forwardedRef={ref}
        delay={100}
        direction="up"
        disabled={!useReveal}
      >
        <footer
          data-slot="dashboard-footer"
          className={cn(
            "relative z-10 shrink-0",
            isFixed && scrollMode === "page" && "sticky bottom-0 z-40",
            !unstyled && "border-t border-border/60 bg-background/95",
            className,
          )}
          {...props}
        >
          {unstyled ? (
            children
          ) : (
            <div className={cn("min-h-12 px-4 py-2", contentClassName)}>
              {children}
            </div>
          )}
        </footer>
      </Reveal>
    );
  },
);
DashboardFooter.displayName = "DashboardFooter";

type DashboardSidebarProps = React.ComponentPropsWithoutRef<"aside"> & {
  side?: DashboardSide;
  width?: string;
  desktopAt?: "md" | "lg";
  fixed?: boolean | "auto";
  collapsible?: DashboardSidebarCollapsible;
  overlayClassName?: string;
  closeOnOverlayClick?: boolean;
  useReveal?: boolean;
};

const DashboardSidebar = React.forwardRef<HTMLElement, DashboardSidebarProps>(
  (
    {
      className,
      side = "left",
      width = "w-72 md:w-72",
      desktopAt = "md",
      fixed = "auto",
      collapsible = "mobile",
      overlayClassName,
      closeOnOverlayClick = true,
      useReveal = true,
      children,
      ...props
    },
    ref,
  ) => {
    const {
      leftSidebarOpen,
      rightSidebarOpen,
      setSidebarOpen,
      isSidebarFixed,
    } = useDashboard();
    const open = side === "left" ? leftSidebarOpen : rightSidebarOpen;
    const isFixed = fixed === "auto" ? isSidebarFixed(side) : fixed;
    const desktopCollapsible =
      collapsible === true ||
      collapsible === "desktop" ||
      collapsible === "always";

    return (
      <>
        <button
          type="button"
          aria-label="Fechar sidebar"
          className={cn(
            "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ease-out",
            desktopAt === "md" && "md:hidden",
            desktopAt === "lg" && "lg:hidden",
            open ? "opacity-100" : "pointer-events-none opacity-0",
            overlayClassName,
          )}
          onClick={() => {
            if (closeOnOverlayClick) {
              setSidebarOpen(side, false);
            }
          }}
        />
        <Reveal
          asChild
          delay={100}
          direction={side === "left" ? "right" : "left"}
          disabled={!useReveal}
        >
          <aside
            ref={ref}
            data-slot="dashboard-sidebar"
            data-side={side}
            className={cn(
              "fixed inset-y-0 z-50 flex h-dvh flex-col bg-background shadow-xl opacity-100 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[translate,opacity,width,max-width,flex-basis]",
              desktopAt === "md" && [
                "md:inset-auto md:z-auto md:h-full md:shrink-0 md:translate-x-0 md:opacity-100 md:shadow-none",
                isFixed
                  ? "md:sticky md:top-0 md:h-dvh md:max-h-dvh md:self-start"
                  : "md:relative",
                desktopCollapsible && !open && "md:hidden",
              ],
              desktopAt === "lg" && [
                "lg:inset-auto lg:z-auto lg:h-full lg:shrink-0 lg:translate-x-0 lg:opacity-100 lg:shadow-none",
                isFixed
                  ? "lg:sticky lg:top-0 lg:h-dvh lg:max-h-dvh lg:self-start"
                  : "lg:relative",
                desktopCollapsible && !open && "lg:hidden",
              ],
              width,
              side === "left" && [
                "left-0 border-r border-border/60",
                open
                  ? "translate-x-0 opacity-100"
                  : "-translate-x-full opacity-0",
              ],
              side === "right" && [
                "right-0 border-l border-border/60",
                open
                  ? "translate-x-0 opacity-100"
                  : "translate-x-full opacity-0",
              ],
              className,
            )}
            {...props}
          >
            {children}
          </aside>
        </Reveal>
      </>
    );
  },
);
DashboardSidebar.displayName = "DashboardSidebar";

const DashboardSidebarHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="dashboard-sidebar-header"
    className={cn("shrink-0 border-b border-border/60 p-3", className)}
    {...props}
  />
));
DashboardSidebarHeader.displayName = "DashboardSidebarHeader";

type DashboardSidebarContentProps = React.ComponentPropsWithoutRef<"div"> & {
  scroll?: boolean;
  classNameScroll?: string;
};

const DashboardSidebarContent = React.forwardRef<
  HTMLDivElement,
  DashboardSidebarContentProps
>(({ className, classNameScroll, children, scroll = true, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="dashboard-sidebar-content"
    className={cn("min-h-0 flex-1 overflow-hidden", className)}
    {...props}
  >
    {scroll ? (
      <ScrollArea className={cn("h-full w-full", classNameScroll)}>
        {children}
      </ScrollArea>
    ) : (
      children
    )}
  </div>
));
DashboardSidebarContent.displayName = "DashboardSidebarContent";

const DashboardSidebarFooter = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="dashboard-sidebar-footer"
    className={cn("shrink-0 border-t border-border/60 p-3", className)}
    {...props}
  />
));
DashboardSidebarFooter.displayName = "DashboardSidebarFooter";

type DashboardSidebarTriggerProps =
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    side?: DashboardSide;
    mobileOnly?: boolean;
  };

const DashboardSidebarTrigger = React.forwardRef<
  HTMLButtonElement,
  DashboardSidebarTriggerProps
>(
  (
    {
      className,
      children,
      side = "left",
      mobileOnly = true,
      "aria-label": ariaLabel,
      onClick,
      ...props
    },
    ref,
  ) => {
    const { toggleSidebar } = useDashboard();

    return (
      <Button
        ref={ref}
        variant={"ghost"}
        aria-label={ariaLabel ?? `Abrir sidebar ${side}`}
        className={cn("size-9", mobileOnly && "md:hidden", className)}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) {
            toggleSidebar(side);
          }
        }}
        {...props}
      >
        {children ?? <Menu className="size-4" />}
      </Button>
    );
  },
);
DashboardSidebarTrigger.displayName = "DashboardSidebarTrigger";

type DashboardSidebarCloseProps =
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    side?: DashboardSide;
  };

const DashboardSidebarClose = React.forwardRef<
  HTMLButtonElement,
  DashboardSidebarCloseProps
>(
  (
    {
      className,
      children,
      side = "left",
      "aria-label": ariaLabel,
      onClick,
      ...props
    },
    ref,
  ) => {
    const { setSidebarOpen } = useDashboard();

    return (
      <button
        ref={ref}
        type="button"
        aria-label={ariaLabel ?? `Fechar sidebar ${side}`}
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 md:hidden",
          className,
        )}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) {
            setSidebarOpen(side, false);
          }
        }}
        {...props}
      >
        {children ?? <X className="size-4" />}
      </button>
    );
  },
);
DashboardSidebarClose.displayName = "DashboardSidebarClose";

type DashboardComponent = typeof DashboardRoot & {
  Header: typeof DashboardHeader;
  Body: typeof DashboardBody;
  Content: typeof DashboardContent;
  Main: typeof DashboardContent;
  Footer: typeof DashboardFooter;
  Sidebar: typeof DashboardSidebar;
  SidebarHeader: typeof DashboardSidebarHeader;
  SidebarContent: typeof DashboardSidebarContent;
  SidebarFooter: typeof DashboardSidebarFooter;
  SidebarTrigger: typeof DashboardSidebarTrigger;
  SidebarClose: typeof DashboardSidebarClose;
};

const Dashboard = Object.assign(DashboardRoot, {
  Header: DashboardHeader,
  Body: DashboardBody,
  Content: DashboardContent,
  Main: DashboardContent,
  Footer: DashboardFooter,
  Sidebar: DashboardSidebar,
  SidebarHeader: DashboardSidebarHeader,
  SidebarContent: DashboardSidebarContent,
  SidebarFooter: DashboardSidebarFooter,
  SidebarTrigger: DashboardSidebarTrigger,
  SidebarClose: DashboardSidebarClose,
}) as DashboardComponent;

const DashboardShell = Dashboard;

export {
  Dashboard,
  DashboardShell,
  DashboardRoot,
  DashboardHeader,
  DashboardBody,
  DashboardContent,
  DashboardFooter,
  DashboardSidebar,
  DashboardSidebarHeader,
  DashboardSidebarContent,
  DashboardSidebarFooter,
  DashboardSidebarTrigger,
  DashboardSidebarClose,
};
