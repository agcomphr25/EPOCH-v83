
// Import React refresh fix FIRST before any other imports
import "./react-refresh-fix";

import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";

// Ensure React is globally available before any components load
(window as any).React = React;

// Add React hooks to global scope as a fallback
(window as any).useState = React.useState;
(window as any).useEffect = React.useEffect;
(window as any).useRef = React.useRef;
(window as any).useCallback = React.useCallback;
(window as any).createContext = React.createContext;
(window as any).useContext = React.useContext;

// Enhanced error tracking for deployment debugging
let globalErrors: Array<{timestamp: string, message: string, type: string}> = [];
const originalConsoleError = console.error;
console.error = function(...args) {
  globalErrors.push({
    timestamp: new Date().toISOString(),
    message: args.join(' '),
    type: 'console.error'
  });
  originalConsoleError.apply(console, args);
};

// Make errors accessible for debugging
(window as any).getGlobalErrors = () => globalErrors;

console.log("React initialized:", React);
console.log("React hooks:", { useState: React.useState, useEffect: React.useEffect });

const rootElement = document.getElementById("root");
if (rootElement) {
  try {
    console.log("Attempting to create React root...");
    const root = createRoot(rootElement);
    
    console.log("Rendering React app...");
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>
    );
    console.log("React app rendered successfully");
  } catch (error) {
    console.error("React rendering failed:", error);
    
    // Fallback to HTML if React fails
    rootElement.innerHTML = `
      <div style="padding: 20px; font-family: Arial, sans-serif;">
        <h1>EPOCH v8 - Manufacturing ERP System</h1>
        <p style="color: red;">React Error: ${error}</p>
        <button onclick="location.reload()">Reload</button>
      </div>
    `;
  }
} else {
  console.error("Root element not found");
}
