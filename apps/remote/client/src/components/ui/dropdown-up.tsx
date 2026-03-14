import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type DropdownMode = "automatic" | "fixed";
type DropdownDirection = "up" | "down" | "left" | "right";

function DropdownUp({ ...props }: React.ComponentProps<typeof Popover>) {
    return <Popover {...props} />;
}

function DropdownUpTrigger({ ...props }: React.ComponentProps<typeof PopoverTrigger>) {
    return <PopoverTrigger {...props} />;
}

function DropdownUpContent({
    side,
    align = "start",
    sideOffset = 8,
    mode = "automatic",
    direction = "up",
    collisionPadding = 8,
    ...props
}: React.ComponentProps<typeof PopoverContent> & {
    mode?: DropdownMode;
    direction?: DropdownDirection;
    collisionPadding?: number;
}) {
    const mappedSide =
        side ?? (direction === "up" ? "top" : direction === "down" ? "bottom" : direction);

    return (
        <PopoverContent
            side={mappedSide}
            align={align}
            sideOffset={sideOffset}
            avoidCollisions={mode === "automatic"}
            collisionPadding={collisionPadding}
            {...props}
        />
    );
}

export { DropdownUp, DropdownUpTrigger, DropdownUpContent };
