import { createRoot } from "react-dom/client";
import App from "./App";
import WebDeckRemoteApp from "./webdeck/App";
import OverlayApp from "./overlay/App";
import "@/bootstrap/http";
import "./index.css";

const mode = new URLSearchParams(window.location.search).get("mode")?.toLowerCase();
const isWebDeckRoute = mode === "webdeck";
const isOverlayRoute = mode === "overlay";

createRoot(document.getElementById("root")!).render(
  isOverlayRoute ? <OverlayApp /> : (isWebDeckRoute ? <WebDeckRemoteApp /> : <App />)
);
