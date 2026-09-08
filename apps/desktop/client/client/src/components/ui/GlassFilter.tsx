import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";

type GlassFilterProps = {
  id: string;
  distortion?: number;
};

function normalizeDistortion(distortion: number) {
  return Number.isFinite(distortion) ? Math.max(0, distortion) : 1;
}

export function GlassFilter({
  id,
  distortion = 1,
}: GlassFilterProps) {
  const distortionMultiplier = normalizeDistortion(distortion);

  return (
    <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-0">
      <defs>
        <filter
          id={id}
          colorInterpolationFilters="sRGB"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
        >
          <feImage
            x="0"
            y="0"
            width="100%"
            height="100%"
            preserveAspectRatio="none"
            result="map"
            href={`data:image/svg+xml,%3Csvg viewBox='0 0 514.640625 48' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3ClinearGradient id='red-grad' x1='100%25' y1='0%25' x2='0%25' y2='0%25'%3E%3Cstop offset='0%25' stop-color='%230000'/%3E%3Cstop offset='100%25' stop-color='red'/%3E%3C/linearGradient%3E%3ClinearGradient id='blue-grad' x1='0%25' y1='0%25' x2='0%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%230000'/%3E%3Cstop offset='100%25' stop-color='blue'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='514.640625' height='48' fill='black'/%3E%3Crect width='514.640625' height='48' rx='20' fill='url(%23red-grad)'/%3E%3Crect width='514.640625' height='48' rx='20' fill='url(%23blue-grad)' style='mix-blend-mode:screen'/%3E%3Crect x='1.68' y='1.68' width='511.28' height='44.64' rx='20' fill='hsl(0 0%25 50%25 / 0.93)' style='filter:blur(7px)'/%3E%3C/svg%3E`}
          />

          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            result="dispRed"
            scale={-180 * distortionMultiplier}
            xChannelSelector="R"
            yChannelSelector="G"
          />

          <feColorMatrix
            in="dispRed"
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="red"
          />

          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            result="dispGreen"
            scale={-170 * distortionMultiplier}
            xChannelSelector="R"
            yChannelSelector="G"
          />

          <feColorMatrix
            in="dispGreen"
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="green"
          />

          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            result="dispBlue"
            scale={-160 * distortionMultiplier}
            xChannelSelector="R"
            yChannelSelector="G"
          />

          <feColorMatrix
            in="dispBlue"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="blue"
          />

          <feBlend in="red" in2="green" mode="screen" result="rg" />

          <feBlend in="rg" in2="blue" mode="screen" result="output" />

          <feGaussianBlur in="output" stdDeviation="0.5" />
        </filter>
      </defs>
    </svg>
  );
}

export function GlassFilterFull({
  id,
  distortion = 1,
}: GlassFilterProps) {
  const distortionMultiplier = normalizeDistortion(distortion);

  return (
    <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-0">
      <defs>
        <filter
          id={id}
          colorInterpolationFilters="sRGB"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
        >
          <feImage
            x="0"
            y="0"
            width="100%"
            height="100%"
            preserveAspectRatio="none"
            result="map"
            href={`data:image/svg+xml,%3Csvg viewBox='0 0 1920 64' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3ClinearGradient id='red-grad' x1='100%25' y1='0%25' x2='0%25' y2='0%25'%3E%3Cstop offset='0%25' stop-color='%230000'/%3E%3Cstop offset='100%25' stop-color='red'/%3E%3C/linearGradient%3E%3ClinearGradient id='blue-grad' x1='0%25' y1='0%25' x2='0%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%230000'/%3E%3Cstop offset='100%25' stop-color='blue'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1920' height='64' fill='black'/%3E%3Crect width='1920' height='64' rx='0' fill='url(%23red-grad)'/%3E%3Crect width='1920' height='64' rx='0' fill='url(%23blue-grad)' style='mix-blend-mode:screen'/%3E%3Crect x='2' y='2' width='1916' height='60' rx='0' fill='hsl(0 0%25 50%25 / 0.93)' style='filter:blur(10px)'/%3E%3C/svg%3E`}
          />

          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            result="dispRed"
            scale={-32 * distortionMultiplier}
            xChannelSelector="R"
            yChannelSelector="G"
          />

          <feColorMatrix
            in="dispRed"
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="red"
          />

          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            result="dispGreen"
            scale={-26 * distortionMultiplier}
            xChannelSelector="R"
            yChannelSelector="G"
          />

          <feColorMatrix
            in="dispGreen"
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="green"
          />

          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            result="dispBlue"
            scale={-20 * distortionMultiplier}
            xChannelSelector="R"
            yChannelSelector="G"
          />

          <feColorMatrix
            in="dispBlue"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="blue"
          />

          <feBlend in="red" in2="green" mode="screen" result="rg" />

          <feBlend in="rg" in2="blue" mode="screen" result="output" />

          <feGaussianBlur in="output" stdDeviation="0.25" />
        </filter>
      </defs>
    </svg>
  );
}

type GlassWrapperProps = {
  children?: ReactNode;

  variant?: "normal" | "full";

  /**
   * Multiplicador da distorção:
   * 0 desativa,
   * 1 usa o padrão,
   * valores maiores intensificam.
   */
  distortion?: number;

  /**
   * Faz o GlassWrapper usar o próprio elemento filho
   * como elemento raiz em vez de criar uma <div>.
   *
   * Quando true, deve existir exatamente um ReactElement
   * como filho.
   */
  asChild?: boolean;

  className?: string;

  contentClassName?: string;
};

type AsChildElementProps = {
  className?: string;
  children?: ReactNode;
};

export function GlassWrapper({
  children,
  variant = "normal",
  distortion = 1,
  asChild = false,
  className = "",
  contentClassName = "",
}: GlassWrapperProps) {
  const instanceId = useId().replace(/:/g, "-");

  const id =
    variant === "full"
      ? `glass-filter-full-${instanceId}`
      : `glass-filter-${instanceId}`;

  const filter =
    variant === "full" ? (
      <GlassFilterFull id={id} distortion={distortion} />
    ) : (
      <GlassFilter id={id} distortion={distortion} />
    );

  const backdrop = (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: asChild ? -1 : 0,
        width: "100%",
        height: "100%",
        minHeight: "100%",
        backgroundColor: "rgba(0,0,0,0.2)",
        backdropFilter: `url("#${id}") saturate(1)`,
        WebkitBackdropFilter: `url("#${id}") saturate(1)`,
        transform: "translateZ(0)",
      }}
    />
  );

  /*
   * asChild
   *
   * Em vez de:
   *
   * <GlassWrapper>
   *   <button />
   * </GlassWrapper>
   *
   * resultar em:
   *
   * <div>
   *   <button />
   * </div>
   *
   * teremos o próprio <button> como root.
   */
  if (asChild) {
    const child = Children.only(children);

    if (!isValidElement<AsChildElementProps>(child)) {
      throw new Error(
        "GlassWrapper com asChild precisa receber exatamente um ReactElement como filho.",
      );
    }

    const childClassName = child.props.className ?? "";

    return cloneElement(
      child as ReactElement<AsChildElementProps>,
      {
        className: [
          "relative isolate overflow-hidden",
          className,
          childClassName,
        ]
          .filter(Boolean)
          .join(" "),
      },
      <>
        {filter}

        {backdrop}

        {child.props.children}
      </>,
    );
  }

  return (
    <div
      className={`relative isolate block overflow-hidden ${className}`}
    >
      {filter}

      {backdrop}

      <div className={`relative z-10 ${contentClassName}`}>
        {children}
      </div>
    </div>
  );
}