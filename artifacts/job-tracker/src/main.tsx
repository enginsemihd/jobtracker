import { createRoot } from "react-dom/client";
import { setApiBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

setApiBaseUrl(import.meta.env.VITE_API_BASE_URL ?? "");

createRoot(document.getElementById("root")!).render(<App />);
