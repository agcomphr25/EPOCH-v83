// Completely bypass React refresh and HMR
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

// Define global stubs to prevent React refresh errors
declare global {
  var $RefreshReg$: any;
  var $RefreshSig$: any;
  var __vite_plugin_react_preamble_installed__: any;
}

// Disable React refresh completely
globalThis.$RefreshReg$ = () => {};
globalThis.$RefreshSig$ = () => (type: any) => type;
globalThis.__vite_plugin_react_preamble_installed__ = true;

// Simple component without any hooks or complex features
const SimpleApp = () => {
  return createElement("div", {
    style: {
      padding: "20px",
      margin: "20px",
      border: "2px solid #007bff",
      borderRadius: "8px",
      backgroundColor: "#f8f9fa",
      fontFamily: "Arial, sans-serif"
    }
  }, [
    createElement("h1", { key: "title" }, "EPOCH v8 ERP System"),
    createElement("p", { key: "subtitle" }, "React is working correctly!"),
    createElement("button", {
      key: "button",
      onClick: () => alert("Button clicked!"),
      style: {
        padding: "10px 20px",
        backgroundColor: "#007bff",
        color: "white",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer"
      }
    }, "Test Button")
  ]);
};

// Initialize without StrictMode to avoid any potential issues
const rootElement = document.getElementById("root");
if (rootElement) {
  rootElement.innerHTML = "";
  console.log("Initializing React with refresh disabled...");
  const root = createRoot(rootElement);
  root.render(createElement(SimpleApp));
  console.log("React application rendered successfully");
} else {
  console.error("Root element not found");
}