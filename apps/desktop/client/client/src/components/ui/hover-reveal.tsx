"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*                                    TYPES                                   */
/* -------------------------------------------------------------------------- */

export type HoverRevealAnimation =
  | "fade"
  | "slide"
  | "none";

export type HoverRevealSide =
  | "up"
  | "down"
  | "left"
  | "right";

export type HoverRevealDirection =
  | HoverRevealSide
  | "auto";

export type HoverRevealAlign =
  | "start"
  | "center"
  | "end";

export type HoverRevealSize = {
  width: number;
  height: number;
};

export type HoverRevealRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

export type HoverRevealContextValue = {
  open: boolean;
  triggerSize: HoverRevealSize;
  triggerRect: HoverRevealRect | null;
};

export type HoverRevealProps =
  React.ComponentProps<"div">;

export type HoverRevealTriggerProps =
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    /**
     * Usa diretamente o filho como Trigger.
     *
     * Exemplo:
     *
     * <HoverRevealTrigger asChild>
     *   <img ... />
     * </HoverRevealTrigger>
     */
    asChild?: boolean;
  };

export type HoverRevealContentProps =
  React.HTMLAttributes<HTMLDivElement> & {
    /**
     * Tipo de animação.
     *
     * slide:
     * expande fisicamente width / height.
     *
     * fade:
     * anima somente opacity.
     *
     * none:
     * sem animação.
     *
     * Default:
     * "slide"
     */
    animation?: HoverRevealAnimation;

    /**
     * Direção do Content.
     *
     * Também suporta:
     *
     * direction="auto"
     *
     * Quando auto, o componente escolhe
     * automaticamente a melhor direção
     * baseada no espaço disponível da viewport.
     *
     * Default:
     * "left"
     */
    direction?: HoverRevealDirection;

    /**
     * Alinhamento no eixo perpendicular.
     *
     * left/right:
     *
     * start  = topo
     * center = centro
     * end    = baixo
     *
     * up/down:
     *
     * start  = esquerda
     * center = centro
     * end    = direita
     *
     * Default:
     * "center"
     */
    align?: HoverRevealAlign;

    /**
     * Distância entre Content e Trigger.
     *
     * Default:
     * 0
     */
    sideOffset?: number;

    /**
     * Duração do animation="fade".
     *
     * Default:
     * 500ms
     */
    duration?: number;

    /**
     * Velocidade da expansão/retração.
     *
     * Quanto maior, mais lento.
     *
     * Default:
     * 500ms
     */
    speed?: number;

    /**
     * Curva usada no slide.
     */
    easing?: string;

    /**
     * Faz o Content acompanhar o Trigger
     * no eixo transversal.
     *
     * left/right:
     * min-height = altura do Trigger
     *
     * up/down:
     * min-width = largura do Trigger
     *
     * Default:
     * true
     */
    matchTriggerSize?: boolean;

    /**
     * Classes aplicadas no wrapper externo.
     *
     * Útil para:
     *
     * z-index
     * overflow
     * pointer-events
     */
    wrapperClassName?: string;

    /**
     * Ordem de preferência usada quando
     * direction="auto".
     *
     * Se mais de uma direção couber perfeitamente,
     * a primeira disponível dessa lista será usada.
     *
     * Default:
     *
     * ["right", "left", "down", "up"]
     */
    autoPriority?: HoverRevealSide[];

    /**
     * Distância mínima que o Content tenta
     * manter das bordas da viewport.
     *
     * Default:
     * 8px
     */
    collisionPadding?: number;
  };

export type HoverRevealProjectedRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/* -------------------------------------------------------------------------- */
/*                                   CONTEXT                                  */
/* -------------------------------------------------------------------------- */

export const HoverRevealContext =
  React.createContext<HoverRevealContextValue | null>(
    null
  );

/* -------------------------------------------------------------------------- */
/*                                    HOOK                                    */
/* -------------------------------------------------------------------------- */

export function useHoverReveal() {
  const context =
    React.useContext(HoverRevealContext);

  if (!context) {
    throw new Error(
      "HoverReveal components precisam estar dentro de <HoverReveal>."
    );
  }

  return context;
}

/* -------------------------------------------------------------------------- */
/*                                SLOT MERGE                                  */
/* -------------------------------------------------------------------------- */

export function mergeHoverRevealSlotProps(
  parentProps: Record<string, any>,
  childProps: Record<string, any>
) {
  const mergedProps: Record<string, any> = {
    ...parentProps,
    ...childProps,
  };

  const keys = new Set([
    ...Object.keys(parentProps),
    ...Object.keys(childProps),
  ]);

  for (const key of keys) {
    const parentValue =
      parentProps[key];

    const childValue =
      childProps[key];

    if (
      /^on[A-Z]/.test(key) &&
      typeof parentValue === "function" &&
      typeof childValue === "function"
    ) {
      mergedProps[key] = (...args: any[]) => {
        childValue(...args);

        if (!args[0]?.defaultPrevented) {
          parentValue(...args);
        }
      };

      continue;
    }

    if (key === "className") {
      mergedProps.className = cn(
        parentValue,
        childValue
      );

      continue;
    }

    if (key === "style") {
      mergedProps.style = {
        ...parentValue,
        ...childValue,
      };
    }
  }

  return mergedProps;
}

/* -------------------------------------------------------------------------- */
/*                                    ROOT                                    */
/* -------------------------------------------------------------------------- */

export function HoverReveal({
  className,
  children,
  onMouseEnter,
  onMouseLeave,
  ...props
}: HoverRevealProps) {
  const rootRef =
    React.useRef<HTMLDivElement>(null);

  const [open, setOpen] =
    React.useState(false);

  const [triggerSize, setTriggerSize] =
    React.useState<HoverRevealSize>({
      width: 0,
      height: 0,
    });

  const [triggerRect, setTriggerRect] =
    React.useState<HoverRevealRect | null>(
      null
    );

  /**
   * Mede posição + tamanho do Trigger.
   *
   * A posição é necessária para:
   *
   * direction="auto"
   */
  const measureTrigger =
    React.useCallback(() => {
      const root =
        rootRef.current;

      if (!root) {
        return;
      }

      const trigger =
        root.querySelector<HTMLElement>(
          '[data-slot="hover-reveal-trigger"]'
        );

      if (!trigger) {
        return;
      }

      const rect =
        trigger.getBoundingClientRect();

      setTriggerSize({
        width: rect.width,
        height: rect.height,
      });

      setTriggerRect({
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    }, []);

  /**
   * Mantém a posição atualizada caso:
   *
   * - viewport seja redimensionada
   * - algum container seja scrollado
   * - Trigger mude de tamanho
   */
  React.useLayoutEffect(() => {
    const root =
      rootRef.current;

    if (!root) {
      return;
    }

    const trigger =
      root.querySelector<HTMLElement>(
        '[data-slot="hover-reveal-trigger"]'
      );

    if (!trigger) {
      return;
    }

    measureTrigger();

    const resizeObserver =
      new ResizeObserver(() => {
        measureTrigger();
      });

    resizeObserver.observe(trigger);

    window.addEventListener(
      "resize",
      measureTrigger
    );

    /**
     * true:
     *
     * também detecta scroll de containers
     * internos e não apenas window.
     */
    window.addEventListener(
      "scroll",
      measureTrigger,
      true
    );

    return () => {
      resizeObserver.disconnect();

      window.removeEventListener(
        "resize",
        measureTrigger
      );

      window.removeEventListener(
        "scroll",
        measureTrigger,
        true
      );
    };
  }, [
    children,
    measureTrigger,
  ]);

  return (
    <HoverRevealContext.Provider
      value={{
        open,
        triggerSize,
        triggerRect,
      }}
    >
      <div
        ref={rootRef}

        data-slot="hover-reveal"

        data-state={
          open
            ? "open"
            : "closed"
        }

        className={cn(
          "group group/hover-reveal",

          "relative inline-flex",

          "overflow-visible",

          /**
           * Eleva todo o sistema quando aberto.
           */
          open && "z-50",

          className
        )}

        onMouseEnter={(event) => {
          onMouseEnter?.(event);

          if (!event.defaultPrevented) {
            /**
             * Atualiza a posição imediatamente
             * antes de abrir.
             */
            measureTrigger();

            setOpen(true);
          }
        }}

        onMouseLeave={(event) => {
          onMouseLeave?.(event);

          if (!event.defaultPrevented) {
            setOpen(false);
          }
        }}

        {...props}
      >
        {children}
      </div>
    </HoverRevealContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   TRIGGER                                  */
/* -------------------------------------------------------------------------- */

export function HoverRevealTrigger({
  asChild = false,
  className,
  children,
  ...props
}: HoverRevealTriggerProps) {
  const triggerProps = {
    ...props,

    "data-slot":
      "hover-reveal-trigger",

    className: cn(
      "relative z-30 shrink-0",

      className
    ),
  };

  if (asChild) {
    const child =
      React.Children.only(children);

    if (!React.isValidElement(child)) {
      throw new Error(
        "HoverRevealTrigger com asChild precisa receber exatamente um elemento React."
      );
    }

    const element =
      child as React.ReactElement<
        Record<string, any>
      >;

    return React.cloneElement(
      element,
      mergeHoverRevealSlotProps(
        triggerProps,
        element.props
      )
    );
  }

  return (
    <button
      type="button"
      {...triggerProps}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                              POSITION CLASSES                              */
/* -------------------------------------------------------------------------- */

export const hoverRevealPositionClasses: Record<
  HoverRevealSide,
  Record<HoverRevealAlign, string>
> = {
  left: {
    start:
      "right-full top-0",

    center:
      "right-full top-1/2 -translate-y-1/2",

    end:
      "right-full bottom-0",
  },

  right: {
    start:
      "left-full top-0",

    center:
      "left-full top-1/2 -translate-y-1/2",

    end:
      "left-full bottom-0",
  },

  up: {
    start:
      "bottom-full left-0",

    center:
      "bottom-full left-1/2 -translate-x-1/2",

    end:
      "bottom-full right-0",
  },

  down: {
    start:
      "top-full left-0",

    center:
      "top-full left-1/2 -translate-x-1/2",

    end:
      "top-full right-0",
  },
};

/* -------------------------------------------------------------------------- */
/*                                   HELPERS                                  */
/* -------------------------------------------------------------------------- */

export function isHoverRevealHorizontal(
  direction: HoverRevealSide
) {
  return (
    direction === "left" ||
    direction === "right"
  );
}

/**
 * Calcula o tamanho final do Content
 * para uma determinada direção.
 */
export function getHoverRevealResolvedSize(
  direction: HoverRevealSide,
  naturalSize: HoverRevealSize,
  triggerSize: HoverRevealSize,
  matchTriggerSize: boolean
): HoverRevealSize {
  const horizontal =
    isHoverRevealHorizontal(direction);

  if (horizontal) {
    return {
      width:
        naturalSize.width,

      height:
        Math.max(
          naturalSize.height,

          matchTriggerSize
            ? triggerSize.height
            : 0
        ),
    };
  }

  return {
    width:
      Math.max(
        naturalSize.width,

        matchTriggerSize
          ? triggerSize.width
          : 0
      ),

    height:
      naturalSize.height,
  };
}

/**
 * Calcula onde o wrapper ficaria na viewport
 * caso uma determinada direção fosse usada.
 */
export function getHoverRevealProjectedRect({
  direction,
  align,
  triggerRect,
  contentSize,
  sideOffset,
}: {
  direction: HoverRevealSide;
  align: HoverRevealAlign;
  triggerRect: HoverRevealRect;
  contentSize: HoverRevealSize;
  sideOffset: number;
}): HoverRevealProjectedRect {
  const horizontal =
    isHoverRevealHorizontal(direction);

  const totalWidth =
    contentSize.width +
    (
      horizontal
        ? sideOffset
        : 0
    );

  const totalHeight =
    contentSize.height +
    (
      !horizontal
        ? sideOffset
        : 0
    );

  let top = 0;
  let left = 0;

  /**
   * -------------------------------------------------------
   * LEFT / RIGHT
   * -------------------------------------------------------
   */
  if (horizontal) {
    if (direction === "left") {
      left =
        triggerRect.left -
        totalWidth;
    } else {
      left =
        triggerRect.right;
    }

    switch (align) {
      case "start":
        top =
          triggerRect.top;
        break;

      case "center":
        top =
          triggerRect.top +
          triggerRect.height / 2 -
          totalHeight / 2;
        break;

      case "end":
        top =
          triggerRect.bottom -
          totalHeight;
        break;
    }
  }

  /**
   * -------------------------------------------------------
   * UP / DOWN
   * -------------------------------------------------------
   */
  else {
    if (direction === "up") {
      top =
        triggerRect.top -
        totalHeight;
    } else {
      top =
        triggerRect.bottom;
    }

    switch (align) {
      case "start":
        left =
          triggerRect.left;
        break;

      case "center":
        left =
          triggerRect.left +
          triggerRect.width / 2 -
          totalWidth / 2;
        break;

      case "end":
        left =
          triggerRect.right -
          totalWidth;
        break;
    }
  }

  return {
    top,

    left,

    right:
      left + totalWidth,

    bottom:
      top + totalHeight,
  };
}

/**
 * Calcula quanto determinado posicionamento
 * sairia para fora da viewport.
 *
 * 0:
 * cabe perfeitamente.
 *
 * Quanto maior:
 * pior.
 */
export function getHoverRevealOverflowScore({
  rect,
  viewportWidth,
  viewportHeight,
  collisionPadding,
}: {
  rect: HoverRevealProjectedRect;
  viewportWidth: number;
  viewportHeight: number;
  collisionPadding: number;
}) {
  const overflowLeft =
    Math.max(
      0,
      collisionPadding -
        rect.left
    );

  const overflowRight =
    Math.max(
      0,
      rect.right -
        (
          viewportWidth -
          collisionPadding
        )
    );

  const overflowTop =
    Math.max(
      0,
      collisionPadding -
        rect.top
    );

  const overflowBottom =
    Math.max(
      0,
      rect.bottom -
        (
          viewportHeight -
          collisionPadding
        )
    );

  return (
    overflowLeft +
    overflowRight +
    overflowTop +
    overflowBottom
  );
}

/**
 * Escolhe automaticamente a melhor direção.
 */
export function getHoverRevealAutoDirection({
  triggerRect,
  triggerSize,
  naturalSize,
  align,
  sideOffset,
  matchTriggerSize,
  collisionPadding,
  priority,
}: {
  triggerRect: HoverRevealRect | null;
  triggerSize: HoverRevealSize;
  naturalSize: HoverRevealSize;
  align: HoverRevealAlign;
  sideOffset: number;
  matchTriggerSize: boolean;
  collisionPadding: number;
  priority: HoverRevealSide[];
}): HoverRevealSide {
  /**
   * SSR ou primeira renderização antes
   * da medição.
   */
  if (
    typeof window === "undefined" ||
    !triggerRect
  ) {
    return priority[0] ?? "right";
  }

  const viewportWidth =
    window.innerWidth;

  const viewportHeight =
    window.innerHeight;

  let bestDirection:
    HoverRevealSide =
      priority[0] ?? "right";

  let bestScore =
    Number.POSITIVE_INFINITY;

  for (const candidate of priority) {
    const contentSize =
      getHoverRevealResolvedSize(
        candidate,
        naturalSize,
        triggerSize,
        matchTriggerSize
      );

    const projectedRect =
      getHoverRevealProjectedRect({
        direction: candidate,
        align,
        triggerRect,
        contentSize,
        sideOffset,
      });

    const score =
      getHoverRevealOverflowScore({
        rect:
          projectedRect,

        viewportWidth,

        viewportHeight,

        collisionPadding,
      });

    /**
     * Achamos uma direção que cabe
     * 100% na viewport.
     *
     * Como estamos percorrendo pela ordem
     * de prioridade, podemos retornar agora.
     */
    if (score === 0) {
      return candidate;
    }

    /**
     * Caso nenhuma direção caiba completamente,
     * guardamos a que corta menos.
     */
    if (score < bestScore) {
      bestScore =
        score;

      bestDirection =
        candidate;
    }
  }

  return bestDirection;
}

export function getHoverRevealInnerStyle(
  direction: HoverRevealSide,
  sideOffset: number
): React.CSSProperties {
  switch (direction) {
    case "left":
      return {
        right:
          sideOffset,
      };

    case "right":
      return {
        left:
          sideOffset,
      };

    case "up":
      return {
        bottom:
          sideOffset,
      };

    case "down":
      return {
        top:
          sideOffset,
      };
  }
}

/* -------------------------------------------------------------------------- */
/*                                  CONTENT                                   */
/* -------------------------------------------------------------------------- */

export function HoverRevealContent({
  animation = "slide",

  direction = "left",

  align = "center",

  sideOffset = 0,

  duration = 500,

  speed = 500,

  easing =
    "cubic-bezier(0.22, 1, 0.36, 1)",

  matchTriggerSize = true,

  wrapperClassName,

  /**
   * Auto tenta primeiro direita.
   *
   * Se não couber:
   *
   * esquerda
   * baixo
   * cima
   */
  autoPriority = [
    "right",
    "left",
    "down",
    "up",
  ],

  collisionPadding = 8,

  className,

  children,

  style,

  ...props
}: HoverRevealContentProps) {
  const {
    open,
    triggerSize,
    triggerRect,
  } = useHoverReveal();

  const contentRef =
    React.useRef<HTMLDivElement>(null);

  const [naturalSize, setNaturalSize] =
    React.useState<HoverRevealSize>({
      width: 0,
      height: 0,
    });

  /* ------------------------------------------------------------------------ */
  /*                           MEDIÇÃO DO CONTENT                              */
  /* ------------------------------------------------------------------------ */

  React.useLayoutEffect(() => {
    const element =
      contentRef.current;

    if (!element) {
      return;
    }

    const measure = () => {
      const rect =
        element.getBoundingClientRect();

      setNaturalSize({
        width:
          Math.ceil(rect.width),

        height:
          Math.ceil(rect.height),
      });
    };

    measure();

    const resizeObserver =
      new ResizeObserver(() => {
        measure();
      });

    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [children]);

  /* ------------------------------------------------------------------------ */
  /*                         RESOLVE DIRECTION                                 */
  /* ------------------------------------------------------------------------ */

  /**
   * Se direction não for auto,
   * simplesmente usa a direção informada.
   *
   * Caso seja auto, calcula a melhor.
   */
  const resolvedDirection:
    HoverRevealSide =
      direction === "auto"
        ? getHoverRevealAutoDirection({
            triggerRect,
            triggerSize,
            naturalSize,
            align,
            sideOffset,
            matchTriggerSize,
            collisionPadding,
            priority:
              autoPriority,
          })
        : direction;

  const horizontal =
    isHoverRevealHorizontal(
      resolvedDirection
    );

  /* ------------------------------------------------------------------------ */
  /*                           TAMANHO RESOLVIDO                               */
  /* ------------------------------------------------------------------------ */

  const resolvedSize =
    getHoverRevealResolvedSize(
      resolvedDirection,
      naturalSize,
      triggerSize,
      matchTriggerSize
    );

  const resolvedWidth =
    resolvedSize.width;

  const resolvedHeight =
    resolvedSize.height;

  const expandedWidth =
    resolvedWidth +
    (
      horizontal
        ? sideOffset
        : 0
    );

  const expandedHeight =
    resolvedHeight +
    (
      !horizontal
        ? sideOffset
        : 0
    );

  /* ------------------------------------------------------------------------ */
  /*                                   SLIDE                                  */
  /* ------------------------------------------------------------------------ */

  const slideStyle:
    React.CSSProperties =
    horizontal
      ? {
          /**
           * LEFT / RIGHT:
           *
           * anima width.
           */
          width:
            open
              ? expandedWidth
              : 0,

          height:
            resolvedHeight,

          opacity: 1,

          transition:
            `width ${speed}ms ${easing}`,
        }
      : {
          /**
           * UP / DOWN:
           *
           * anima height.
           */
          height:
            open
              ? expandedHeight
              : 0,

          width:
            resolvedWidth,

          opacity: 1,

          transition:
            `height ${speed}ms ${easing}`,
        };

  /* ------------------------------------------------------------------------ */
  /*                                   FADE                                   */
  /* ------------------------------------------------------------------------ */

  const fadeStyle:
    React.CSSProperties = {
      width:
        expandedWidth,

      height:
        expandedHeight,

      opacity:
        open
          ? 1
          : 0,

      transition:
        `opacity ${duration}ms ease-out`,
    };

  /* ------------------------------------------------------------------------ */
  /*                                   NONE                                   */
  /* ------------------------------------------------------------------------ */

  const noneStyle:
    React.CSSProperties = {
      width:
        expandedWidth,

      height:
        expandedHeight,

      opacity:
        open
          ? 1
          : 0,

      transition:
        "none",
    };

  /* ------------------------------------------------------------------------ */
  /*                           ANIMATION SELECTOR                              */
  /* ------------------------------------------------------------------------ */

  const animationStyle =
    animation === "slide"
      ? slideStyle
      : animation === "fade"
        ? fadeStyle
        : noneStyle;

  /* ------------------------------------------------------------------------ */
  /*                                  RENDER                                  */
  /* ------------------------------------------------------------------------ */

  return (
    <div
      data-slot="hover-reveal-content-wrapper"

      data-state={
        open
          ? "open"
          : "closed"
      }

      /**
       * Mostra a configuração original.
       *
       * Pode ser:
       *
       * auto
       * left
       * right
       * etc.
       */
      data-direction={direction}

      /**
       * Aqui fica a direção que realmente
       * está sendo utilizada.
       *
       * Muito útil para CSS customizado.
       *
       * Ex:
       *
       * data-resolved-direction="right"
       */
      data-resolved-direction={
        resolvedDirection
      }

      data-animation={animation}

      data-align={align}

      className={cn(
        "absolute",

        "z-20",

        /**
         * Essencial para slide.
         */
        "overflow-hidden",

        !open &&
          "pointer-events-none",

        /**
         * Usa a direção REAL escolhida,
         * e não necessariamente a prop original.
         */
        hoverRevealPositionClasses[
          resolvedDirection
        ][align],

        horizontal
          ? "will-change-[width]"
          : "will-change-[height]",

        wrapperClassName
      )}

      style={
        animationStyle
      }
    >
      <div
        ref={contentRef}

        data-slot="hover-reveal-content"

        data-direction={
          resolvedDirection
        }

        {...props}

        className={cn(
          "absolute w-max",

          /**
           * LEFT / RIGHT:
           *
           * centralizado verticalmente.
           *
           * UP / DOWN:
           *
           * centralizado horizontalmente.
           */
          horizontal
            ? "top-1/2 -translate-y-1/2"
            : "left-1/2 -translate-x-1/2",

          className
        )}

        style={{
          ...getHoverRevealInnerStyle(
            resolvedDirection,
            sideOffset
          ),

          ...(
            matchTriggerSize
              ? horizontal
                ? {
                    minHeight:
                      triggerSize.height,
                  }
                : {
                    minWidth:
                      triggerSize.width,
                  }
              : {}
          ),

          ...style,
        }}
      >
        {children}
      </div>
    </div>
  );
}