export type SavedThemeSource = "local" | "store";

export type StoredThemeName = "ligth" | "dark" | "black" | "transparent";

export type StoredThemeBackground =
  | { variant: "transparent" }
  | {
      variant: "neural";
      neuralColors?: { center?: string; middle?: string; edge?: string; link?: string; dot?: string };
    }
  | { variant: "image"; imageSrc: string }
  | { variant: "video"; videoSrc: string }
  | {
      variant: "nebula";
      nebulaColor?: string;
      nebulaExplosionColor?: string;
      nebulaBackgroundStart?: string;
      nebulaBackgroundEnd?: string;
    }
  | { variant: "particles"; particleColor?: string; particleBackgroundColor?: string; particleCount?: number }
  | { variant: "color"; backgroundColor?: string; colorMode?: "fixed" | "gradient" | "loop"; backgroundColors?: string[]; gradientAngle?: number; loopTransitionDurationMs?: number };

export type ThemeEffectBackgrounds = Partial<{
  neural: Extract<StoredThemeBackground, { variant: "neural" }>;
  nebula: Extract<StoredThemeBackground, { variant: "nebula" }>;
  particles: Extract<StoredThemeBackground, { variant: "particles" }>;
  color: Extract<StoredThemeBackground, { variant: "color" }>;
}>;

export interface ThemePreferences {
  theme: StoredThemeName;
  background: StoredThemeBackground;
  effectBackgrounds: ThemeEffectBackgrounds;
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
