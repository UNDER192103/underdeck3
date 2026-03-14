export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Controle rapido do frontend:
// - false: usa URL fixa abaixo
// - true: usa mesma origem ("/")
const FRONTEND_USE_LOCAL_SOCKET_SOURCE = false;
const DEV_SOCKET_URL = `http://localhost:3404`;
const PROD_SOCKET_URL = "https://io.undernouzen.shop";
const PROD_API_URL = "https://io.undernouzen.shop";

const getRuntimeMode = () => {
  if (typeof window === "undefined") return "";
  const queryMode = new URLSearchParams(window.location.search).get("mode")?.toLowerCase();
  if (queryMode) return queryMode;

  const pathname = String(window.location.pathname || "").toLowerCase();
  if (pathname.includes("/webdeck")) return "webdeck";
  if (pathname.includes("/overlay")) return "overlay";
  return "";
};

const resolveSocketUrl = () => {
  if (FRONTEND_USE_LOCAL_SOCKET_SOURCE) {
    return "/";
  }
  return import.meta.env.DEV ? DEV_SOCKET_URL : PROD_SOCKET_URL;
};

const resolveApiUrl = () => {
  const isFileProtocol =
    typeof window !== "undefined" &&
    typeof window.location?.protocol === "string" &&
    window.location.protocol.toLowerCase() === "file:";

  if (isFileProtocol || !import.meta.env.DEV) {
    return PROD_API_URL;
  }

  return "/";
};

const normalizePath = (path: string) => {
  const raw = String(path || "").trim();
  if (!raw) return "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
};

export const SocketSettings = {
  url: resolveSocketUrl(),
};

export const ApiSettings = {
  url: resolveApiUrl(),
};

export const RuntimeSettings = {
  mode: getRuntimeMode(),
  isWebDeck: getRuntimeMode() === "webdeck",
};

export const apiUrl = (path: string) => {
  const normalizedPath = normalizePath(path);
  if (ApiSettings.url === "/") {
    return normalizedPath;
  }
  return new URL(normalizedPath, ApiSettings.url).toString();
};
