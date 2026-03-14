import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

export type BackgroundVariant = "image" | "video" | "neural";

type Point = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
};

type BaseBackgroundProps = {
  fullScreen?: boolean;
  className?: string;
  overlayClassName?: string;
  style?: CSSProperties;
};

type ImageBackgroundProps = BaseBackgroundProps & {
  variant: "image";
  imageSrc: string;
  imageAlt?: string;
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

export type BackgroundProps =
  | ImageBackgroundProps
  | VideoBackgroundProps
  | NeuralBackgroundProps;

export function BackgroundComp(props: BackgroundProps) {
  const { variant, fullScreen = true, className, overlayClassName, style } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const containerClasses = cn(
    "pointer-events-none overflow-hidden",
    fullScreen ? "fixed inset-0 -z-10" : "absolute inset-0",
    className
  );

  const neuralPointCount = variant === "neural" ? (props.neuralPointCount ?? 54) : 54;
  const neuralLinkDistance = variant === "neural" ? (props.neuralLinkDistance ?? 280) : 280;
  const neuralColors =
    variant === "neural"
      ? {
          center: props.neuralColors?.center ?? "rgba(21, 25, 100, 0.53)",
          middle: props.neuralColors?.middle ?? "rgb(2, 26, 75)",
          edge: props.neuralColors?.edge ?? "rgb(3, 9, 29)",
          link: props.neuralColors?.link ?? "rgba(125, 211, 252, 1)",
          dot: props.neuralColors?.dot ?? "rgba(147, 197, 253, 0.9)",
        }
      : null;

  const safeNeuralPointCount = useMemo(() => {
    return Math.max(6, Math.min(neuralPointCount, 120));
  }, [neuralPointCount]);

  const safeNeuralLinkDistance = useMemo(() => {
    return Math.max(60, Math.min(neuralLinkDistance, 280));
  }, [neuralLinkDistance]);

  useEffect(() => {
    if (variant !== "neural") {
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
    let animationFrameId = 0;
    const pulse = {
      angle: 0,
    };

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;

      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.scale(ratio, ratio);

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
    };

    const drawGradient = (width: number, height: number) => {
      const pulseStrength = 0.12 + (Math.sin(pulse.angle) + 1) * 0.07;

      const gradient = context.createRadialGradient(
        width * 0.5,
        height * 0.42,
        width * 0.12,
        width * 0.5,
        height * 0.5,
        width * 0.88
      );

      gradient.addColorStop(0, neuralColors?.center ?? `rgba(21, 25, 100, ${0.34 + pulseStrength})`);
      gradient.addColorStop(0.5, neuralColors?.middle ?? "rgb(2, 26, 75)");
      gradient.addColorStop(1, neuralColors?.edge ?? "rgb(3, 9, 29)");

      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
    };

    const draw = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      drawGradient(width, height);

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
            if (neuralColors?.link?.startsWith("rgba(")) {
              context.strokeStyle = neuralColors.link.replace(/rgba\((.+),\s*1\)/, `rgba($1, ${alpha * 0.34})`);
            } else {
              context.strokeStyle = `rgba(125, 211, 252, ${alpha * 0.34})`;
            }
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

      pulse.angle += 0.01;
      animationFrameId = window.requestAnimationFrame(draw);
    };

    resize();
    draw();

    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
    };
  }, [variant, safeNeuralPointCount, safeNeuralLinkDistance]);

  if (variant === "image") {
    return (
      <div data-slot="background" className={containerClasses} style={style}>
        <img
          data-slot="background-image"
          src={props.imageSrc}
          alt={props.imageAlt ?? "Background image"}
          className="h-full w-full object-cover"
        />
        <div
          aria-hidden
          className={cn("absolute inset-0 bg-black/25", overlayClassName)}
        />
      </div>
    );
  }

  if (variant === "video") {
    return (
      <div data-slot="background" className={containerClasses} style={style}>
        <video
          data-slot="background-video"
          className="h-full w-full object-cover"
          src={props.videoSrc}
          poster={props.videoPoster}
          muted={props.videoMuted ?? true}
          loop={props.videoLoop ?? true}
          autoPlay={props.videoAutoPlay ?? true}
          playsInline={props.videoPlaysInline ?? true}
        />
        <div
          aria-hidden
          className={cn("absolute inset-0 bg-slate-950/40", overlayClassName)}
        />
      </div>
    );
  }

  return (
    <div data-slot="background" className={containerClasses} style={style}>
      <canvas
        ref={canvasRef}
        data-slot="background-neural"
        className="h-full w-full"
      />
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 bg-gradient-to-b from-blue-900/10 via-transparent to-blue-950/25",
          overlayClassName
        )}
      />
    </div>
  );
}
