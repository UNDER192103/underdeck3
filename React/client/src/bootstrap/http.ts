import axios from "axios";
import { ApiSettings } from "@/const";

axios.defaults.baseURL = ApiSettings.url === "/" ? "" : ApiSettings.url;
axios.defaults.withCredentials = true;

let resolvedElectronApiBaseURL: string | null = null;
let resolvingElectronApiBaseURL: Promise<string | null> | null = null;

const isApiPath = (url?: string) => {
  if (!url) return false;
  return url === "/api" || url.startsWith("/api/");
};

const resolveElectronApiBaseURL = async (): Promise<string | null> => {
  if (resolvedElectronApiBaseURL !== null) {
    return resolvedElectronApiBaseURL;
  }

  if (resolvingElectronApiBaseURL) {
    return resolvingElectronApiBaseURL;
  }

  resolvingElectronApiBaseURL = (async () => {
    try {
      const info = await window.underdeck?.express?.getWebDeckAccessInfo?.();
      const base = String(info?.localhostUrl || info?.localIpUrl || "").trim();
      if (!base) {
        resolvedElectronApiBaseURL = null;
        return null;
      }

      const origin = new URL(base).origin;
      resolvedElectronApiBaseURL = origin;
      axios.defaults.baseURL = origin;
      return origin;
    } catch {
      resolvedElectronApiBaseURL = null;
      return null;
    } finally {
      resolvingElectronApiBaseURL = null;
    }
  })();

  return resolvingElectronApiBaseURL;
};

axios.interceptors.request.use(async (config) => {
  if (config.baseURL) {
    return config;
  }

  const url = typeof config.url === "string" ? config.url : "";
  if (!isApiPath(url)) {
    return config;
  }

  const resolved = await resolveElectronApiBaseURL();
  if (resolved) {
    config.baseURL = resolved;
  }

  return config;
});
