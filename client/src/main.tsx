import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const rootElement = document.getElementById("root");
if (rootElement) {
  console.log("Root element found, creating React app...");
  const root = createRoot(rootElement);
  root.render(<App />);
  console.log("React app rendered successfully");
} else {
  console.error("Root element not found");
}
