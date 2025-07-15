
// @refresh reset
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// Disable React Refresh completely
if (typeof window !== 'undefined') {
  window.__vite_plugin_react_preamble_installed__ = true;
  // Stub the refresh runtime functions
  if (typeof globalThis !== 'undefined') {
    globalThis.$RefreshReg$ = () => {};
    globalThis.$RefreshSig$ = () => (type) => type;
  }
}

const rootElement = document.getElementById("root");
if (rootElement) {
  console.log("Initializing React application...");
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
  console.log("React application rendered successfully");
} else {
  console.error("Root element not found");
}
