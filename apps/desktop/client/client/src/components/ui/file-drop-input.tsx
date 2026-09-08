import * as React from "react";
import { Download } from "lucide-react";

import { cn } from "@/lib/utils";

type FileDropInputProps = Omit<React.ComponentProps<"input">, "type" | "value" | "onChange"> & {
  onFileSelect: (file: File) => void;
  label?: string;
  description?: string;
  icon?: React.ReactNode;
};

export function FileDropInput({
  onFileSelect,
  label = "Escolha um arquivo",
  description = "Clique ou arraste o arquivo aqui.",
  icon,
  accept,
  disabled,
  className,
  ...props
}: FileDropInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const selectFile = React.useCallback((file?: File | null) => {
    if (!file || disabled) return;
    onFileSelect(file);
  }, [disabled, onFileSelect]);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) setIsDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setIsDragging(false);
      }}
      onDrop={handleDrop}
      className={cn(
        "group flex min-h-40 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border/70 bg-background/40 p-5 text-center shadow-xs transition-[border-color,background-color,box-shadow] sm:min-h-52 sm:p-6",
        "hover:border-primary/60 hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
        isDragging && "border-primary bg-primary/5 ring-primary/20 ring-2",
        disabled && "pointer-events-none cursor-not-allowed opacity-50",
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          selectFile(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
        {...props}
      />
      <span className="flex size-16 shrink-0 items-center justify-center text-muted-foreground transition-colors group-hover:text-primary sm:size-20">
        {icon ?? <Download className="size-12 stroke-[1.5] sm:size-16" />}
      </span>
      <span className="min-w-0 text-sm">
        <span className="font-semibold text-primary underline-offset-4 group-hover:underline">{label}</span>
        <span className="text-muted-foreground"> {description}</span>
      </span>
    </div>
  );
}
