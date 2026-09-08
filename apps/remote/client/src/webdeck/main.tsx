import { createRoot } from "react-dom/client";
import WebDeckRemoteApp from "./App";
import "@/bootstrap/http";

createRoot(document.getElementById("root")!).render(<WebDeckRemoteApp />);
