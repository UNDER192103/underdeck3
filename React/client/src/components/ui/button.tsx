import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { useTheme } from "@/contexts/ThemeContext";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        primary:
          "bg-primary hover:bg-primary/70 text-primary-foreground focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        success:
          "bg-green-500 text-black hover:bg-green-700",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        link: "text-primary underline-offset-4 hover:underline",
        band: "buttonBrand text-primary-foreground focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40",
        outline:
          "border border-primary/40 bg-transparent text-primary shadow-xs hover:bg-primary/10",
        "outline-default":
          "border border-primary/40 bg-transparent text-primary shadow-xs hover:bg-primary/10",
        "outline-primary":
          "border border-primary/40 bg-transparent text-primary shadow-xs hover:bg-primary/10",
        "outline-secondary":
          "border border-secondary bg-transparent text-secondary-foreground shadow-xs hover:bg-secondary/50",
        "outline-success":
          "border border-green-500/50 bg-transparent text-green-600 shadow-xs hover:bg-green-500/10",
        "outline-destructive":
          "border border-destructive/50 bg-transparent text-destructive shadow-xs hover:bg-destructive/30",
        "outline-band":
          "border border-[var(--brand)]/50 bg-transparent text-[var(--brand)] shadow-xs hover:bg-[var(--brand)]/10",
        ghost:
          "text-primary hover:bg-primary/10 dark:hover:bg-primary/20",
        "ghost-default":
          "text-primary hover:bg-primary/10 dark:hover:bg-primary/20",
        "ghost-primary":
          "text-primary hover:bg-primary/10 dark:hover:bg-primary/20",
        "ghost-secondary":
          "text-secondary-foreground hover:bg-secondary/60",
        "ghost-success":
          "text-green-600 hover:bg-green-500/10",
        "ghost-destructive":
          "text-destructive hover:bg-destructive/30",
        "ghost-band":
          "text-[var(--brand)] hover:bg-[var(--brand)]/10",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
      rounded: {
        default: "rounded-md",
        md: "rounded-md",
        sm: "rounded-sm",
        lg: "rounded-lg",
        xl: "rounded-xl",
        full: "rounded-full"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  rounded,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";
  
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, rounded, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
