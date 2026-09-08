"use client";

import * as React from "react";
import { Check, Copy as CopyIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent } from "@/components/ui/tooltip";
import { TooltipTrigger } from "@radix-ui/react-tooltip";

type CopyMode = "button" | "input" | "code" | "text";

type ButtonProps = React.ComponentProps<typeof Button>;

type CopyProps = {
    value?: string | number | null;
    children?: React.ReactNode;

    mode?: CopyMode;

    label?: string;
    copiedLabel?: string;
    showLabel?: boolean;

    successMessage?: string;
    errorMessage?: string;
    tooltipPreviewLength?: number | false;

    disabled?: boolean;

    className?: string;
    textClassName?: string;
    inputClassName?: string;
    buttonClassName?: string;
    codeClassName?: string;

    variant?: ButtonProps["variant"];
    size?: ButtonProps["size"];
    rounded?: ButtonProps["rounded"];
    glassMode?: ButtonProps["glassMode"];

    buttonProps?: Omit<
        ButtonProps,
        | "children"
        | "onClick"
        | "disabled"
        | "type"
        | "variant"
        | "size"
        | "rounded"
        | "glassMode"
        | "className"
    >;

    onCopied?: (value: boolean) => void;
};

async function copyToClipboard(text: string) {
    if (!text) return false;

    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }

        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        textarea.style.pointerEvents = "none";
        textarea.setAttribute("readonly", "");

        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        const copied = document.execCommand("copy");
        document.body.removeChild(textarea);

        return copied;
    } catch {
        return false;
    }
}

export function Copy({
    value,
    children,
    mode = "button",

    label = "Copiar",
    copiedLabel = "Copiado",
    showLabel = true,

    successMessage = "Texto copiado com sucesso.",
    errorMessage = "Não foi possível copiar o texto.",

    tooltipPreviewLength = 140,
    disabled = false,

    className,
    textClassName,
    inputClassName,
    buttonClassName,
    codeClassName,

    variant = "outline",
    size,
    rounded,
    glassMode,

    buttonProps,

    onCopied,
}: CopyProps) {
    const [copied, setCopied] = React.useState(false);

    const textToCopy = React.useMemo(() => {
        if (value !== undefined && value !== null) {
            return String(value);
        }

        if (typeof children === "string" || typeof children === "number") {
            return String(children);
        }

        return "";
    }, [value, children]);

    const handleCopy = async () => {
        if (disabled || !textToCopy) return;

        const ok = await copyToClipboard(textToCopy);

        if (!ok) {
            if (onCopied) onCopied(false);
            toast.error(errorMessage);
            return;
        }

        setCopied(true);
        toast.success(successMessage);
        if (onCopied) onCopied(true);
        window.setTimeout(() => {
            setCopied(false);
        }, 1500);
    };

    const Icon = copied ? Check : CopyIcon;
    const buttonText = copied ? copiedLabel : label;

    const computedSize = size ?? (!showLabel ? "icon-sm" : "default");
    const tooltipText = React.useMemo(() => {
        if (tooltipPreviewLength === false || !textToCopy) return "";
        if (textToCopy.length <= tooltipPreviewLength) return textToCopy;
        return `${textToCopy.slice(0, tooltipPreviewLength)}...`;
    }, [textToCopy, tooltipPreviewLength]);

    const copyButton = (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    variant={variant}
                    size={computedSize}
                    rounded={rounded}
                    glassMode={glassMode}
                    onClick={handleCopy}
                    disabled={disabled || !textToCopy}
                    className={cn("gap-2", buttonClassName)}
                    aria-label={buttonText}
                    title={buttonText}
                    {...buttonProps}
                >
                    <Icon className={cn("h-4 w-4", copied ? "text-green-700" : "")} />
                    {showLabel && buttonText}
                </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm break-words">
                {tooltipText ? `${buttonText}: ${tooltipText}` : buttonText}
            </TooltipContent>
        </Tooltip>
    );

    if (mode === "input") {
        return (
            <div className={cn("flex items-center gap-2", className)}>
                <Input
                    readOnly
                    value={textToCopy}
                    className={cn("font-mono", inputClassName)}
                />

                {copyButton}
            </div>
        );
    }

    if (mode === "text") {
        return (
            <div className={cn("flex items-center gap-3", className)}>
                <span
                    className={cn(
                        "min-w-0 flex-1 truncate text-sm text-foreground",
                        textClassName,
                    )}
                    title={textToCopy}
                >
                    {textToCopy}
                </span>

                {copyButton}
            </div>
        );
    }

    if (mode === "code") {
        return (
            <div className={cn("relative rounded-lg border bg-muted/40", className)}>
                <div className="flex h-full absolute right-2 items-center justify-center">{copyButton}</div>
                <pre
                    className={cn(
                        "overflow-x-auto p-3 text-sm",
                        showLabel ? "pr-28" : "pr-14",
                        codeClassName,
                    )}
                >
                    <code>{textToCopy}</code>
                </pre>
            </div>
        );
    }

    return copyButton;
}
