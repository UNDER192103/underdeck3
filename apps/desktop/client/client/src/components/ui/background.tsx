import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

export type BackgroundVariant =
  | "color"
  | "image"
  | "video"
  | "neural"
  | "nebula"
  | "particles";

export type ColorBackgroundMode = "fixed" | "gradient" | "loop";

/**
 * Optional overlay presets kept for consumers that want the previous visual
 * treatment. Background itself deliberately applies none of them by default;
 * pass one through `overlayClassName` when that treatment is desired.
 */
export const BACKGROUND_OVERLAY_PRESETS = {
  video: "bg-slate-950/40",
  nebula: "bg-gradient-to-b from-violet-500/6 via-transparent to-fuchsia-950/20",
  neural: "bg-gradient-to-b from-blue-900/10 via-transparent to-blue-950/25",
} as const;

type Point = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
};

type Nebula = {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  status: "waiting" | "fadein" | "fadeout";
  waitCounter: number;
};

type BaseBackgroundProps = {
  fullScreen?: boolean;
  className?: string;
  overlayClassName?: string;
  style?: CSSProperties;
  /** Keeps the base layer transparent while retaining dynamic effects. */
  transparent?: boolean;
};

export type ParticleDirection = "up" | "right" | "down" | "left" | "random";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  phase: number;
};

type ImageBackgroundProps = BaseBackgroundProps & {
  variant: "image";
  imageSrc: string;
  imageAlt?: string;
  imageClassName?: string;
};

type ColorBackgroundProps = BaseBackgroundProps & {
  variant: "color";
  /** Legacy/default fixed color. It is also used when backgroundColors is empty. */
  backgroundColor?: string;
  /** Fixed color, static gradient or a continuous transition between colors. */
  colorMode?: ColorBackgroundMode;
  /** CSS colors used by gradient and loop modes, in display order. */
  backgroundColors?: string[];
  /** Direction of the static gradient, in degrees. */
  gradientAngle?: number;
  /** Duration of each color-to-color transition in loop mode. */
  loopTransitionDurationMs?: number;
};

type VideoBackgroundProps = BaseBackgroundProps & {
  variant: "video";
  videoSrc: string;
  videoPoster?: string;
  videoMuted?: boolean;
  videoLoop?: boolean;
  videoAutoPlay?: boolean;
  videoPlaysInline?: boolean;
};

type NeuralBackgroundProps = BaseBackgroundProps & {
  variant: "neural";
  neuralPointCount?: number;
  neuralLinkDistance?: number;
  neuralColors?: {
    center?: string;
    middle?: string;
    edge?: string;
    link?: string;
    dot?: string;
  };
};

type NebulaBackgroundProps = BaseBackgroundProps & {
  variant: "nebula";
  nebulaCount?: number;
  nebulaMinRadius?: number;
  nebulaMaxRadius?: number;
  nebulaOpacityStep?: number;
  nebulaMaxOpacity?: number;
  nebulaDelayFrames?: number;
  nebulaColor?: string;
  nebulaExplosionColor?: string;
  nebulaBackgroundStart?: string;
  nebulaBackgroundEnd?: string;
  nebulaPulseSpeed?: number;
};

type ParticlesBackgroundProps = BaseBackgroundProps & {
  variant: "particles";
  /** Number of visible particles. */
  particleCount?: number;
  /** Main movement direction; random gives each particle an individual direction. */
  particleDirection?: ParticleDirection;
  /** Movement speed in pixels per second. */
  particleSpeed?: number;
  /** Opacity pulse frequency in hertz. Set 0 for a static brightness. */
  particleFrequency?: number;
  particleMinSize?: number;
  particleMaxSize?: number;
  particleColor?: string;
  particleOpacity?: number;
  particleBackgroundColor?: string;
};

export type BackgroundProps =
  | ColorBackgroundProps
  | ImageBackgroundProps
  | VideoBackgroundProps
  | NeuralBackgroundProps
  | NebulaBackgroundProps
  | ParticlesBackgroundProps;

const FALLBACK_NEBULA_START = "#0b0716";
const FALLBACK_NEBULA_END = "#1a0d35";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseHexColor(color: string) {
  const normalized = color.trim().replace("#", "");
  const hex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized;

  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) {
    return null;
  }

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
    alpha: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
  };
}

function lerpColor(start: string, end: string, amount: number) {
  const safeStart =
    parseHexColor(start) ?? parseHexColor(FALLBACK_NEBULA_START)!;
  const safeEnd = parseHexColor(end) ?? parseHexColor(FALLBACK_NEBULA_END)!;
  const ratio = clamp(amount, 0, 1);

  return {
    r: Math.round(safeStart.r + (safeEnd.r - safeStart.r) * ratio),
    g: Math.round(safeStart.g + (safeEnd.g - safeStart.g) * ratio),
    b: Math.round(safeStart.b + (safeEnd.b - safeStart.b) * ratio),
  };
}

function normalizeColorToRgba(color: string, alpha: number) {
  const normalized = color.trim();

  if (normalized.startsWith("rgba(")) {
    return normalized.replace(
      /rgba\(([^)]+),\s*[\d.]+\)/,
      `rgba($1, ${clamp(alpha, 0, 1)})`,
    );
  }

  if (normalized.startsWith("rgb(")) {
    const values = normalized.slice(4, -1);
    return `rgba(${values}, ${clamp(alpha, 0, 1)})`;
  }

  if (normalized.startsWith("#")) {
    const parsed = parseHexColor(normalized);
    if (parsed) {
      return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${clamp(alpha * parsed.alpha, 0, 1)})`;
    }
  }

  return `rgba(${normalized}, ${clamp(alpha, 0, 1)})`;
}

export function BackgroundComp(props: BackgroundProps) {
  const {
    variant,
    fullScreen = true,
    className,
    overlayClassName,
    style,
    transparent = false,
  } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const colorLayerRef = useRef<HTMLDivElement | null>(null);

  const containerClasses = cn(
    "pointer-events-none overflow-hidden",
    // A negative layer is painted behind the document/body background. Keep the
    // background at the base application layer instead; BackgroundProvider
    // places its content above it.
    fullScreen ? "fixed inset-0 z-0" : "absolute inset-0 z-0",
    className,
  );

  const neuralPointCount =
    variant === "neural" ? (props.neuralPointCount ?? 54) : 54;
  const neuralLinkDistance =
    variant === "neural" ? (props.neuralLinkDistance ?? 280) : 280;
  const neuralColorOptions =
    variant === "neural" ? props.neuralColors : undefined;
  // Keep this reference stable between ordinary parent renders (such as the
  // loading progress updates). The canvas effect depends on it, so creating a
  // new object on every render would tear down the animation and randomize all
  // neural point positions again.
  const neuralColors = useMemo(
    () =>
      variant === "neural"
        ? {
            center: neuralColorOptions?.center ?? "rgba(21, 25, 100, 0.53)",
            middle: neuralColorOptions?.middle ?? "rgb(2, 26, 75)",
            edge: neuralColorOptions?.edge ?? "rgb(3, 9, 29)",
            link: neuralColorOptions?.link ?? "rgba(125, 211, 252, 1)",
            dot: neuralColorOptions?.dot ?? "rgba(147, 197, 253, 0.9)",
          }
        : null,
    [
      variant,
      neuralColorOptions?.center,
      neuralColorOptions?.middle,
      neuralColorOptions?.edge,
      neuralColorOptions?.link,
      neuralColorOptions?.dot,
    ],
  );

  const safeNeuralPointCount = useMemo(() => {
    return Math.max(6, Math.min(neuralPointCount, 120));
  }, [neuralPointCount]);

  const safeNeuralLinkDistance = useMemo(() => {
    return Math.max(60, Math.min(neuralLinkDistance, 280));
  }, [neuralLinkDistance]);

  const nebulaCount = variant === "nebula" ? (props.nebulaCount ?? 3) : 3;
  const nebulaMinRadius =
    variant === "nebula" ? (props.nebulaMinRadius ?? 450) : 450;
  const nebulaMaxRadius =
    variant === "nebula" ? (props.nebulaMaxRadius ?? 1050) : 1050;
  const nebulaOpacityStep =
    variant === "nebula" ? (props.nebulaOpacityStep ?? 0.0015) : 0.0015;
  const nebulaMaxOpacity =
    variant === "nebula" ? (props.nebulaMaxOpacity ?? 0.25) : 0.25;
  const nebulaDelayFrames =
    variant === "nebula" ? (props.nebulaDelayFrames ?? 120) : 120;
  const nebulaColor =
    variant === "nebula"
      ? (props.nebulaColor ?? "113, 44, 249")
      : "113, 44, 249";
  const nebulaExplosionColor =
    variant === "nebula"
      ? (props.nebulaExplosionColor ?? props.nebulaColor ?? "113, 44, 249")
      : "113, 44, 249";
  const nebulaBackgroundStart =
    variant === "nebula"
      ? (props.nebulaBackgroundStart ?? FALLBACK_NEBULA_START)
      : FALLBACK_NEBULA_START;
  const nebulaBackgroundEnd =
    variant === "nebula"
      ? (props.nebulaBackgroundEnd ?? FALLBACK_NEBULA_END)
      : FALLBACK_NEBULA_END;
  const nebulaPulseSpeed =
    variant === "nebula" ? (props.nebulaPulseSpeed ?? 0.004) : 0.004;
  const particleCount = variant === "particles" ? (props.particleCount ?? 36) : 36;
  const particleDirection =
    variant === "particles" ? (props.particleDirection ?? "random") : "random";
  const particleSpeed = variant === "particles" ? (props.particleSpeed ?? 12) : 12;
  const particleFrequency =
    variant === "particles" ? (props.particleFrequency ?? 0.45) : 0.45;
  const particleMinSize =
    variant === "particles" ? (props.particleMinSize ?? 0.7) : 0.7;
  const particleMaxSize =
    variant === "particles" ? (props.particleMaxSize ?? 1.8) : 1.8;
  const particleColor =
    variant === "particles" ? (props.particleColor ?? "rgba(96, 165, 250, 0.9)") : "rgba(96, 165, 250, 0.9)";
  const particleOpacity =
    variant === "particles" ? (props.particleOpacity ?? 0.75) : 0.75;
  const particleBackgroundColor =
    variant === "particles" ? (props.particleBackgroundColor ?? "#020617") : "#020617";
  const colorMode = variant === "color" ? (props.colorMode ?? "fixed") : "fixed";
  const backgroundColor = variant === "color" ? (props.backgroundColor ?? "") : "";
  const configuredBackgroundColors = variant === "color" ? props.backgroundColors : undefined;
  const backgroundColors = useMemo(() => {
    if (variant !== "color") return [];

    const colors = (configuredBackgroundColors ?? [])
      .map((color) => color.trim())
      .filter(Boolean);

    if (colors.length > 0) return colors;
    return backgroundColor ? [backgroundColor] : [];
  }, [variant, configuredBackgroundColors, backgroundColor]);
  const gradientAngle = variant === "color" ? (props.gradientAngle ?? 135) : 135;
  const loopTransitionDurationMs = variant === "color"
    ? clamp(props.loopTransitionDurationMs ?? 5_000, 100, 3_600_000)
    : 5_000;

  const safeNebulaCount = useMemo(
    () => clamp(nebulaCount, 1, 12),
    [nebulaCount],
  );
  const safeNebulaMinRadius = useMemo(
    () => clamp(nebulaMinRadius, 80, 2400),
    [nebulaMinRadius],
  );
  const safeNebulaMaxRadius = useMemo(
    () =>
      clamp(
        Math.max(nebulaMaxRadius, safeNebulaMinRadius + 1),
        safeNebulaMinRadius + 1,
        3200,
      ),
    [nebulaMaxRadius, safeNebulaMinRadius],
  );
  const safeNebulaOpacityStep = useMemo(
    () => clamp(nebulaOpacityStep, 0.0002, 0.02),
    [nebulaOpacityStep],
  );
  const safeNebulaMaxOpacity = useMemo(
    () => clamp(nebulaMaxOpacity, 0.02, 0.7),
    [nebulaMaxOpacity],
  );
  const safeNebulaDelayFrames = useMemo(
    () => clamp(nebulaDelayFrames, 0, 1200),
    [nebulaDelayFrames],
  );
  const safeNebulaPulseSpeed = useMemo(
    () => clamp(nebulaPulseSpeed, 0.0001, 0.05),
    [nebulaPulseSpeed],
  );
  const safeParticleCount = useMemo(
    () => clamp(particleCount, 1, 400),
    [particleCount],
  );
  const safeParticleSpeed = useMemo(
    () => clamp(particleSpeed, 0, 240),
    [particleSpeed],
  );
  const safeParticleFrequency = useMemo(
    () => clamp(particleFrequency, 0, 10),
    [particleFrequency],
  );
  const safeParticleMinSize = useMemo(
    () => clamp(particleMinSize, 0.25, 24),
    [particleMinSize],
  );
  const safeParticleMaxSize = useMemo(
    () => clamp(Math.max(particleMaxSize, safeParticleMinSize), safeParticleMinSize, 32),
    [particleMaxSize, safeParticleMinSize],
  );
  const safeParticleOpacity = useMemo(
    () => clamp(particleOpacity, 0.02, 1),
    [particleOpacity],
  );

  useEffect(() => {
    if (
      variant !== "color"
      || colorMode !== "loop"
      || transparent
      || backgroundColors.length < 2
    ) {
      return;
    }

    const layer = colorLayerRef.current;
    if (!layer) return;

    const loopColors = [...backgroundColors, backgroundColors[0]];
    const animation = layer.animate(
      loopColors.map((color, index) => ({
        backgroundColor: color,
        offset: index / backgroundColors.length,
      })),
      {
        duration: loopTransitionDurationMs * backgroundColors.length,
        iterations: Number.POSITIVE_INFINITY,
        easing: "linear",
      },
    );

    return () => animation.cancel();
  }, [
    variant,
    colorMode,
    backgroundColors,
    loopTransitionDurationMs,
    transparent,
  ]);

  useEffect(() => {
    if (variant !== "neural" && variant !== "nebula" && variant !== "particles") {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const points: Point[] = [];
    const nebulae: Nebula[] = [];
    const particles: Particle[] = [];
    let animationFrameId = 0;
    let pulse = 0;
    let particleElapsedSeconds = 0;
    let previousTimestamp: number | null = null;

    const getCanvasSize = () => {
      const bounds = containerRef.current?.getBoundingClientRect();
      const width = Math.max(1, Math.floor(bounds?.width ?? window.innerWidth));
      const height = Math.max(
        1,
        Math.floor(bounds?.height ?? window.innerHeight),
      );

      return { width, height };
    };

    const initNebula = (width: number, height: number): Nebula => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius:
        Math.random() * (safeNebulaMaxRadius - safeNebulaMinRadius) +
        safeNebulaMinRadius,
      opacity: 0,
      status: "waiting",
      waitCounter: Math.random() * safeNebulaDelayFrames,
    });

    const particleVelocity = () => {
      const speed = safeParticleSpeed * (0.55 + Math.random() * 0.7);
      const drift = speed * (Math.random() - 0.5) * 0.35;
      if (particleDirection === "up") return { vx: drift, vy: -speed };
      if (particleDirection === "right") return { vx: speed, vy: drift };
      if (particleDirection === "down") return { vx: drift, vy: speed };
      if (particleDirection === "left") return { vx: -speed, vy: drift };

      const angle = Math.random() * Math.PI * 2;
      return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
    };

    const initParticle = (width: number, height: number): Particle => {
      const velocity = particleVelocity();
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        ...velocity,
        radius: safeParticleMinSize + Math.random() * (safeParticleMaxSize - safeParticleMinSize),
        opacity: safeParticleOpacity * (0.5 + Math.random() * 0.5),
        phase: Math.random() * Math.PI * 2,
      };
    };

    const recycleParticle = (particle: Particle, width: number, height: number) => {
      const velocity = particleVelocity();
      particle.vx = velocity.vx;
      particle.vy = velocity.vy;
      particle.radius = safeParticleMinSize + Math.random() * (safeParticleMaxSize - safeParticleMinSize);
      particle.opacity = safeParticleOpacity * (0.5 + Math.random() * 0.5);
      particle.phase = Math.random() * Math.PI * 2;

      if (particleDirection === "up") {
        particle.x = Math.random() * width;
        particle.y = height + particle.radius;
      } else if (particleDirection === "right") {
        particle.x = -particle.radius;
        particle.y = Math.random() * height;
      } else if (particleDirection === "down") {
        particle.x = Math.random() * width;
        particle.y = -particle.radius;
      } else if (particleDirection === "left") {
        particle.x = width + particle.radius;
        particle.y = Math.random() * height;
      } else {
        if (Math.abs(particle.vx) >= Math.abs(particle.vy)) {
          particle.x = particle.vx >= 0 ? -particle.radius : width + particle.radius;
          particle.y = Math.random() * height;
        } else {
          particle.x = Math.random() * width;
          particle.y = particle.vy >= 0 ? -particle.radius : height + particle.radius;
        }
      }
    };

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const { width, height } = getCanvasSize();

      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.scale(ratio, ratio);

      if (variant === "neural") {
        points.length = 0;
        for (let i = 0; i < safeNeuralPointCount; i += 1) {
          points.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: (Math.random() - 0.5) * 0.24,
            vy: (Math.random() - 0.5) * 0.24,
            radius: Math.random() * 1.6 + 1.2,
          });
        }
      }

      if (variant === "nebula") {
        nebulae.length = 0;
        for (let i = 0; i < safeNebulaCount; i += 1) {
          nebulae.push(initNebula(width, height));
        }
      }

      if (variant === "particles") {
        particles.length = 0;
        for (let i = 0; i < safeParticleCount; i += 1) {
          particles.push(initParticle(width, height));
        }
      }
    };

    const drawGradient = (width: number, height: number) => {
      if (variant === "neural") {
        const pulseStrength = 0.12 + (Math.sin(pulse) + 1) * 0.07;

        const gradient = context.createRadialGradient(
          width * 0.5,
          height * 0.42,
          width * 0.12,
          width * 0.5,
          height * 0.5,
          width * 0.88,
        );

        gradient.addColorStop(
          0,
          neuralColors?.center ?? `rgba(21, 25, 100, ${0.34 + pulseStrength})`,
        );
        gradient.addColorStop(0.5, neuralColors?.middle ?? "rgb(2, 26, 75)");
        gradient.addColorStop(1, neuralColors?.edge ?? "rgb(3, 9, 29)");

        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
        return;
      }

      if (variant === "particles") {
        context.fillStyle = particleBackgroundColor;
        context.fillRect(0, 0, width, height);
        return;
      }

      const pulseIntensity = (Math.sin(pulse) + 1) / 2;
      const endColor = lerpColor(
        nebulaBackgroundStart,
        nebulaBackgroundEnd,
        pulseIntensity,
      );
      const gradient = context.createLinearGradient(0, 0, width, height);

      gradient.addColorStop(0, nebulaBackgroundStart);
      gradient.addColorStop(
        1,
        `rgb(${endColor.r}, ${endColor.g}, ${endColor.b})`,
      );

      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
    };

    const draw = (timestamp: number) => {
      const { width, height } = getCanvasSize();
      const deltaSeconds = previousTimestamp === null
        ? 0
        : Math.min(0.1, Math.max(0, (timestamp - previousTimestamp) / 1_000));
      previousTimestamp = timestamp;
      particleElapsedSeconds += deltaSeconds;

      if (transparent) {
        context.clearRect(0, 0, width, height);
      } else {
        drawGradient(width, height);
      }

      if (variant === "neural") {
        for (let i = 0; i < points.length; i += 1) {
          const point = points[i];

          point.x += point.vx;
          point.y += point.vy;

          if (point.x <= 0 || point.x >= width) {
            point.vx *= -1;
          }
          if (point.y <= 0 || point.y >= height) {
            point.vy *= -1;
          }

          for (let j = i + 1; j < points.length; j += 1) {
            const other = points[j];
            const dx = point.x - other.x;
            const dy = point.y - other.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= safeNeuralLinkDistance) {
              const alpha = 1 - distance / safeNeuralLinkDistance;
              // The color picker returns hex values, while older saved values
              // may be rgb/rgba. Normalize both formats before applying the
              // distance-based opacity to every connection line.
              context.strokeStyle = normalizeColorToRgba(
                neuralColors?.link ?? "#7DD3FC",
                alpha * 0.34,
              );
              context.lineWidth = 0.8;
              context.beginPath();
              context.moveTo(point.x, point.y);
              context.lineTo(other.x, other.y);
              context.stroke();
            }
          }

          context.fillStyle = neuralColors?.dot ?? "rgba(147, 197, 253, 0.9)";
          context.beginPath();
          context.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
          context.fill();
        }
      } else if (variant === "nebula") {
        for (let i = 0; i < nebulae.length; i += 1) {
          const nebula = nebulae[i];

          if (nebula.status === "waiting") {
            nebula.waitCounter -= 1;
            if (nebula.waitCounter <= 0) {
              nebula.status = "fadein";
            }
          } else if (nebula.status === "fadein") {
            nebula.opacity += safeNebulaOpacityStep;
            if (nebula.opacity >= safeNebulaMaxOpacity) {
              nebula.status = "fadeout";
            }
          } else {
            nebula.opacity -= safeNebulaOpacityStep;
            if (nebula.opacity <= 0) {
              const refreshed = initNebula(width, height);
              nebula.x = refreshed.x;
              nebula.y = refreshed.y;
              nebula.radius = refreshed.radius;
              nebula.opacity = 0;
              nebula.status = "waiting";
              nebula.waitCounter = safeNebulaDelayFrames;
            }
          }

          if (nebula.opacity <= 0) {
            continue;
          }

          const gradient = context.createRadialGradient(
            nebula.x,
            nebula.y,
            0,
            nebula.x,
            nebula.y,
            nebula.radius,
          );

          gradient.addColorStop(
            0,
            normalizeColorToRgba(nebulaExplosionColor, nebula.opacity),
          );
          gradient.addColorStop(
            0.6,
            normalizeColorToRgba(nebulaExplosionColor, nebula.opacity * 0.2),
          );
          gradient.addColorStop(1, "rgba(11, 7, 22, 0)");

          context.fillStyle = gradient;
          context.beginPath();
          context.arc(nebula.x, nebula.y, nebula.radius, 0, Math.PI * 2);
          context.fill();
        }
      } else {
        for (const particle of particles) {
          particle.x += particle.vx * deltaSeconds;
          particle.y += particle.vy * deltaSeconds;

          if (
            particle.x < -particle.radius
            || particle.x > width + particle.radius
            || particle.y < -particle.radius
            || particle.y > height + particle.radius
          ) {
            recycleParticle(particle, width, height);
          }

          const pulseOpacity = safeParticleFrequency === 0
            ? particle.opacity
            : particle.opacity * (0.55 + 0.45 * ((Math.sin(particleElapsedSeconds * Math.PI * 2 * safeParticleFrequency + particle.phase) + 1) / 2));
          context.fillStyle = normalizeColorToRgba(particleColor, pulseOpacity);
          context.beginPath();
          context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
          context.fill();
        }
      }

      pulse += variant === "nebula" ? safeNebulaPulseSpeed : 0.01;
      animationFrameId = window.requestAnimationFrame(draw);
    };

    resize();
    draw(window.performance.now());

    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
    };
  }, [
    variant,
    safeNeuralPointCount,
    safeNeuralLinkDistance,
    neuralColors,
    safeNebulaCount,
    safeNebulaMinRadius,
    safeNebulaMaxRadius,
    safeNebulaOpacityStep,
    safeNebulaMaxOpacity,
    safeNebulaDelayFrames,
    nebulaColor,
    nebulaExplosionColor,
    nebulaBackgroundStart,
    nebulaBackgroundEnd,
    safeNebulaPulseSpeed,
    safeParticleCount,
    safeParticleSpeed,
    safeParticleFrequency,
    safeParticleMinSize,
    safeParticleMaxSize,
    safeParticleOpacity,
    particleDirection,
    particleColor,
    particleBackgroundColor,
    transparent,
  ]);

  if (variant === "color") {
    const primaryColor = colorMode === "fixed"
      ? (backgroundColor || backgroundColors[0] || "")
      : (backgroundColors[0] ?? backgroundColor);
    const isStaticGradient = colorMode === "gradient" && backgroundColors.length > 1;
    const useLegacyUtilityClass = colorMode === "fixed"
      && primaryColor !== ""
      && !primaryColor.includes("#");

    return (
      <div
        ref={containerRef}
        data-slot="background"
        className={containerClasses}
        style={style}
      >
        <div
          ref={colorLayerRef}
          data-slot="background-color"
          className={cn(
            "h-full w-full",
            transparent || primaryColor === ""
              ? "bg-transparent"
              : useLegacyUtilityClass
                ? `bg-${primaryColor}`
                : ``,
          )}
          style={{
            ...(!transparent && !useLegacyUtilityClass && !isStaticGradient
              ? { backgroundColor: primaryColor }
              : {}),
            ...(!transparent && isStaticGradient
              ? {
                  backgroundImage: `linear-gradient(${gradientAngle}deg, ${backgroundColors.join(", ")})`,
                }
              : {}),
          }}
        />
      </div>
    );
  }

  if (variant === "image") {
    return (
      <div
        ref={containerRef}
        data-slot="background"
        className={containerClasses}
        style={style}
      >
        <img
          data-slot="background-image"
          src={props.imageSrc}
          alt={props.imageAlt ?? "Background image"}
          className={cn(
            "h-full w-full object-cover",
            transparent && "opacity-0",
            props.imageClassName,
          )}
        />
        <div
          aria-hidden
          className={cn("absolute inset-0", transparent ? "bg-transparent" : "bg-black/25", overlayClassName)}
        />
      </div>
    );
  }

  if (variant === "video") {
    return (
      <div
        ref={containerRef}
        data-slot="background"
        className={containerClasses}
        style={style}
      >
        <video
          data-slot="background-video"
          className={cn("h-full w-full object-cover", transparent && "opacity-0")}
          src={props.videoSrc}
          poster={props.videoPoster}
          muted={props.videoMuted ?? true}
          loop={props.videoLoop ?? true}
          autoPlay={props.videoAutoPlay ?? true}
          playsInline={props.videoPlaysInline ?? true}
        />
        <div
          aria-hidden
          className={cn("absolute inset-0", overlayClassName)}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-slot="background"
      className={containerClasses}
      style={style}
    >
      <canvas
        ref={canvasRef}
        data-slot={
          variant === "nebula"
            ? "background-nebula"
            : variant === "particles"
              ? "background-particles"
              : "background-neural"
        }
        className="h-full w-full"
      />
      <div
        aria-hidden
        className={cn("absolute inset-0", overlayClassName)}
      />
    </div>
  );
}
