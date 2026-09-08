import { type ReactNode } from "react";

type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  centered?: boolean;
  className?: string;
};

export function SectionHeader({
  eyebrow,
  title,
  description,
  icon,
  centered = true,
  className = "",
}: SectionHeaderProps) {
  return (
    <div className={`${centered ? "text-center mx-auto" : ""} max-w-3xl ${className}`}>
      {eyebrow && (
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.3em] text-primary/70">
          {eyebrow}
        </p>
      )}

      <div className={`flex items-center gap-3 ${centered ? "justify-center" : ""}`}>
        {icon && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-2 text-primary">
            {icon}
          </div>
        )}

        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          {title}
        </h2>
      </div>

      {description && (
        <p className="mt-3 text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}