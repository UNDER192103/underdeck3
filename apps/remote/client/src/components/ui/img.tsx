import { useDialogComposition } from "@/components/ui/dialog";
import { useComposition } from "@/hooks/useComposition";
import { cn } from "@/lib/utils";
import * as React from "react";
import { Button } from '@/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';

import { cva, type VariantProps } from "class-variance-authority";

const imgVariants = cva(
  "",
  {
    variants: {
      size: {
        default: "h-10 w-10 object-cover",
        full: "h-full w-full object-cover",
        avatar: "h-23 w-23 object-cover border",
        "avatar-sm": "h-13 w-13 object-cover border",
        "avatar-dropdown": "h-18 w-18 object-cover border",
        banner: "h-full w-full object-cover",
        "user-banner": "h-36 w-full object-cover"
      },
      rounded: {
        default: "",
        md: "rounded-md",
        sm: "rounded-sm",
        lg: "rounded-lg",
        xl: "rounded-xl",
        full: "rounded-full"
      },
    },
    defaultVariants: {
      size: "default",
      rounded: "default",
    },
  }
);

function Img({
  size,
  rounded,
  className,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  ...props
}: React.ComponentProps<"img"> & VariantProps<typeof imgVariants>) {
  return (
    <img
      data-slot="input"
      {...props}
      className={
        cn(imgVariants({ size, rounded, className }))
      }
    />
  );
}

export { Img };
