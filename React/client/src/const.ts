export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export const SocketSettings = {
  url: import.meta.env.VITE_SOCKET_URL || "http://localhost:3484",
};

export const ApiSettings = {
  url: import.meta.env.VITE_API_URL || "http://localhost:3484",
};
