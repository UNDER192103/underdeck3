
export type ShortcutTypes = 1 | 2 | 3;

export interface Shortcut {
    id: string;
    type: ShortcutTypes;
    name: string;
    icon: string | null;
    banner?: string | null;
    description: string;
    meta_data: {
        appId: string;
        keys: string[];
    };
}

export interface AlternativeShortcut {
    id: string;
    keys: string[];
}