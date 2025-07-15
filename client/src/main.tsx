import { createRoot } from "react-dom/client";
import App from "./App";

// Completely minimal React setup
const rootElement = document.getElementById("root");
if (rootElement) {
  console.log("Starting minimal React app...");
  const root = createRoot(rootElement);
  root.render(<App />);
  console.log("React app rendered successfully");
} else {
  console.error("Root element not found");
}