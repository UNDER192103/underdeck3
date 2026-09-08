import { type ReactNode } from "react";

type GlassCardProps = {
  children: ReactNode;
  className?: string;
};

export function GlassCard({ children, className = "" }: GlassCardProps) {
  return (
    <div
      className={`
        rounded-xl border border-white/10
        bg-background/60 backdrop-blur-xl
        shadow-[0_0_40px_rgba(0,0,0,0.12)]
        ${className}
      `}
    >
      {children}
    </div>
  );
}