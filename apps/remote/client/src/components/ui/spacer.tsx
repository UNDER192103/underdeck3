import { cn } from "@/lib/utils";
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

const spacerVariants = cva(
  "flex-shrink-0 bg-current opacity-50", // bg-current faz o traço ter a mesma cor do texto
  {
    variants: {
      size: {
        xs: "w-2",
        sm: "w-4",
        md: "w-8",
        lg: "w-12",
      },
      thickness: {
        thin: "h-[1px]",
        medium: "h-[2px]",
      }
    },
    defaultVariants: {
      size: "sm",
      thickness: "thin",
    },
  }
);

interface SpacerProps 
  extends React.HTMLAttributes<HTMLDivElement>, 
    VariantProps<typeof spacerVariants> {}

function Spacer({ size, thickness, className, ...props }: SpacerProps) {
  return (
    <div
      role="separator"
      className={cn(spacerVariants({ size, thickness, className }))}
      {...props}
    />
  );
}

export { Spacer };
