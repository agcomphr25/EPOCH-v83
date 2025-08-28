// Vanilla React setup that bypasses all Vite React plugin features
import "./react-refresh-disable";

// Manual React imports to avoid plugin conflicts
import * as React from "react";
import * as ReactDOM from "react-dom/client";
import "./index.css";

// Disable all hot module replacement
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    // Disable HMR
  });
}

// Simple functional component
const VanillaApp = () => {
  const [count, setCount] = React.useState(0);
  
  return React.createElement("div", {
    style: {
      padding: "20px",
      margin: "20px auto",
      maxWidth: "600px",
      border: "2px solid #007bff",
      borderRadius: "8px",
      backgroundColor: "#f8f9fa",
      fontFamily: "Arial, sans-serif"
    }
  }, [
    React.createElement("h1", { key: "title" }, "EPOCH v8 ERP System"),
    React.createElement("p", { key: "status" }, "React is working with vanilla setup!"),
    React.createElement("p", { key: "counter" }, `Button clicked ${count} times`),
    React.createElement("button", {
      key: "button",
      onClick: () => setCount(count + 1),
      style: {
        padding: "10px 20px",
        backgroundColor: "#007bff",
        color: "white",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer",
        marginRight: "10px"
      }
    }, "Click Me"),
    React.createElement("button", {
      key: "restore",
      onClick: () => {
        // Change back to original main.tsx
        window.location.href = window.location.href.replace(/main-.*\.tsx/, "main.tsx");
      },
      style: {
        padding: "10px 20px",
        backgroundColor: "#28a745",
        color: "white",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer"
      }
    }, "Restore Full App")
  ]);
};

// Initialize without any plugin interference
const rootElement = document.getElementById("root");
if (rootElement) {
  rootElement.innerHTML = "";
  console.log("Initializing vanilla React setup...");
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(React.createElement(VanillaApp));
    console.log("Vanilla React application rendered successfully");
  } catch (error) {
    console.error("Error rendering vanilla React app:", error);
    rootElement.innerHTML = `<div style="padding: 20px; color: red; font-family: Arial;">React Error: ${error}</div>`;
  }
} else {
  console.error("Root element not found");
  document.body.innerHTML = `<div style="padding: 20px; color: red; font-family: Arial;">Root element not found</div>`;
}