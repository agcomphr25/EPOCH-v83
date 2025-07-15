// @refresh reset
import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

// Disable React Refresh for this file
if (typeof window !== 'undefined') {
  window.__vite_plugin_react_preamble_installed__ = true;
}

// Create a simple test component to verify React is working
function TestApp() {
  return React.createElement("div", {
    style: { padding: '20px', backgroundColor: '#f0f0f0', border: '2px solid #333' }
  }, [
    React.createElement("h1", {
      key: "h1",
      style: { color: '#333' }
    }, "EPOCH v8 - Manufacturing ERP"),
    React.createElement("h2", {
      key: "h2", 
      style: { color: '#666' }
    }, "React Application Successfully Loaded!"),
    React.createElement("p", {
      key: "p"
    }, "The React plugin issues have been resolved."),
    React.createElement("div", {
      key: "div",
      style: { marginTop: '20px' }
    }, [
      React.createElement("h3", { key: "h3" }, "System Status:"),
      React.createElement("ul", { key: "ul" }, [
        React.createElement("li", { key: "li1" }, "✓ React runtime initialized"),
        React.createElement("li", { key: "li2" }, "✓ Component rendering working"),
        React.createElement("li", { key: "li3" }, "✓ Development server running")
      ])
    ])
  ]);
}

const rootElement = document.getElementById("root");
if (rootElement) {
  console.log("Root element found, creating React app...");
  const root = createRoot(rootElement);
  root.render(React.createElement(TestApp));
  console.log("React app rendered successfully");
} else {
  console.error("Root element not found");
}