import { createRoot } from "react-dom/client";
import App from "./App";
import WebDeckRemoteApp from "./webdeck/App";
import OverlayApp from "./overlay/App";
import "./index.css";

const pathname = window.location.pathname.toLowerCase();
const isWebDeckRoute = pathname === "/webdeck" || pathname.startsWith("/webdeck/");
const isOverlayRoute = pathname === "/overlay" || pathname.startsWith("/overlay/");

createRoot(document.getElementById("root")!).render(
  isOverlayRoute ? <OverlayApp /> : (isWebDeckRoute ? <WebDeckRemoteApp /> : <App />)
);
