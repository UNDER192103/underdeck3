import * as React from "react";
import { createPortal } from "react-dom";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { normalizeSelectSearchText } from "@/components/SearchableSelect";
import { Badge } from "@/components/ui/badge";
import {
    Command,
    CommandGroup,
    CommandItem,
} from "@/components/ui/command";
import { Command as CommandPrimitive } from "cmdk";
import { Button } from "./button";

const multiSelectVariants = cva(
    "m-1 transition-all duration-300", {
    variants: {
        variant: {
            default: "border-foreground ",
            secondary: "border-secondary text-secondary-foreground hover:bg-secondary/80",
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
    emptyMessage?: string;
    options: {
        label: string;
        value: string;
        color?: string | number;
        icon?: React.ComponentType<{ className?: string }>;
        searchTerms?: string;
        renderOption?: (option: { label: string; value: string; color?: string | number; icon?: React.ComponentType<{ className?: string }>; searchTerms?: string }) => React.ReactNode;
        renderSelectedOption?: (option: { label: string; value: string; color?: string | number; icon?: React.ComponentType<{ className?: string }>; searchTerms?: string }) => React.ReactNode;
    }[];
    value: string[];
    onValueChange: (value: string[]) => void;
    disabled?: boolean;
    maxCount?: number;
    rounded?: React.ComponentProps<typeof Button>["rounded"];
}

const MultiSelect = React.forwardRef<HTMLDivElement, MultiSelectProps>(({
    className,
    placeholder = "Selecione opções...",
    emptyMessage: _emptyMessage,
    options,
    value,
    onValueChange,
    variant,
    disabled = false,
    maxCount = 5,
    rounded = "lg",
    ...props
}, ref) => {

    const [inputValue, setInputValue] = React.useState("");
    const [open, setOpen] = React.useState(false);
    const [selected, setSelected] = React.useState<string[]>(value);
    const [portalReady, setPortalReady] = React.useState(false);
    const [dropdownStyle, setDropdownStyle] = React.useState<React.CSSProperties>({});

    const wrapperRef = React.useRef<HTMLDivElement>(null);
    const dropdownRef = React.useRef<HTMLDivElement>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        setSelected(value);
    }, [value]);

    React.useEffect(() => {
        setPortalReady(true);
    }, []);

    const updateDropdownPosition = React.useCallback(() => {
        if (!wrapperRef.current) return;
        const rect = wrapperRef.current.getBoundingClientRect();
        // A modal disables pointer events everywhere except its content. Keep
        // the list inside that content when present so selecting an item does
        // not become an outside click (and reach a button behind the dialog).
        const dialogContent = wrapperRef.current.closest<HTMLElement>("[data-slot='dialog-content']");
        const dialogRect = dialogContent?.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        const spaceBelow = viewportHeight - rect.bottom - 8;
        const spaceAbove = rect.top - 8;
        const opensUp = spaceBelow < 220 && spaceAbove > spaceBelow;
        const maxHeight = Math.max(140, Math.min(300, opensUp ? spaceAbove : spaceBelow));

        let left = rect.left;
        const width = rect.width;
        if (left + width > viewportWidth - 8) {
            left = Math.max(8, viewportWidth - width - 8);
        }

        setDropdownStyle({
            position: dialogRect ? "absolute" : "fixed",
            left: dialogRect ? left - dialogRect.left : left,
            width,
            top: opensUp ? undefined : dialogRect ? rect.bottom - dialogRect.top + 4 : rect.bottom + 4,
            bottom: opensUp ? (dialogRect ? dialogRect.bottom - rect.top + 4 : viewportHeight - rect.top + 4) : undefined,
            maxHeight,
            zIndex: 60,
        });
    }, []);

    React.useEffect(() => {
        if (!open) return;
        updateDropdownPosition();

        const handler = () => updateDropdownPosition();
        window.addEventListener("resize", handler);
        window.addEventListener("scroll", handler, true);

        return () => {
            window.removeEventListener("resize", handler);
            window.removeEventListener("scroll", handler, true);
        };
    }, [open, selected, inputValue, updateDropdownPosition]);

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
    const portalContainer = wrapperRef.current?.closest<HTMLElement>("[data-slot='dialog-content']") ?? document.body;

    return (
        <Command
            onKeyDown={handleKeyDown}
            filter={(optionValue, search, keywords = []) => {
                const normalizedSearch = normalizeSelectSearchText(search);
                if (!normalizedSearch) return 1;
                return normalizeSelectSearchText([optionValue, ...keywords].join(" ")).includes(normalizedSearch) ? 1 : 0;
            }}
            className={cn(
                "h-auto overflow-visible border border-border/70 bg-transparent shadow-xs transition-[border-color,color,box-shadow] outline-none hover:border-border dark:bg-input/30 dark:hover:bg-input/50",
                rounded === "full" ? "rounded-full" : rounded === "sm" ? "rounded-sm" : rounded === "md" ? "rounded-md" : rounded === "xl" ? "rounded-xl" : "rounded-lg",
                className,
            )}
        >
            <div ref={wrapperRef} className="group rounded-md px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                <div className="flex flex-wrap gap-1">
                    {selectedOptions.map((option) => {
                        return (
                            <Badge
                                key={option.value}
                                className={cn(multiSelectVariants({ variant }), 'border border-input rounded-lg')}
                            >
                                {option.renderSelectedOption ? option.renderSelectedOption(option) : <><div className="w-3 h-3 rounded-full" style={{ backgroundColor: option.color ? `#${option.color.toString(16).padStart(6, '0')}` : '#99aab5' }} />{option.label}</>}
                                <Button
                                    size="icon-ss"
                                    variant="ghost-destructive"
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
                                </Button>
                            </Badge>
                        )
                    })}
                    <CommandPrimitive.Input
                        ref={inputRef}
                        value={inputValue}
                        onValueChange={setInputValue}
                        onBlur={() => setOpen(false)}
                        onFocus={() => {
                            setOpen(true);
                            updateDropdownPosition();
                        }}
                        placeholder={placeholder}
                        className="ml-2 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
                        disabled={disabled || selected.length >= maxCount}
                    />
                </div>
            </div>
            {portalReady && open && unselectedOptions.length > 0
                ? createPortal(
                    <div
                        ref={dropdownRef}
                        style={dropdownStyle}
                        className="pointer-events-auto"
                    >
                        <CommandGroup className="rounded-lg border max-h-[20rem] bg-popover text-popover-foreground shadow-md outline-none animate-in overflow-auto">
                            {unselectedOptions.map((option) => {
                                return (
                                    <CommandItem
                                        key={option.value}
                                        value={option.value}
                                        keywords={[option.label, option.searchTerms ?? ""]}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                        }}
                                        onSelect={() => handleSelect(option.value)}
                                        className={"cursor-pointer"}
                                    >
                                        {option.renderOption ? option.renderOption(option) : <><div className="w-3 h-3 rounded-full" style={{ backgroundColor: option.color ? `#${option.color.toString(16).padStart(6, '0')}` : '#99aab5' }} />{option.label}</>}
                                    </CommandItem>
                                )
                            })}
                        </CommandGroup>
                    </div>,
                    portalContainer
                )
                : null}
        </Command>
    );
});

MultiSelect.displayName = "MultiSelect";

export { MultiSelect };
