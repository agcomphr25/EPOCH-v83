// Import React refresh fix FIRST before any other imports
import "./react-refresh-fix";

import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "react-hot-toast";
import App from "./App.tsx";
import "./index.css";

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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster position="top-right" />
        <ReactQueryDevtools initialIsOpen={false} />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);

console.log("React initialized:", React);
console.log("React hooks:", { useState: React.useState, useEffect: React.useEffect });