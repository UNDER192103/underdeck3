export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Controle rapido do frontend:
// - false: usa URL fixa abaixo
// - true: usa mesma origem ("/")
const FRONTEND_USE_LOCAL_SOCKET_SOURCE = false;
const FRONTEND_USE_LOCAL_API_SOURCE = true;
const DEV_SOCKET_URL = `http://localhost:3404`;
const PROD_SOCKET_URL = "https://io.undernouzen.shop";
const PROD_API_URL = "https://io.undernouzen.shop";

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

  if (isFileProtocol) {
    return PROD_API_URL;
  }

  if (import.meta.env.DEV && FRONTEND_USE_LOCAL_API_SOURCE) {
    return "/";
  }
  return PROD_API_URL;
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

export const apiUrl = (path: string) => {
  const normalizedPath = normalizePath(path);
  if (ApiSettings.url === "/") {
    return normalizedPath;
  }
  return new URL(normalizedPath, ApiSettings.url).toString();
};
