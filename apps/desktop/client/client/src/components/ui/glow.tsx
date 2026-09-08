import { type ReactNode } from "react";

type GlowProps = {
  children: ReactNode;
  className?: string;
  color?: "primary" | "red" | "purple" | "blue" | "green" | "white";
  intensity?: "sm" | "md" | "lg";
  pulse?: boolean;
  hover?: boolean;
};

const glowColors = {
  primary: "rgba(168,85,247,0.45)",
  red: "rgba(239,68,68,0.45)",
  purple: "rgba(168,85,247,0.45)",
  blue: "rgba(59,130,246,0.45)",
  green: "rgba(34,197,94,0.45)",
  white: "rgba(255,255,255,0.35)",
};

const glowIntensity = {
  sm: "0 0 12px",
  md: "0 0 22px",
  lg: "0 0 36px",
};

export function Glow({
  children,
  className = "",
  color = "primary",
  intensity = "md",
  pulse = false,
  hover = false,
}: GlowProps) {
  const shadow = `${glowIntensity[intensity]} ${glowColors[color]}`;

  return (
    <div
      style={{
        filter: `drop-shadow(${shadow})`,
      }}
      className={`
        inline-flex
        ${pulse ? "animate-pulse" : ""}
        ${hover ? "transition-transform duration-300 hover:scale-[1.03]" : ""}
        ${className}
      `}
    >
      {children}
    </div>
  );
}