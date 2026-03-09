import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type DashboardPagerProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  rounded?: React.ComponentProps<typeof Button>["rounded"];
  className?: string;
  prevLabel?: string;
  nextLabel?: string;
};

export function DashboardPager({
  page,
  totalPages,
  onPageChange,
  rounded = "xl",
  className,
  prevLabel = "Anterior",
  nextLabel = "Proximo",
}: DashboardPagerProps) {
  return (
    <div className={className ?? "flex items-center justify-end gap-2"}>
      <Button
        type="button"
        variant="secondary"
        rounded={rounded}
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
      >
        <ArrowLeft className="h-4 w-4" />
        {prevLabel}
      </Button>
      <span className="text-sm text-muted-foreground">
        {page} / {Math.max(1, totalPages)}
      </span>
      <Button
        type="button"
        variant="secondary"
        rounded={rounded}
        onClick={() => onPageChange(Math.min(Math.max(1, totalPages), page + 1))}
        disabled={page >= totalPages}
      >
        {nextLabel}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
