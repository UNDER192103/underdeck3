import type { ShortcutKey } from "./shortcuts.js";

export interface OverlaySettings {
    enabled: boolean;
    keys: ShortcutKey[];
    closeOnBlur: boolean;
}
