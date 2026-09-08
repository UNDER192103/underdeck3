import { type ReactNode } from "react";

type GradientBorderProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  animated?: boolean;
};

export function GradientBorder({
  children,
  className = "",
  contentClassName = "",
  animated = false,
}: GradientBorderProps) {
  return (
    <div
      className={`
        relative rounded-xl p-[1px]
        bg-gradient-to-r from-primary/60 via-purple-500/60 to-primary/60
        ${animated ? "bg-[length:200%_200%] animate-pulse" : ""}
        ${className}
      `}
    >
      <div className={`rounded-[calc(theme(borderRadius.xl)-1px)] bg-background ${contentClassName}`}>
        {children}
      </div>
    </div>
  );
}