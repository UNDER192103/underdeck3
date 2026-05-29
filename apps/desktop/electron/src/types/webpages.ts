export interface WebPage {
    id: string;
    name: string;
    icon: string | null;
    url: string;
    createdAt: number;
    updatedAt: number;
}

export interface WebPagesSettings {
    useAdblock: boolean;
    blockNewWindows: boolean;
}

export type WebPageShortcutDestination = "desktop" | "startMenu" | "custom";

export interface WebPageShortcutRequest {
    pageId: string;
    name: string;
    iconPath?: string | null;
    destination: WebPageShortcutDestination;
    customDirectory?: string | null;
}

export interface WebPageShortcutResult {
    ok: boolean;
    path?: string;
    error?: string;
}
