import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerServiceWorker, setupInstallPrompt } from "./utils/pwa";

// Initialize PWA features
registerServiceWorker();
setupInstallPrompt();

createRoot(document.getElementById("root")!).render(<App />);
