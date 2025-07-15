import React from "react";
import { createRoot } from "react-dom/client";

function MinimalApp() {
  return React.createElement('div', { style: { padding: '20px', color: 'red', fontSize: '24px' } }, 'REACT IS WORKING - MINIMAL VERSION');
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(React.createElement(MinimalApp));
  console.log("Minimal app rendered");
} else {
  console.error("Root not found");
}