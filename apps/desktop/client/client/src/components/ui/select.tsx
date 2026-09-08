import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const EMPTY_SELECT_VALUE = "__ay_select_empty_value__";

function toRadixSelectValue(value: string | undefined): string | undefined {
  return value === "" ? EMPTY_SELECT_VALUE : value;
}

function fromRadixSelectValue(value: string): string {
  return value === EMPTY_SELECT_VALUE ? "" : value;
}

const roundedClassByVariant = {
  default: "rounded-lg",
  md: "rounded-md",
  sm: "rounded-sm",
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
} as const;

type SelectSearchContextValue = {
  enabled: boolean;
  query: string;
};

const SelectSearchContext = React.createContext<SelectSearchContextValue>({
  enabled: false,
  query: "",
});

function extractText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join(" ");
  if (React.isValidElement(node)) {
    const element = node as React.ReactElement<{ children?: React.ReactNode }>;
    return extractText(element.props.children);
  }
  return "";
}

function Select({
  value,
  defaultValue,
  onValueChange,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return (
    <SelectPrimitive.Root
      data-slot="select"
      value={toRadixSelectValue(value)}
      defaultValue={toRadixSelectValue(defaultValue)}
      onValueChange={
        onValueChange
          ? (nextValue) => onValueChange(fromRadixSelectValue(nextValue))
          : undefined
      }
      {...props}
    />
  );
}

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue({
  placeholder = "Selecione uma opção...",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" placeholder={placeholder} {...props} />;
}

interface SelectTriggerProps extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> {
  hideIcon?: boolean;
}
//file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 w-full min-w-0 border border-border/70 bg-transparent px-3 py-1 text-base shadow-xs transition-[border-color,color,box-shadow] outline-none file:inline-flex file:h-full file:items-center file:border-0 file:bg-transparent file:px-3 file:py-0 file:text-inherit file:font-medium file:leading-[inherit] file:mr-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm hover:border-border focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive
const selectVariants = cva(
  "[&_svg:not([class*='text-'])]:text-foreground focus-visible:border-ring selection:bg-primary selection:text-primary-foreground dark:bg-input/30 focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:hover:bg-input/50 flex w-fit items-center justify-between gap-2 border border-border/70 bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[border-color,color,box-shadow] outline-none hover:border-border focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 w-full",
  {
    variants: {
      size: {
        default: "h-10",
        sm: "h-8",
        lg: "h-10",
        xl: "h-12",
      },
      rounded: {
        default: "rounded-lg",
        md: "rounded-md",
        sm: "rounded-sm",
        lg: "rounded-lg",
        xl: "rounded-xl",
        full: "rounded-full",
      },
    },
    defaultVariants: {
      size: "default",
      rounded: "default",
    },
  }
);

const selectContentVariants = cva(
  "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-(--radix-select-content-available-height) w-full origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto border shadow-md",
  {
    variants: {
      rounded: {
        default: "rounded-lg",
        md: "rounded-md",
        sm: "rounded-sm",
        lg: "rounded-lg",
        xl: "rounded-xl",
        full: "rounded-full",
      },
    },
    defaultVariants: {
      rounded: "default",
    },
  }
);

const selectItemVariants = cva(
  "focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full min-w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
  {
    variants: {
      rounded: {
        default: "rounded-lg",
        md: "rounded-md",
        sm: "rounded-sm",
        lg: "rounded-lg",
        xl: "rounded-xl",
        full: "rounded-full",
      },
    },
    defaultVariants: {
      rounded: "default",
    },
  }
);

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  SelectTriggerProps &
    VariantProps<typeof selectVariants> & {
      size?: "sm" | "default" | "lg" | "xl";
    }
>(
  (
    {
      className,
      rounded,
      size = "default",
      children,
      hideIcon,
      ...props
    },
    ref,
  ) => {
    return (
      <SelectPrimitive.Trigger
        ref={ref}
        data-slot="select-trigger"
        data-size={size}
        className={cn(selectVariants({ size, rounded, className }))}
        {...props}
      >
        {children}
        {hideIcon ? null : (
          <SelectPrimitive.Icon asChild>
            <ChevronDownIcon className="size-4 opacity-50" />
          </SelectPrimitive.Icon>
        )}
      </SelectPrimitive.Trigger>
    );
  },
);
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

interface SelectContentProps extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> {
  hideCheckedIcon?: boolean;
  seachOption?: boolean;
  searchOption?: boolean;
}

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  SelectContentProps & VariantProps<typeof selectContentVariants>
>(
  (
    {
      rounded,
      className,
      children,
      position = "popper",
      align = "center",
      seachOption = true,
      searchOption,
      ...props
    },
    ref,
  ) => {
    const [query, setQuery] = React.useState("");
    const enableSearch = searchOption ?? seachOption;
    const searchContextValue = React.useMemo(
      () => ({ enabled: enableSearch, query }),
      [enableSearch, query],
    );

    return (
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          ref={ref}
          data-slot="select-content"
          className={cn(
            position === "popper" &&
              "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1 w-[var(--radix-select-trigger-width)] max-w-full",
            selectContentVariants({ rounded, className })
          )}
          position={position}
          align={align}
          {...props}
        >
          <SelectScrollUpButton />

          {enableSearch && (
            <div className="p-2 border-b">
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
                placeholder="Search..."
                className="w-full h-8 rounded-lg border bg-background px-2 text-sm outline-none"
              />
            </div>
          )}

          <SelectSearchContext.Provider value={searchContextValue}>
            <SelectPrimitive.Viewport
              className={cn(
                "p-1",
                position === "popper" &&
                  "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1"
              )}
            >
              {children}
            </SelectPrimitive.Viewport>
          </SelectSearchContext.Provider>

          <SelectScrollDownButton />
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    );
  },
);
SelectContent.displayName = SelectPrimitive.Content.displayName;

function SelectLabel({
  rounded = "default",
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label> &
  VariantProps<typeof selectVariants>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn(
        "text-muted-foreground px-2 py-1.5 text-xs",
        roundedClassByVariant[rounded ?? "default"],
        className
      )}
      {...props}
    />
  );
}

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> &
    VariantProps<typeof selectItemVariants>
>(({ rounded, className, children, value, ...props }, ref) => {
  const { enabled, query } = React.useContext(SelectSearchContext);
  const normalizedQuery = query.trim().toLowerCase();

  const radixValue = value === "" ? EMPTY_SELECT_VALUE : value;

  if (enabled && normalizedQuery.length > 0) {
    const optionText = extractText(children).toLowerCase();
    const optionValue = String(value ?? "").toLowerCase();

    if (!optionText.includes(normalizedQuery) && !optionValue.includes(normalizedQuery)) {
      return null;
    }
  }

  return (
    <SelectPrimitive.Item
      ref={ref}
      data-slot="select-item"
      className={cn(selectItemVariants({ rounded, className }))}
      value={radixValue}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>

      <SelectPrimitive.ItemText className="w-full">
        {children}
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
});
SelectItem.displayName = SelectPrimitive.Item.displayName;

function SelectSeparator({
  rounded = "default",
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator> &
  VariantProps<typeof selectVariants>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn(
        "bg-border pointer-events-none -mx-1 my-1 h-px",
        roundedClassByVariant[rounded ?? "default"],
        className
      )}
      {...props}
    />
  );
}

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton> &
    VariantProps<typeof selectVariants>
>(({ rounded = "default", className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    data-slot="select-scroll-up-button"
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      roundedClassByVariant[rounded ?? "default"],
      className
    )}
    {...props}
  >
    <ChevronUpIcon className="size-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton> &
    VariantProps<typeof selectVariants>
>(({ rounded = "default", className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    data-slot="select-scroll-down-button"
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      roundedClassByVariant[rounded ?? "default"],
      className
    )}
    {...props}
  >
    <ChevronDownIcon className="size-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
