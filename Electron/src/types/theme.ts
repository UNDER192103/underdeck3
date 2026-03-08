export type SavedThemeSource = "local" | "store";

export type StoredThemeName = "ligth" | "dark" | "black" | "transparent";

export type StoredThemeBackground =
  | { variant: "neural" }
  | { variant: "image"; imageSrc: string }
  | { variant: "video"; videoSrc: string };

export interface ThemePreferences {
  theme: StoredThemeName;
  background: StoredThemeBackground;
}

export interface SavedThemeWallpaper {
  key: string;
  itemId: string;
  name: string;
  source: SavedThemeSource;
  remoteUrl: string;
  mediaUrl: string;
  relativePath: string;
  mediaType: string | null;
  createdAt: number;
  exists: boolean;
}

export interface ThemeDownloadRequest {
  itemId: string;
  name: string;
  remoteUrl: string;
  mediaType?: string | null;
}

export interface ThemeDownloadProgress {
  jobId: string;
  itemId: string;
  name: string;
  status: "queued" | "downloading" | "completed" | "failed";
  progress: number;
  bytesReceived: number;
  totalBytes: number | null;
  mediaUrl?: string;
  error?: string;
}
