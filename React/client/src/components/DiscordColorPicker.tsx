import React, { useEffect, useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Palette, Pipette } from "lucide-react";

interface DiscordColorPickerProps {
    label: string;
    value: string;
    onChange: (hex: string) => void;
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
    else [r, g, b] = [c, 0, x];

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

export function DiscordColorPicker({ label, value, onChange }: DiscordColorPickerProps) {
    const [open, setOpen] = useState(false);
    const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value));
    const [textValue, setTextValue] = useState(value.toUpperCase());
    const areaRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const normalized = normalizeHex(value) || "#000000";
        setTextValue(normalized);
        setHsv(hexToHsv(normalized));
    }, [value]);

    const currentHex = useMemo(() => hsvToHex(hsv), [hsv]);

    const handleAreaPointer = (clientX: number, clientY: number) => {
        if (!areaRef.current) return;
        const rect = areaRef.current.getBoundingClientRect();
        const x = clamp(clientX - rect.left, 0, rect.width);
        const y = clamp(clientY - rect.top, 0, rect.height);
        const s = x / rect.width;
        const v = 1 - y / rect.height;
        const next = { ...hsv, s, v };
        setHsv(next);
        onChange(hsvToHex(next));
    };

    return (
        <div className="flex flex-col items-center gap-2">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        className="h-10 w-15 rounded-lg border border-border"
                        style={{ background: value }}
                        aria-label={`Escolher cor ${label}`}
                    />
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

                    <input
                        type="range"
                        min={0}
                        max={360}
                        value={hsv.h}
                        onChange={(e) => {
                            const next = { ...hsv, h: Number(e.target.value) };
                            setHsv(next);
                            onChange(hsvToHex(next));
                        }}
                        className="w-full"
                        style={{
                            background: "linear-gradient(90deg,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%)",
                        }}
                    />

                    <div className="flex items-center gap-2 rounded-xl border border-border px-2 py-1">
                        <Palette size={16} />
                        <Input
                            value={textValue}
                            onChange={(e) => setTextValue(e.target.value)}
                            onBlur={() => {
                                const normalized = normalizeHex(textValue);
                                if (normalized) {
                                    onChange(normalized);
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
                                    if (normalized) onChange(normalized);
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
                                onClick={() => onChange(preset)}
                                aria-label={`Cor ${preset}`}
                            />
                        ))}
                    </div>
                </PopoverContent>
            </Popover>
            <Label className="flex h-5 w-full items-center justify-center text-center leading-none">
                {label}
            </Label>
        </div>
    );
}
