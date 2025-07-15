import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// Ensure React refresh is properly initialized
if (typeof window !== 'undefined') {
  if (!(window as any).$RefreshReg$) {
    (window as any).$RefreshReg$ = () => {};
  }
  if (!(window as any).$RefreshSig$) {
    (window as any).$RefreshSig$ = () => (type: any) => type;
  }
}

const rootElement = document.getElementById("root");
if (rootElement) {
  rootElement.innerHTML = "";
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