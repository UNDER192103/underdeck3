import React, { useEffect, useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Palette, Pipette } from "lucide-react";

interface DiscordColorPickerProps {
    label?: string;
    value: string;
    className?: string;
    onChange: (hex: string) => void;
    onChangeWithAlpha?: (hexWithAlpha: string, alpha: number) => void;
    showAlpha?: boolean;
    alpha?: number;
}

interface HSV {
    h: number;
    s: number;
    v: number;
}

declare global {
    interface Window {
        EyeDropper?: new () => {
            open: () => Promise<{ sRGBHex: string }>;
        };
    }
}

const PRESET_COLORS = [
    "#1f2937", "#111827", "#0f172a", "#1d4ed8", "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444",
    "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#64748b", "#94a3b8", "#e5e7eb", "#ffffff",
];

function clamp(n: number, min: number, max: number) {
    return Math.min(max, Math.max(min, n));
}

function normalizeHex(hex: string) {
    const value = hex.trim().replace("#", "");
    if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;
    return `#${value.toUpperCase()}`;
}

function normalizeHexWithAlpha(hex: string) {
    const value = hex.trim().replace("#", "");
    if (!/^[0-9a-fA-F]{8}$/.test(value)) return null;
    return `#${value.toUpperCase()}`;
}

function hexToAlpha(hex: string): number {
    const normalized = hex.trim().replace("#", "");
    if (normalized.length === 8) {
        const alpha = parseInt(normalized.slice(6, 8), 16) / 255;
        return Math.round(alpha * 100) / 100;
    }
    return 1;
}

function alphaToHex(alpha: number): string {
    const value = Math.round(clamp(alpha, 0, 1) * 255).toString(16).padStart(2, "0");
    return value.toUpperCase();
}

function hsvToHex({ h, s, v }: HSV) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0;
    let g = 0;
    let b = 0;

    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else[r, g, b] = [c, 0, x];

    const toHex = (n: number) => {
        const value = Math.round((n + m) * 255).toString(16).padStart(2, "0");
        return value.toUpperCase();
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsv(hex: string): HSV {
    const normalized = normalizeHex(hex) || "#000000";
    const r = parseInt(normalized.slice(1, 3), 16) / 255;
    const g = parseInt(normalized.slice(3, 5), 16) / 255;
    const b = parseInt(normalized.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let h = 0;
    if (delta !== 0) {
        if (max === r) h = 60 * (((g - b) / delta) % 6);
        else if (max === g) h = 60 * ((b - r) / delta + 2);
        else h = 60 * ((r - g) / delta + 4);
    }
    if (h < 0) h += 360;

    const s = max === 0 ? 0 : delta / max;
    const v = max;
    return { h, s, v };
}

export function DiscordColorPicker({ label, value, className, onChange, onChangeWithAlpha, showAlpha = false, alpha: externalAlpha }: DiscordColorPickerProps) {
    const [open, setOpen] = useState(false);
    const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value));
    const [textValue, setTextValue] = useState(() => {
        // Se o valor tiver 8 chars, extrair apenas os 6 primeiros (sem alpha)
        const val = value.trim().replace("#", "");
        if (val.length === 8) {
            return `#${val.slice(0, 6).toUpperCase()}`;
        }
        return value.toUpperCase();
    });
    const [alpha, setAlpha] = useState(() => {
        if (externalAlpha !== undefined) return externalAlpha;
        // Extrair alpha do valor se tiver 8 caracteres
        const val = value.trim().replace("#", "");
        if (val.length === 8) {
            const a = parseInt(val.slice(6, 8), 16) / 255;
            return Math.round(a * 100) / 100;
        }
        return 1;
    });
    const areaRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (externalAlpha !== undefined) {
            setAlpha(externalAlpha);
        } else {
            // Extrair alpha do valor se tiver 8 caracteres
            const val = value.trim().replace("#", "");
            if (val.length === 8) {
                const a = parseInt(val.slice(6, 8), 16) / 255;
                setAlpha(Math.round(a * 100) / 100);
            } else {
                setAlpha(1);
            }
        }
    }, [value, externalAlpha]);

    useEffect(() => {
        // Se o valor tiver 8 chars, usar apenas os 6 primeiros para HSV
        const val = value.trim().replace("#", "");
        const hexColor = val.length === 8 ? `#${val.slice(0, 6)}` : value;
        const normalized = normalizeHex(hexColor) || "#000000";
        setTextValue(normalized);
        setHsv(hexToHsv(normalized));
    }, [value, showAlpha]);

    const currentHex = useMemo(() => hsvToHex(hsv), [hsv]);

    const currentHexWithAlpha = useMemo(() => {
        return `${currentHex}${alphaToHex(alpha)}`;
    }, [currentHex, alpha]);

    const handleAlphaChange = (newAlpha: number) => {
        const clampedAlpha = Math.round(newAlpha * 100) / 100;
        setAlpha(clampedAlpha);
        if (onChangeWithAlpha) {
            onChangeWithAlpha(`${currentHex}${alphaToHex(clampedAlpha)}`, clampedAlpha);
        }
    };

    const handleAreaPointer = (clientX: number, clientY: number) => {
        if (!areaRef.current) return;
        const rect = areaRef.current.getBoundingClientRect();
        const x = clamp(clientX - rect.left, 0, rect.width);
        const y = clamp(clientY - rect.top, 0, rect.height);
        const s = x / rect.width;
        const v = 1 - y / rect.height;
        const next = { ...hsv, s, v };
        setHsv(next);
        const hex = hsvToHex(next);
        onChange(hex);
        onChangeWithAlpha?.(`${hex}${alphaToHex(alpha)}`, alpha);
    };

    return (
        <div className="flex flex-col items-center gap-2">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        className={`h-10 w-15 rounded-lg border border-border relative overflow-hidden ${className}`}
                        aria-label={`Escolher cor ${label || "da aplicação"} (atualmente ${value})`}
                    >
                        {showAlpha && (
                            <div
                                className="absolute inset-0 -z-10"
                                style={{
                                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='8' viewBox='0 0 8 8' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000000' fill-opacity='0.15'%3E%3Cpath fill-rule='evenodd' d='M0 0h4v4H0V0zm4 4h4v4H4V4z'/%3E%3C/g%3E%3C/svg%3E")`,
                                }}
                            />
                        )}
                        <div
                            className="absolute inset-0"
                            style={{ background: showAlpha ? `${currentHex}${alphaToHex(alpha)}` : value }}
                        />
                    </button>
                </PopoverTrigger>

                <PopoverContent align="start" className="w-[280px] p-3 space-y-3 bg-black">
                    <div
                        ref={areaRef}
                        className="relative h-32 w-full rounded-lg border cursor-crosshair"
                        style={{ backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }}
                        onPointerDown={(e) => {
                            handleAreaPointer(e.clientX, e.clientY);
                            const move = (ev: PointerEvent) => handleAreaPointer(ev.clientX, ev.clientY);
                            const up = () => {
                                window.removeEventListener("pointermove", move);
                                window.removeEventListener("pointerup", up);
                            };
                            window.addEventListener("pointermove", move);
                            window.addEventListener("pointerup", up);
                        }}
                    >
                        <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-white/100 to-transparent" />
                        <div className="absolute inset-0 rounded-lg bg-gradient-to-t from-black/100 to-transparent" />
                        <div
                            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow"
                            style={{
                                left: `${hsv.s * 100}%`,
                                top: `${(1 - hsv.v) * 100}%`,
                            }}
                        />
                    </div>

                    <div
                        className="w-full rounded-md"
                        style={{
                            background: "linear-gradient(90deg,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%)",
                            padding: "4px",
                            borderRadius: "6px",
                        }}
                    >
                        <Slider
                            value={[hsv.h]}
                            onValueChange={([h]) => {
                                const next = { ...hsv, h };
                                setHsv(next);
                                const hex = hsvToHex(next);
                                onChange(hex);
                                if (onChangeWithAlpha) {
                                    onChangeWithAlpha(`${hex}${alphaToHex(alpha)}`, alpha);
                                }
                            }}
                            min={0}
                            max={360}
                            step={1}
                            className="w-full hue-slider"
                        />
                    </div>

                    {showAlpha && (
                        <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs text-white/70">
                                <span>Transparency</span>
                                <span>{Math.round(alpha * 100)}%</span>
                            </div>
                            <div
                                className="w-full rounded-md"
                                style={{
                                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='8' viewBox='0 0 8 8' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000000' fill-opacity='0.15'%3E%3Cpath fill-rule='evenodd' d='M0 0h4v4H0V0zm4 4h4v4H4V4z'/%3E%3C/g%3E%3C/svg%3E")`,
                                    backgroundColor: currentHex,
                                    padding: "4px",
                                    borderRadius: "6px",
                                }}
                            >
                                <Slider
                                    value={[alpha]}
                                    onValueChange={([a]) => handleAlphaChange(a)}
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    className="w-full alpha-slider"
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-2 rounded-xl border border-border px-2 py-1">
                        <Palette size={16} />
                        <Input
                            value={textValue}
                            onChange={(e) => setTextValue(e.target.value)}
                            onBlur={() => {
                                const normalized = normalizeHex(textValue);
                                if (normalized) {
                                  onChange(normalized);
                                  onChangeWithAlpha?.(`${normalized}${alphaToHex(alpha)}`, alpha);
                                } else {
                                    setTextValue(currentHex);
                                }
                            }}
                            className="h-8 border-0 px-1"
                        />
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            disabled={!window.EyeDropper}
                            onClick={async () => {
                                if (!window.EyeDropper) return;
                                try {
                                    const eyeDropper = new window.EyeDropper();
                                    const result = await eyeDropper.open();
                                    const normalized = normalizeHex(result.sRGBHex);
                                    if (normalized) {
                                        onChange(normalized);
                                        onChangeWithAlpha?.(`${normalized}${alphaToHex(alpha)}`, alpha);
                                    }
                                } catch {
                                    // cancelado pelo usuario
                                }
                            }}
                        >
                            <Pipette size={16} />
                        </Button>
                    </div>

                    <div className="grid grid-cols-8 gap-2">
                        {PRESET_COLORS.map((preset) => (
                            <button
                                key={preset}
                                type="button"
                                className="h-6 w-6 rounded-lg border border-border"
                                style={{ background: preset }}
                                onClick={() => {
                            onChange(preset);
                            if (onChangeWithAlpha) {
                                onChangeWithAlpha(`${preset}${alphaToHex(alpha)}`, alpha);
                            }
                        }}
                                aria-label={`Cor ${preset}`}
                            />
                        ))}
                    </div>
                </PopoverContent>
            </Popover>
            {label && (
                <Label className="flex h-5 w-full items-center justify-center text-center leading-none">
                    {label}
                </Label>
            )}
        </div>
    );
}
