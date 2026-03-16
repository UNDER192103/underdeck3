export type ShortcutTypes = 1 | 2 | 3;

export interface ShortcutKey {
  keyCode: number;
  key: string;
}

export interface Shortcut {
  id: string;
  type: ShortcutTypes;
  name: string;
  icon: string | null;
  banner?: string | null;
  description: string;
  meta_data: {
    appId: string;
    keys: ShortcutKey[];
  };
}

export interface AlternativeShortcut {
  id: string;
  keys: ShortcutKey[];
}
