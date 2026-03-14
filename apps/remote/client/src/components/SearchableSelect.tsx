import * as React from "react"
import { Check, ChevronsUpDown, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useI18n } from "@/contexts/I18nContext"

export interface SearchableSelectOption {
  value: string;
  label: string;
  [key: string]: any; // Permite outras propriedades como icon, avatar, etc.
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string | null;
  onSelect: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  isLoading?: boolean;
  loadingMessage?: string;
  triggerClassName?: string;
  contentClassName?: string;
  rounded?: React.ComponentProps<typeof Button>["rounded"];
  renderOption: (option: SearchableSelectOption) => React.ReactNode;
  renderValue: (option: SearchableSelectOption | undefined) => React.ReactNode;
}

export function SearchableSelect({
  options,
  value,
  onSelect,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  disabled = false,
  isLoading = false,
  loadingMessage,
  triggerClassName,
  contentClassName,
  rounded = "xl",
  renderOption,
  renderValue,
}: SearchableSelectProps) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false)
  const selectedOption = options.find((option) => option.value === value);
  const safePlaceholder = placeholder ?? t("select.placeholder", "Selecione uma opcao...");
  const safeSearchPlaceholder = searchPlaceholder ?? t("select.search_placeholder", "Buscar opcao...");
  const safeEmptyMessage = emptyMessage ?? t("select.empty", "Nenhuma opção encontrada.");
  const safeLoadingMessage = loadingMessage ?? t("common.loading", "Carregando...");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          rounded={rounded}
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", triggerClassName)}
          disabled={disabled || isLoading}
        >
          {isLoading ? (<span className="flex items-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{safeLoadingMessage}</span>) : selectedOption ? (renderValue(selectedOption)) : (safePlaceholder)}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[var(--radix-popover-trigger-width)] max-w-full p-0", contentClassName)}>
        <Command>
          <CommandInput placeholder={safeSearchPlaceholder} />
          <CommandList onWheel={(e) => e.stopPropagation()}>
            <CommandEmpty>{safeEmptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem key={option.value} value={`${option.label} ${option.value}`} onSelect={() => { onSelect(option.value); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === option.value ? "opacity-100" : "opacity-0")} />
                  {renderOption(option)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
