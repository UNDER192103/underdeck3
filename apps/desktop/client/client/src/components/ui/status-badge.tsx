type StatusBadgeProps = {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "beta";
  pulse?: boolean;
  className?: string;
};

const variants = {
  default: "border-primary/30 bg-primary/10 text-primary",
  success: "border-green-500/30 bg-green-500/10 text-green-400",
  warning: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
  danger: "border-red-500/30 bg-red-500/10 text-red-400",
  beta: "border-purple-500/30 bg-purple-500/10 text-purple-400",
};

export function StatusBadge({
  children,
  variant = "default",
  pulse = false,
  className = "",
}: StatusBadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-2 rounded-full border px-3 py-1
        text-xs font-medium uppercase tracking-wide
        ${variants[variant]}
        ${className}
      `}
    >
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
        </span>
      )}

      {children}
    </span>
  );
}