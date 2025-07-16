import * as React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

// Ensure React is globally available before any components load
if (typeof window !== 'undefined') {
  (window as any).React = React;
}

// Test component using the pattern you showed
function TestComponent() {
  const myRef = React.useRef(null);
  const [count, setCount] = React.useState(0);
  
  return React.createElement("div", {
    ref: myRef,
    style: {
      padding: "20px",
      margin: "20px auto",
      maxWidth: "600px",
      border: "2px solid #007bff",
      borderRadius: "8px",
      backgroundColor: "#f8f9fa",
      fontFamily: "Arial, sans-serif",
      textAlign: "center"
    }
  }, [
    React.createElement("h1", { key: "title" }, "EPOCH v8 ERP System"),
    React.createElement("p", { key: "status" }, "✅ React.useRef working correctly!"),
    React.createElement("p", { key: "counter" }, `Button clicked ${count} times`),
    React.createElement("button", {
      key: "button",
      onClick: () => setCount(prev => prev + 1),
      style: {
        padding: "12px 24px",
        backgroundColor: "#007bff",
        color: "white",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer",
        fontSize: "16px",
        marginRight: "10px"
      }
    }, "Click Me"),
    React.createElement("button", {
      key: "restore",
      onClick: () => {
        window.location.href = "/?restore=true";
      },
      style: {
        padding: "12px 24px",
        backgroundColor: "#28a745",
        color: "white",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer",
        fontSize: "16px"
      }
    }, "Restore Full App")
  ]);
}

// Initialize React with explicit React namespace
const rootElement = document.getElementById("root");
if (rootElement) {
  rootElement.innerHTML = "";
  console.log("Initializing React with explicit React namespace...");
  
  try {
    const root = createRoot(rootElement);
    root.render(React.createElement(TestComponent));
    console.log("React application with useRef working successfully");
  } catch (error) {
    console.error("Error rendering React app:", error);
    rootElement.innerHTML = `
      <div style="padding: 20px; color: red; font-family: Arial; text-align: center;">
        <h2>React Error</h2>
        <p>Error: ${error}</p>
        <button onclick="window.location.reload()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Reload Page
        </button>
      </div>
    `;
  }
} else {
  console.error("Root element not found");
}