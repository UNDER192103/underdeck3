import axios from "axios";
import { ApiSettings, RuntimeSettings } from "@/const";

axios.defaults.baseURL = ApiSettings.url;
axios.defaults.withCredentials = true;

let resolvedWebDeckApiBaseURL: string | null = null;
let resolvingWebDeckApiBaseURL: Promise<string | null> | null = null;

const isApiPath = (url?: string) => {
  if (!url) return false;
  return url === "/api" || url.startsWith("/api/");
};

const resolveWebDeckApiBaseURL = async (): Promise<string | null> => {
  if (resolvedWebDeckApiBaseURL !== null) {
    return resolvedWebDeckApiBaseURL;
  }

  if (resolvingWebDeckApiBaseURL) {
    return resolvingWebDeckApiBaseURL;
  }

  resolvingWebDeckApiBaseURL = (async () => {
    try {
      const info = await window.underdeck?.express?.getWebDeckAccessInfo?.();
      const base = String(info?.localhostUrl || info?.localIpUrl || "").trim();
      if (base) {
        resolvedWebDeckApiBaseURL = new URL(base).origin;
        return resolvedWebDeckApiBaseURL;
      }
    } catch {
      // ignore
    }

    try {
      const origin = String(window.location.origin || "").trim();
      resolvedWebDeckApiBaseURL = origin && origin !== "null" ? origin : null;
      return resolvedWebDeckApiBaseURL;
    } catch {
      resolvedWebDeckApiBaseURL = null;
      return null;
    } finally {
      resolvingWebDeckApiBaseURL = null;
    }
  })();

  return resolvingWebDeckApiBaseURL;
};

axios.interceptors.request.use(async (config) => {
  const socketId = (window as any).__underdeckSocketId;
  if (socketId) {
    if (!config.headers) {
      config.headers = {};
    }
    (config.headers as any)["x-socket-id"] = socketId;
  }

  if (!RuntimeSettings.isWebDeck) {
    return config;
  }

  const url = typeof config.url === "string" ? config.url : "";
  if (!isApiPath(url)) {
    return config;
  }

  const resolved = await resolveWebDeckApiBaseURL();
  if (resolved) {
    config.baseURL = resolved;
  }

  return config;
});
