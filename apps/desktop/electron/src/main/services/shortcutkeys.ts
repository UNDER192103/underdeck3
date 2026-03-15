import { uIOhook, UiohookKey, type UiohookKeyboardEvent } from "uiohook-napi";
import { Shortcut, AlternativeShortcut, type ShortcutKey } from "../../types/shortcuts";
import EventEmitter from "node:events";
import { logsService } from "./logs.js";

const LEGACY_KEY_OVERRIDES: Record<string, string> = {
    CONTROL: "CTRL",
    CTRL: "CTRL",
    SHIFT: "SHIFT",
    ALT: "ALT",
    OPTION: "ALT",
    META: "META",
    CMD: "META",
    COMMAND: "META",
    WIN: "META",
    WINDOWS: "META",
};

const UIHOOK_KEY_LABEL_OVERRIDES: Record<string, string> = {
    Ctrl: "CTRL",
    CtrlRight: "CTRL",
    Shift: "SHIFT",
    ShiftRight: "SHIFT",
    Alt: "ALT",
    AltRight: "ALT",
    Meta: "META",
    MetaRight: "META",
    ArrowLeft: "LEFT",
    ArrowRight: "RIGHT",
    ArrowUp: "UP",
    ArrowDown: "DOWN",
    PageUp: "PAGEUP",
    PageDown: "PAGEDOWN",
    CapsLock: "CAPSLOCK",
    NumLock: "NUMLOCK",
    ScrollLock: "SCROLLLOCK",
    PrintScreen: "PRINTSCREEN",
};

const keyCodeToLabel = new Map<number, string>();
const keyLabelToCode = new Map<string, number>();

Object.entries(UiohookKey).forEach(([name, value]) => {
    if (typeof value !== "number") return;
    const label = UIHOOK_KEY_LABEL_OVERRIDES[name] ?? name.toUpperCase();
    if (!keyCodeToLabel.has(value)) {
        keyCodeToLabel.set(value, label);
    }
    if (!keyLabelToCode.has(label)) {
        keyLabelToCode.set(label, value);
    }
});

const normalizeLegacyKeyLabel = (raw: string) => {
    const normalized = String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
    if (!normalized) return "";
    if (normalized.includes("CTRL") || normalized.includes("CONTROL")) return "CTRL";
    if (normalized.includes("SHIFT")) return "SHIFT";
    if (normalized.includes("ALT") || normalized.includes("OPTION")) return "ALT";
    if (normalized.includes("META") || normalized.includes("CMD") || normalized.includes("WIN")) return "META";
    if (normalized.startsWith("ARROW")) return normalized.replace("ARROW", "");
    const fallback = LEGACY_KEY_OVERRIDES[normalized];
    return fallback ?? normalized;
};

const buildKeyInfoFromCode = (keycode: number): ShortcutKey => {
    const label = keyCodeToLabel.get(keycode) ?? `KEY_${keycode}`;
    return { keyCode: keycode, key: label };
};

const normalizeShortcutKey = (input: unknown): ShortcutKey | null => {
    if (!input) return null;

    if (typeof input === "string") {
        const label = normalizeLegacyKeyLabel(input);
        if (!label) return null;
        const code = keyLabelToCode.get(label) ?? 0;
        return { keyCode: code, key: label };
    }

    if (typeof input === "object") {
        const candidate = input as Partial<ShortcutKey> & { key?: unknown; keyCode?: unknown };
        const label = typeof candidate.key === "string" ? normalizeLegacyKeyLabel(candidate.key) : "";
        const code =
            typeof candidate.keyCode === "number"
                ? candidate.keyCode
                : keyLabelToCode.get(label) ?? 0;

        if (!label && !code) return null;

        return { keyCode: code, key: label || `KEY_${code}` };
    }

    return null;
};

export const normalizeShortcutKeys = (input: unknown): ShortcutKey[] => {
    if (!Array.isArray(input)) return [];

    const seen = new Set<string>();
    const result: ShortcutKey[] = [];

    input.forEach((entry) => {
        const normalized = normalizeShortcutKey(entry);
        if (!normalized) return;

        if (seen.has(normalized.key)) return;

        seen.add(normalized.key);
        result.push(normalized);
    });

    return result;
};

const buildKeyCombo = (keys: ShortcutKey[]) =>
    keys
        .map((key) => key.key)
        .sort()
        .join("+");

export class Shortcutkey extends EventEmitter {

    private func_return_combo: ((keys: ShortcutKey[]) => void) | null = null;

    private macros = new Map<string, { keys: ShortcutKey[]; keyCombo: string; data: Shortcut }>();

    private alternativesMacros = new Map<string, { keys: ShortcutKey[]; keyCombo: string; data: AlternativeShortcut }>();

    private started = false;

    private macrosEnabled = true;

    private pressedKeys = new Map<number, ShortcutKey>();

    private comboBuffer: ShortcutKey[] = [];

    private onKeyDown?: (event: UiohookKeyboardEvent) => void;

    private onKeyUp?: (event: UiohookKeyboardEvent) => void;


    constructor() {
        super();
    }

    start() {

        if (this.started) return;

        this.onKeyDown = (event) => {

            const keyInfo = buildKeyInfoFromCode(event.keycode);

            if (!this.pressedKeys.has(keyInfo.keyCode)) {
                this.pressedKeys.set(keyInfo.keyCode, keyInfo);
                this.comboBuffer.push(keyInfo);
            }

        };

        this.onKeyUp = (event) => {

            if (this.comboBuffer.length === 0) return;

            const snapshot = [...this.comboBuffer];

            this.comboBuffer = [];

            this.pressedKeys.clear();

            this.checkMacros(snapshot);

        };

        uIOhook.on("keydown", this.onKeyDown);

        uIOhook.on("keyup", this.onKeyUp);

        uIOhook.start();

        this.started = true;

        logsService.log("shortcuts", "listener.start");
    }

    stop() {
        if (!this.started) return;

        if (this.onKeyDown) {
            uIOhook.off("keydown", this.onKeyDown);
        }

        if (this.onKeyUp) {
            uIOhook.off("keyup", this.onKeyUp);
        }

        this.onKeyDown = undefined;

        this.onKeyUp = undefined;

        this.pressedKeys.clear();

        this.comboBuffer = [];

        uIOhook.stop();

        this.started = false;

        logsService.log("shortcuts", "listener.stop");
    }

    isStarted() {
        return this.macrosEnabled;
    }

    setMacrosEnabled(enabled: boolean) {

        this.macrosEnabled = enabled;

        logsService.log("shortcuts", "listener.macros", { enabled });

    }

    registerNewMacro(shortcut: Shortcut) {
        const keys = normalizeShortcutKeys(shortcut.meta_data.keys);

        const keyCombo = buildKeyCombo(keys);

        this.macros.set(`${shortcut.id}-${shortcut.meta_data.appId}`, {
            keys: keys,
            keyCombo: keyCombo,
            data: shortcut,
        });

    }

    registerNewAlternativeMacro(shortcut: AlternativeShortcut) {
        const keys = normalizeShortcutKeys(shortcut.keys);

        const keyCombo = buildKeyCombo(keys);

        this.alternativesMacros.set(`${shortcut.id}`, {
            keys: keys,
            keyCombo: keyCombo,
            data: shortcut,
        });

    }

    async updateAlternativeMacros(shortcuts: AlternativeShortcut[]) {

        this.alternativesMacros.clear();

        try {

            shortcuts.forEach((shortcut) => {

                this.registerNewAlternativeMacro(shortcut);

            });

        } catch (error) {

            console.error("Erro ao carregar atalhos alternativos:", error);

        }

        return true;

    }

    async updateDataMacros(shortcuts: Shortcut[]) {

        this.macros.clear();

        try {

            shortcuts.forEach((shortcut) => {

                this.registerNewMacro(shortcut);

            });

        } catch (error) {

            console.error("Erro ao carregar macros:", error);

        }

        return true;

    }

    getComboKeys() {

        return new Promise<ShortcutKey[]>((resolve) => {

            if (!this.started) {
                this.start();
            }

            this.func_return_combo = resolve;

            logsService.log("shortcuts", "combo.capture.start");

        });

    }

    checkMacros(keysPressed: ShortcutKey[]) {

        if (this.func_return_combo) {

            const keys = normalizeShortcutKeys(keysPressed);

            this.func_return_combo(keys);

            this.func_return_combo = null;

            logsService.log("shortcuts", "combo.capture.done", { keys });

            return;

        }

        if (!keysPressed.length) return;

        const keys = normalizeShortcutKeys(keysPressed);

        const keyCombo = buildKeyCombo(keys);

        if (this.alternativesMacros.size > 0) {

            this.alternativesMacros.forEach((data, id) => {

                if (keyCombo === data.keyCombo) {

                    this.emit("alternative-shortcut", data);

                    logsService.log("shortcuts", "alternative.matched", { id, keyCombo });

                }

            });

        }

        if (!this.macrosEnabled) return;

        if (this.macros.size > 0) {

            this.macros.forEach((data, id) => {

                if (keyCombo === data.keyCombo) {

                    this.emit("shortcut", data);

                    logsService.log("shortcuts", "shortcut.matched", { id, keyCombo });

                }

            });

        }

    }

}