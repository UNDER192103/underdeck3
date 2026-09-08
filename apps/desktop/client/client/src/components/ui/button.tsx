import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { GlassWrapper } from "@/components/ui/GlassFilter";

import { cn } from "@/lib/utils";

type ButtonGlowStyle = React.CSSProperties & {
  "--button-glow-x"?: string;
  "--button-glow-y"?: string;
  "--button-glow-opacity"?: number | string;
};

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-300 ease-out disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:-translate-y-0.5 active:translate-y-0 active:scale-100",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_12px_28px_rgba(85,99,242,0.16)] hover:bg-primary/90 hover:shadow-[0_16px_36px_rgba(85,99,242,0.28)]",
        primary:
          "bg-primary text-primary-foreground shadow-[0_12px_28px_rgba(85,99,242,0.16)] hover:bg-primary/80 hover:shadow-[0_16px_36px_rgba(85,99,242,0.28)] focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[var(--button-shadow)] hover:bg-secondary/80 hover:shadow-[var(--button-shadow-hover)]",
        success:
          "bg-green-500 text-black shadow-[var(--button-shadow)] hover:bg-green-700 hover:shadow-[var(--button-shadow-hover)]",
        destructive:
          "bg-destructive text-white hover:bg-destructive/50 hover:shadow-[0_16px_36px_rgba(233,30,99,0.28)] focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        link: "text-primary underline-offset-4 hover:underline",
        band: "buttonBrand text-primary-foreground shadow-[var(--button-shadow)] hover:shadow-[var(--button-shadow-hover)] focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40",
        outline:
          "border border-primary/40 bg-transparent text-black dark:text-white shadow-[var(--button-shadow)] hover:bg-primary/10 light:hover:bg-slate-400/60 hover:border-primary/60 hover:shadow-[var(--button-shadow-hover)]",
        "outline-default":
          "border border-primary/40 bg-transparent text-black dark:text-white shadow-[var(--button-shadow)] hover:bg-primary/10 light:hover:bg-slate-400/60 hover:border-primary/60 hover:shadow-[var(--button-shadow-hover)]",
        "outline-primary":
          "border border-primary/40 bg-transparent text-black dark:text-white shadow-[var(--button-shadow)] hover:bg-primary/10 light:hover:bg-slate-400/60 hover:border-primary/60 hover:shadow-[var(--button-shadow-hover)]",
        "outline-secondary":
          "border border-secondary bg-transparent text-secondary-foreground shadow-[var(--button-shadow)] hover:bg-secondary/50 hover:shadow-[var(--button-shadow-hover)]",
        "outline-success":
          "border border-green-500/50 bg-transparent text-green-600 shadow-[var(--button-shadow)] hover:bg-green-500/10 hover:shadow-[var(--button-shadow-hover)]",
        "outline-destructive":
          "border border-destructive/50 bg-transparent text-destructive shadow-xs hover:bg-destructive/30 hover:shadow-[0_14px_32px_rgba(233,30,99,0.2)]",
        "outline-band":
          "border border-[var(--brand)]/50 bg-transparent text-[var(--brand)] shadow-[var(--button-shadow)] hover:bg-[var(--brand)]/10 hover:shadow-[var(--button-shadow-hover)]",
        "outline-glass":
          "border border-primary/40 bg-transparent text-black dark:text-white shadow-[var(--button-shadow)] hover:bg-primary/10 dark:hover:bg-primary/20 hover:border-primary/60 hover:shadow-[var(--button-shadow-hover)]",
        ghost:
          "bg-transparent text-black dark:text-white hover:bg-primary/10 light:hover:bg-slate-400/60 hover:shadow-[var(--button-shadow-hover)] dark:hover:bg-primary/20",
        "ghost-glass":
          "bg-transparent text-black dark:text-white hover:bg-primary/10 light:hover:bg-slate-400/60 hover:shadow-[var(--button-shadow-hover)] dark:hover:bg-primary/20",
        "ghost-default":
          "bg-transparent text-black dark:text-white hover:bg-primary/10 light:hover:bg-slate-400/60 hover:shadow-[var(--button-shadow-hover)] dark:hover:bg-primary/20",
        "ghost-primary":
          "bg-transparent text-black dark:text-white hover:bg-primary/10 light:hover:bg-slate-400/60 hover:shadow-[var(--button-shadow-hover)] dark:hover:bg-primary/20",
        "ghost-secondary":
          "text-secondary-foreground hover:bg-secondary/60 hover:shadow-[var(--button-shadow-hover)]",
        "ghost-success":
          "text-green-600 hover:bg-green-500/10 hover:shadow-[var(--button-shadow-hover)]",
        "ghost-destructive":
          "text-destructive hover:bg-destructive/30 hover:shadow-[0_12px_28px_rgba(233,30,99,0.16)]",
        "ghost-band":
          "text-[var(--brand)] hover:bg-[var(--brand)]/10 hover:shadow-[var(--button-shadow-hover)]",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        auto: "gap-1.5 px-2 has-[>svg]:px-2.5",
        xl: "h-5 gap-1.5 px-2 has-[>svg]:px-1.5",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 px-6 has-[>svg]:px-4",
        icon: "size-10",
        "icon-ss": "size-5",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
      rounded: {
        default: "rounded-lg",
        md: "rounded-md",
        sm: "rounded-sm",
        lg: "rounded-lg",
        xl: "rounded-xl",
        full: "rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      rounded: "default",
    },
  },
);

const Button = React.forwardRef<HTMLButtonElement, React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    glassMode?: boolean;
  }>(
    ({ className, variant, size, rounded, asChild = false, type, style, onPointerMove, onPointerLeave, children, glassMode = false, ...props }, ref) => {
      const Comp = asChild ? Slot : "button";
      const [glowStyle, setGlowStyle] = React.useState<ButtonGlowStyle>({
        "--button-glow-x": "50%",
        "--button-glow-y": "50%",
        "--button-glow-opacity": 0,
      });

      const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = `${event.clientX - rect.left}px`;
        const y = `${event.clientY - rect.top}px`;

        setGlowStyle((current) => ({
          ...current,
          "--button-glow-x": x,
          "--button-glow-y": y,
          "--button-glow-opacity": 1,
        }));

        onPointerMove?.(event);
      };

      const handlePointerLeave = (event: React.PointerEvent<HTMLButtonElement>) => {
        setGlowStyle((current) => ({
          ...current,
          "--button-glow-opacity": 0,
        }));

        onPointerLeave?.(event);
      };

      const shouldUseGlass = glassMode;
      const button = (
        <Comp
          ref={ref}
          data-slot="button"
          type={asChild ? undefined : (type ?? "button")}
          className={cn(buttonVariants({ variant, size, rounded, className }))}
          style={{ ...glowStyle, ...style }}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          {...props}
        >
          {children}
        </Comp>
      );

      if (!shouldUseGlass) {
        return button;
      }

      return (
        <GlassWrapper
          className={cn(
            "inline-flex overflow-hidden",
            rounded === "default" && "rounded-lg",
            rounded === "md" && "rounded-md",
            rounded === "sm" && "rounded-sm",
            rounded === "lg" && "rounded-lg",
            rounded === "xl" && "rounded-xl",
            rounded === "full" && "rounded-full"
          )}
          contentClassName={cn(
            "h-full",
            rounded === "default" && "rounded-lg",
            rounded === "md" && "rounded-md",
            rounded === "sm" && "rounded-sm",
            rounded === "lg" && "rounded-lg",
            rounded === "xl" && "rounded-xl",
            rounded === "full" && "rounded-full"
          )}
        >
          {button}
        </GlassWrapper>
      );
    }
  );
Button.displayName = "Button";

export { Button, buttonVariants };
