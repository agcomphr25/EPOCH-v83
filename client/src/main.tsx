
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App-minimal";

// Ensure React is globally available
(window as any).React = React;

const rootElement = document.getElementById("root");
if (rootElement) {
  console.log("Initializing React application...");
  console.log("React object:", React);
  console.log("React hooks:", { useState: React.useState, useEffect: React.useEffect });
  
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
