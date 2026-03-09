import { createRoot } from "react-dom/client";
import AppLauncherApp from "./App";
import "@/bootstrap/http";
import "../index.css";

createRoot(document.getElementById("root")!).render(<AppLauncherApp />);
