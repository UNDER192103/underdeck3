import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
    Command,
    CommandGroup,
    CommandItem,
} from "@/components/ui/command";
import { Command as CommandPrimitive } from "cmdk";

const multiSelectVariants = cva(
    "m-1 transition-all duration-300", {
    variants: {
        variant: {
            default: "border-foreground ",
            secondary:"border-secondary text-secondary-foreground hover:bg-secondary/80",
            destructive: "border-destructive text-destructive-foreground hover:bg-destructive/80",
            success: "border-green-500/50 text-green-500",
        },
    },
    defaultVariants: {
        variant: "default",
    },
});

interface MultiSelectProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof multiSelectVariants> {
    placeholder?: string;
    options: {
        label: string;
        value: string;
        icon?: React.ComponentType<{ className?: string }>;
    }[];
    value: string[];
    onValueChange: (value: string[]) => void;
    disabled?: boolean;
    maxCount?: number;
}

const MultiSelect = React.forwardRef<HTMLDivElement, MultiSelectProps>(({
    className,
    placeholder,
    options,
    value,
    onValueChange,
    variant,
    disabled = false,
    maxCount = 5,
    ...props
}, ref) => {

    const [inputValue, setInputValue] = React.useState("");
    const [open, setOpen] = React.useState(false);
    const [selected, setSelected] = React.useState<string[]>(value);
    
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        setSelected(value);
    }, [value]);

    const handleSelect = (val: string) => {
        if (selected.includes(val)) {
            const newSelected = selected.filter(s => s !== val);
            setSelected(newSelected);
            onValueChange(newSelected);
        } else {
            if (selected.length < maxCount) {
                const newSelected = [...selected, val];
                setSelected(newSelected);
                onValueChange(newSelected);
            }
        }
        setInputValue("");
    }

    const handleRemove = (val: string) => {
        const newSelected = selected.filter(s => s !== val);
        setSelected(newSelected);
        onValueChange(newSelected);
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const input = inputRef.current
        if (input) {
            if (e.key === "Delete" || e.key === "Backspace") {
                if (input.value === "") {
                    const newSelected = [...selected];
                    newSelected.pop();
                    setSelected(newSelected);
                    onValueChange(newSelected);
                }
            }
            if (e.key === "Escape") {
                input.blur();
            }
        }
    };

    const selectedOptions = options.filter(option => selected.includes(option.value));
    const unselectedOptions = options.filter(option => !selected.includes(option.value));

    return (
        <Command onKeyDown={handleKeyDown} className={cn("overflow-visible bg-transparent", className)}>
            <div className="group rounded-md border border-input px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                <div className="flex flex-wrap gap-1">
                    {selectedOptions.map((option) => {
                        return (
                            <Badge key={option.value} className={cn(multiSelectVariants({ variant }))}>
                                {option.label}
                                <button
                                    className="ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            handleRemove(option.value);
                                        }
                                    }}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                    }}
                                    onClick={() => handleRemove(option.value)}
                                >
                                    <X className="h-3 w-3 text-black-500 hover:text-foreground" />
                                </button>
                            </Badge>
                        )
                    })}
                    <CommandPrimitive.Input
                        ref={inputRef}
                        value={inputValue}
                        onValueChange={setInputValue}
                        onBlur={() => setOpen(false)}
                        onFocus={() => setOpen(true)}
                        placeholder={placeholder}
                        className="ml-2 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
                        disabled={disabled || selected.length >= maxCount}
                    />
                </div>
            </div>
            <div className="relative mt-2">
                {open && unselectedOptions.length > 0 ?
                    <div className="absolute top-0 z-10 w-full rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in">
                        <CommandGroup className="h-full overflow-auto">
                            {unselectedOptions.map((option) => {
                                return (
                                    <CommandItem
                                        key={option.value}
                                        value={option.value}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                        }}
                                        onSelect={() => handleSelect(option.value)}
                                        className={"cursor-pointer"}
                                    >
                                        {option.label}
                                    </CommandItem>
                                )
                            })}
                        </CommandGroup>
                    </div>
                    : null
                }
            </div>
        </Command>
    );
});

MultiSelect.displayName = "MultiSelect";

export { MultiSelect };