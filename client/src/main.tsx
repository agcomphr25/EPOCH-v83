import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// Clear any existing content and initialize React properly
const rootElement = document.getElementById("root");
if (rootElement) {
  // Clear any existing content
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