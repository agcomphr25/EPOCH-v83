import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// Ensure clean React initialization
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