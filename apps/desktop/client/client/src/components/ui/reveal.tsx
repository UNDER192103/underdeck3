import {
  cloneElement,
  ElementType,
  CSSProperties,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type Ref,
  type ReactElement,
  type ReactNode,
} from "react";

type RevealDirection = "up" | "down" | "left" | "right" | "none";

export type RevealProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;

  /**
   * Delay antes da animação começar.
   * Exemplo: delay={150}
   */
  delay?: number;

  /**
   * Duração da animação em ms.
   * Exemplo: duration={900}
   */
  duration?: number;

  /**
   * Distância inicial do movimento em px.
   * Exemplo: distance={32}
   */
  distance?: number;

  /**
   * Direção de onde o elemento vem.
   * "up" = vem de baixo para cima.
   */
  direction?: RevealDirection;

  /**
   * Quanto do elemento precisa aparecer para ativar.
   * Valor entre 0 e 1.
   *
   * Exemplo:
   * threshold={0} ativa assim que encostar na área observada.
   * threshold={0.1} ativa quando 10% aparecer.
   */
  threshold?: number;

  /**
   * Margem extra para ativar antes ou depois do elemento entrar na tela.
   *
   * Exemplo:
   * rootMargin="0px 0px 100px 0px"
   * ativa 100px antes do elemento aparecer na parte de baixo da tela.
   *
   * rootMargin="0px 0px -100px 0px"
   * ativa só depois que o elemento entrar 100px dentro da tela.
   */
  rootMargin?: string;

  /**
   * Atalho para ativar antes do elemento aparecer.
   * Exemplo:
   * triggerOffset={120}
   * equivale a rootMargin="0px 0px 120px 0px"
   */
  triggerOffset?: number;

  /**
   * Se true, anima apenas uma vez.
   * Se false, anima toda vez que aparecer na tela.
   */
  once?: boolean;

  /**
   * Desativa a animação.
   */
  disabled?: boolean;

  /**
   * Curva da transição.
   */
  easing?: string;

  /**
   * Elemento HTML usado como wrapper.
   * Exemplo: as="section"
   */
  as?: ElementType;

  /**
   * Aplica a animação diretamente no único elemento filho, sem criar wrapper.
   */
  asChild?: boolean;

  /** Ref encaminhada ao elemento quando `asChild` é usado. */
  forwardedRef?: Ref<HTMLElement>;
};

export type RevealPropsCard = Omit<RevealProps, "children">;

const getHiddenTransform = (
  direction: RevealDirection,
  distance: number,
): string => {
  switch (direction) {
    case "up":
      return `translate3d(0, ${distance}px, 0)`;
    case "down":
      return `translate3d(0, -${distance}px, 0)`;
    case "left":
      return `translate3d(${distance}px, 0, 0)`;
    case "right":
      return `translate3d(-${distance}px, 0, 0)`;
    case "none":
    default:
      return "translate3d(0, 0, 0)";
  }
};

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
    return;
  }

  if (ref) {
    ref.current = value;
  }
}

export function Reveal({
  children,
  className = "",
  delay = 0,
  duration = 700,
  distance = 32,
  direction = "up",
  threshold = 0,
  rootMargin,
  triggerOffset = 100,
  once = true,
  disabled = false,
  style: customStyle,
  easing = "cubic-bezier(0.22, 1, 0.36, 1)",
  as: Component = "div",
  asChild = false,
  forwardedRef,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(disabled);
  const setElementRef = useCallback(
    (node: HTMLElement | null) => {
      ref.current = node;
      assignRef(forwardedRef, node);
    },
    [forwardedRef],
  );

  useEffect(() => {
    const element = ref.current;

    if (!element || disabled) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);

          if (once) {
            observer.unobserve(entry.target);
          }
        } else if (!once) {
          setIsVisible(false);
        }
      },
      {
        threshold,
        rootMargin: rootMargin ?? `0px 0px ${triggerOffset}px 0px`,
      },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [disabled, once, threshold, rootMargin, triggerOffset]);

  const style: CSSProperties = {
    ...customStyle,
    transitionDelay: `${delay}ms`,
    transitionDuration: `${duration}ms`,
    transitionTimingFunction: easing,
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? "none" : getHiddenTransform(direction, distance),
    // `will-change: opacity` creates a backdrop root. Keeping it after the
    // reveal prevents descendant backdrop filters (such as the liquid
    // glass header) from sampling the page background.
    willChange: isVisible ? "auto" : "opacity, transform",
  };

  const revealClassName = `
      transition-[opacity,transform]
      motion-reduce:transition-none motion-reduce:transform-none motion-reduce:opacity-100
      ${className}
    `;

  if (asChild) {
    if (!isValidElement(children)) {
      throw new Error(
        "<Reveal asChild> expects exactly one React element child.",
      );
    }

    const child = children as ReactElement<{
      className?: string;
      style?: CSSProperties;
      ref?: Ref<HTMLElement>;
      "data-reveal"?: string;
    }>;

    // React invokes this callback ref after render; the hook rule currently
    // treats cloneElement callback refs as if they were read during render.
    // eslint-disable-next-line react-hooks/refs
    return cloneElement(child, {
      "data-reveal": "",
      ref: setElementRef,
      style: {
        ...child.props.style,
        ...style,
      },
      className: `${child.props.className ?? ""} ${revealClassName}`,
    });
  }

  return (
    <Component
      data-reveal=""
      ref={setElementRef}
      style={style}
      className={revealClassName}
    >
      {children}
    </Component>
  );
}
