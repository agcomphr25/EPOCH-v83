import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Fix for RefreshRuntime.register is not a function error
if (typeof window !== 'undefined' && !window.$RefreshReg$) {
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (type) => type;
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
