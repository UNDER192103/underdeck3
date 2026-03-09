import { GlobalKeyboardListener } from "node-global-key-listener";
import { Shortcut, AlternativeShortcut } from "../../types/shortcuts";
import EventEmitter from "node:events";

export class Shortcutkey extends EventEmitter {
    private func_return_combo: ((keys: string[]) => void) | null = null;
    private listener: GlobalKeyboardListener;
    private macros = new Map<string, { keys: string[]; keyCombo: string; data: Shortcut }>();
    private alternativesMacros = new Map<string, { keys: string[]; keyCombo: string; data: AlternativeShortcut }>();
    private started = false;


    constructor() {
        super();
        this.listener = new GlobalKeyboardListener();
    }

    start() {
        if (this.started) return;
        const pressedKeys = new Set<string>();

        this.listener.addListener((e, down) => {
            if (down) {
                if (e.state === 'UP') {
                    this.checkMacros(pressedKeys);
                    pressedKeys.clear();
                }
                else {
                    if (e.name) pressedKeys.add(e.name);
                }
            } else {
                if (e.name) pressedKeys.delete(e.name);
            }
        });
        this.started = true;
    }

    stop() {
        if (!this.started) return;
        this.listener.kill();
        this.listener = new GlobalKeyboardListener();
        this.started = false;
    }

    isStarted() {
        return this.started;
    }

    registerNewMacro(shortcut: Shortcut) {
        const keys = shortcut.meta_data.keys;
        const keyCombo = keys.join('+');
        this.macros.set(`${shortcut.id}-${shortcut.meta_data.appId}`, {
            keys: keys,
            keyCombo: keyCombo,
            data: shortcut,
        });
    }

    registerNewAlternativeMacro(shortcut: AlternativeShortcut) {
        const keys = shortcut.keys;
        const keyCombo = keys.join('+');
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
            console.error('Erro ao carregar atalhos alternativos:', error);
        }
        return true;
    }

    async updateDataMacros(shortcuts: Shortcut[]) {
        this.macros.clear();
        try {
            shortcuts.forEach(shortcut => {
                this.registerNewMacro(shortcut);
            });
        } catch (error) {
            console.error('Erro ao carregar macros:', error);
        }
        return true;
    }

    getComboKeys() {
        return new Promise<string[]>(async (resolve) => {
            this.func_return_combo = resolve;
        });
    }

    checkMacros(pressedKeys: Set<string>) {
        if (this.func_return_combo) {
            this.func_return_combo(Array.from(pressedKeys));
            this.func_return_combo = null;
            return;
        }
        if (pressedKeys.size === 0) return;
        const keyCombo = Array.from(pressedKeys).join('+');
        
        if (this.alternativesMacros.size > 0) {
            this.alternativesMacros.forEach((data, id) => {
                if (keyCombo === data.keyCombo) {
                    this.emit('alternative-shortcut', data);
                    return;
                }
            });
        }

        if (this.macros.size > 0) {
            this.macros.forEach((data, id) => {
                if (keyCombo === data.keyCombo) {
                    this.emit('shortcut', data);
                    return;
                }
            });
        }
    }

}
