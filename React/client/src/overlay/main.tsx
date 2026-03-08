import { createRoot } from "react-dom/client";
import OverlayApp from "./App";
import "@/bootstrap/http";
import "../index.css";

createRoot(document.getElementById("root")!).render(<OverlayApp />);
