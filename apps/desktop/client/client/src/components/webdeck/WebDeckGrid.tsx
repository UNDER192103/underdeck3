import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DropdownUp, DropdownUpContent, DropdownUpTrigger } from "@/components/ui/dropdown-up";
import { BackgroundComp } from "@/components/ui/background";
import { cn } from "@/lib/utils";
import { useI18n } from "@/contexts/I18nContext";
import { LayoutGrid, Move, Pencil, Plus, Settings2, Trash2, X } from "lucide-react";

type GridMode = "view" | "edit";
type EmptyStyle = "plus" | "placeholder";

type BaseGridItem = {
  id: string;
  type: string;
};

type WebDeckGridProps<TItem extends BaseGridItem> = {
  pageId: string;
  gridCols: number;
  gridRows: number;
  items: Array<TItem | null>;
  mode: GridMode;
  emptyStyle?: EmptyStyle;
  movingFromIndex?: number | null;
  openDropdownSlot?: number | null;
  onDropdownSlotChange?: (index: number | null) => void;
  onSlotClick: (index: number, item: TItem | null) => void;
  onEditItem?: (index: number, item: TItem) => void;
  onMoveItem?: (index: number, item: TItem) => void;
  onCancelMove?: () => void;
  onRemoveItem?: (index: number, item: TItem) => void;
  canRemoveItem?: (index: number, item: TItem) => boolean;
  canEditItem?: (index: number, item: TItem) => boolean;
  canMoveItem?: (index: number, item: TItem) => boolean;
  resolveItemLabel: (item: TItem) => string;
  resolveItemBackground?: (item: TItem) => string | null;
  emptyLabel?: string;
  fillHeight?: boolean;
};

export function WebDeckGrid<TItem extends BaseGridItem>({
  pageId,
  gridCols,
  gridRows,
  items,
  mode,
  emptyStyle,
  movingFromIndex = null,
  openDropdownSlot = null,
  onDropdownSlotChange,
  onSlotClick,
  onEditItem,
  onMoveItem,
  onCancelMove,
  onRemoveItem,
  canRemoveItem,
  canEditItem,
  canMoveItem,
  resolveItemLabel,
  resolveItemBackground,
  emptyLabel = "Vazio",
  fillHeight = false,
}: WebDeckGridProps<TItem>) {
  const { t } = useI18n();
  const slotCount = Math.max(1, gridCols * gridRows);
  const gridTemplateColumns = `repeat(${Math.max(1, gridCols)}, minmax(0, 1fr))`;
  // Same visual structure in both modes; mode changes dropdown visibility and default empty style.
  const computedEmptyStyle: EmptyStyle = emptyStyle ?? (mode === "edit" ? "plus" : "placeholder");

  return (
    <div
      className={cn("grid gap-2", fillHeight && "h-full min-h-0")}
      style={{
        gridTemplateColumns,
        ...(fillHeight ? { gridTemplateRows: `repeat(${Math.max(1, gridRows)}, minmax(0, 1fr))` } : {}),
      }}
    >
      {Array.from({ length: slotCount }, (_, index) => {
        const item = items[index] ?? null;
        const background = item && resolveItemBackground ? resolveItemBackground(item) : null;

        const allowEdit = item ? (canEditItem ? canEditItem(index, item) : true) : false;
        const allowMove = item ? (canMoveItem ? canMoveItem(index, item) : true) : false;
        const allowRemove = item ? (canRemoveItem ? canRemoveItem(index, item) : true) : false;
        const showDropdown = mode === "edit" && item && (onEditItem || onMoveItem || onRemoveItem);
        const isMovingSource = movingFromIndex === index;
        const isMoveDestination = movingFromIndex !== null && !isMovingSource;

        return (
          <Card
            key={`${pageId}-slot-${index}`}
            onContextMenu={(event) => {
              if (!showDropdown) return;
              event.preventDefault();
              onDropdownSlotChange?.(index);
            }}
            className={cn(
              "relative border-border/70 overflow-hidden more-dark group cursor-pointer",
              fillHeight ? "h-full min-h-0" : "h-full min-h-[150px]",
              item ? "bg-card/70" : "bg-card/40",
              isMovingSource && "animate-pulse border-fuchsia-400 ring-2 ring-fuchsia-500",
              isMoveDestination && "border-primary/70 ring-2 ring-primary/50"
            )}
          >
            {background ? (
              <BackgroundComp
                variant="image"
                imageSrc={background}
                fullScreen={false}
                className="absolute inset-0  group-hover:scale-115 transition-transform duration-300 ease-out"
                overlayClassName="bg-black/45"
              />
            )
              :
              item ? (
                <div className="h-full w-full group-hover:scale-115 transition-transform duration-300 ease-out">
                  <div className="h-full w-full flex flex-col items-center justify-center gap-1 text-muted-foreground">
                    <LayoutGrid className="h-4 w-4 opacity-75" />
                    <span className="text-xs">{emptyLabel}</span>
                  </div>
                </div>
              )
                : null
            }
            {isMoveDestination ? (
              <div aria-hidden className="pointer-events-none absolute inset-0 z-[5] bg-primary/20" />
            ) : null}
            {isMovingSource ? (
              <div aria-hidden className="pointer-events-none absolute inset-0 z-[5] bg-fuchsia-500/15" />
            ) : null}
            <div className="absolute inset-0 z-10">
              {!item ? (
                <div className="absolute inset-0 flex items-center justify-center p-2" onClick={() => onSlotClick(index, item)}>
                  {computedEmptyStyle === "plus" ? (
                    <Button type="button" rounded="full" className="group-hover:scale-115 transition-transform duration-300 ease-out" size="icon">
                      <Plus className="h-4 w-4" />
                    </Button>
                  ) : (
                    <button type="button" className="h-full w-full">
                      <div className="h-full w-full flex flex-col items-center justify-center gap-1 text-muted-foreground">
                        <LayoutGrid className="h-4 w-4 opacity-75" />
                        <span className="text-xs">{emptyLabel}</span>
                      </div>
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className="absolute inset-0 w-full h-full p-2 text-left"
                  onClick={() => onSlotClick(index, item)}
                >
                  <div className="h-full flex flex-col justify-end">
                    <p className="font-medium truncate">{resolveItemLabel(item)}</p>
                    <p className="text-xs truncate">{item.type.toUpperCase()}</p>
                  </div>
                </button>
              )}

              {/*<p className="absolute top-2 left-2 text-xs z-20">#{index + 1}</p>*/}

              {showDropdown ? (
                <div className="absolute top-2 right-2 z-20" onClick={(e) => e.preventDefault()}>
                  <DropdownUp open={openDropdownSlot === index} onOpenChange={(open) => onDropdownSlotChange?.(open ? index : null)}>
                    <DropdownUpTrigger asChild>
                      <button type="button" className="group/gear inline-flex h-7 w-7 items-center justify-center rounded-full border-none bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/55">
                        <Settings2 className="h-4 w-4 transition-transform duration-300 group-hover/gear:rotate-45" />
                      </button>
                    </DropdownUpTrigger>
                    <DropdownUpContent mode="automatic" direction="down" align="end" className="w-50 gap-1 rounded-xl border-border/70 bg-popover/95 p-1 shadow-xl backdrop-blur-md transparent:bg-black/85 select-none">
                      {onEditItem ? (
                        <Button type="button" variant="ghost-secondary" rounded="xl" className="w-full" disabled={!allowEdit} onClick={() => item && onEditItem(index, item)}>
                          <Pencil />
                          Editar
                        </Button>
                      ) : null}
                      {onMoveItem ? (
                        <Button
                          type="button"
                          variant="ghost-secondary"
                          rounded="xl"
                          className="w-full"
                          disabled={!isMovingSource && (movingFromIndex !== null || !allowMove)}
                          onClick={() => {
                            if (!item) return;
                            if (isMovingSource) {
                              onCancelMove?.();
                              return;
                            }
                            onMoveItem(index, item);
                          }}
                        >
                          {isMovingSource ? <X /> : <Move />}
                          {isMovingSource
                            ? t("webdeck.item.move.cancel", "Cancelar movimentação")
                            : t("webdeck.item.move", "Mover")}
                        </Button>
                      ) : null}
                      {onRemoveItem ? (
                        <Button type="button" variant="ghost-destructive" rounded="xl" className="w-full" disabled={!allowRemove} onClick={() => item && onRemoveItem(index, item)}>
                          <Trash2 />
                          Remover
                        </Button>
                      ) : null}
                    </DropdownUpContent>
                  </DropdownUp>
                </div>
              ) : null}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
