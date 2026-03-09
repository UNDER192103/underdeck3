import type { CSSProperties } from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="bottom-center"
      offset={16}
      className="toaster group"
      closeButton
      toastOptions={{
        style: {
          background: "var(--toast-bg, rgba(0, 0, 0, 0.5))",
          color: "var(--toast-foreground, #ffffff)",
          border: "1px solid var(--toast-border, rgba(255, 255, 255, 0.2))",
        },
        classNames: {
          toast: "relative overflow-visible pr-10 !text-inherit",
          title: "!text-inherit",
          description: "!text-inherit",
          closeButton:
            "absolute !left-auto !right-[-10px] !top-0 translate-x-1/3 -translate-y-1/3",
        },
      }}
      style={
        {
          "--normal-bg": "var(--toast-bg, var(--card))",
          "--normal-text": "var(--toast-foreground, var(--card-foreground))",
          "--normal-border": "var(--toast-border, var(--border))",
        } as CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
