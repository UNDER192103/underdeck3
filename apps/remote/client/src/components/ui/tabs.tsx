import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { VariantProps } from "class-variance-authority";

import { Button, type buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]",
        className
      )}
      {...props}
    />
  );
}

type TabsTriggerProps = React.ComponentProps<typeof TabsPrimitive.Trigger> &
  VariantProps<typeof buttonVariants> & {
    variant?: VariantProps<typeof buttonVariants>["variant"];
    variantSelected?: VariantProps<typeof buttonVariants>["variant"];
    unstyled?: boolean;
  };

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, children, variant = "ghost", variantSelected = "primary", size = "sm", rounded = "md", unstyled = false, ...props }, ref) => {
    const innerRef = React.useRef<HTMLButtonElement>(null);
    const [isActive, setIsActive] = React.useState(false);

    React.useEffect(() => {
      const element = innerRef.current;
      if (!element) return;

      const observer = new MutationObserver(() => {
        setIsActive(element.getAttribute("data-state") === "active");
      });
      observer.observe(element, { attributes: true, attributeFilter: ["data-state"] });
      setIsActive(element.getAttribute("data-state") === "active");

      return () => observer.disconnect();
    }, []);

    const combinedRef = (node: HTMLButtonElement | null) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    };

    return (
      <TabsPrimitive.Trigger data-slot="tabs-trigger" {...props} asChild>
        <Button
          ref={combinedRef}
          variant={isActive ? variantSelected : variant}
          size={size}
          rounded={rounded}
          className={cn(
            !unstyled && "h-[calc(100%-1px)] flex-1 px-2 py-1 transition-[background-color,color,box-shadow,transform] duration-300 ease-out hover:translate-y-0 hover:scale-100 data-[state=active]:shadow-[0_16px_36px_rgba(98,74,156,0.2)] data-[state=active]:ring-1 data-[state=active]:ring-white/10",
            className,
          )}
        >
          {children}
        </Button>
      </TabsPrimitive.Trigger>
    );
  },
);
TabsTrigger.displayName = "TabsTrigger";

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 pt-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
