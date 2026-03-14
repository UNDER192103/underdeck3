import { createRoot } from "react-dom/client";
import App from "../App";
import "@/bootstrap/http";
import "../index.css";

createRoot(document.getElementById("root")!).render(<App />);
