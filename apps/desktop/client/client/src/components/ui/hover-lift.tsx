import { type ReactNode } from "react";

type HoverLiftProps = {
  children: ReactNode;
  className?: string;
};

export function HoverLift({ children, className = "" }: HoverLiftProps) {
  return (
    <div
      className={`
        transition-all duration-300 ease-out
        hover:-translate-y-1 hover:scale-[1.01]
        hover:drop-shadow-[0_12px_32px_rgba(0,0,0,0.18)]
        ${className}
      `}
    >
      {children}
    </div>
  );
}