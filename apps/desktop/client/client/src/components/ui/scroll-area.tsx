import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

import { cn } from "@/lib/utils";

function ScrollArea({
  className,
  viewportClassName,
  scrollbarClassName,
  contentClassName,
  children,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  viewportClassName?: string;
  scrollbarClassName?: string;
  contentClassName?: string;
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className={cn(
          "focus-visible:ring-ring/50 size-full min-w-0 max-w-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1 [&>div]:!block [&>div]:!w-full [&>div]:!min-w-0 [&>div]:!max-w-full",
          viewportClassName
        )}
      >
        <div className={cn("min-h-full w-full min-w-0 max-w-full px-0 pt-2 pb-2", contentClassName)}>
          {children}
        </div>
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar className={scrollbarClassName} />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none p-[1px] transition-colors select-none",
        orientation === "vertical" &&
          "absolute top-0 right-0 bottom-0 h-auto w-2 border-l border-l-transparent",
        orientation === "horizontal" &&
          "absolute right-0 bottom-0 left-0 h-2 flex-col border-t border-t-transparent",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="bg-primary/80 hover:bg-primary relative flex-1 rounded-full transition-colors"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

function NativeScrollArea({
  className,
  viewportClassName,
  contentClassName,
  children,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & {
  viewportClassName?: string;
  contentClassName?: string;
}) {
  return (
    <div
      data-slot="native-scroll-area"
      className={cn(
        "gb-native-scroll-area relative min-h-0 w-full min-w-0 max-w-full overflow-auto overscroll-contain",
        viewportClassName,
        className,
      )}
      {...props}
    >
      <div className={cn("min-h-full w-full min-w-0 max-w-full px-0 py-2", contentClassName)}>
        {children}
      </div>
    </div>
  );
}

export { NativeScrollArea, ScrollArea, ScrollBar };
