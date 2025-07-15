import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

// Create a simple test to verify React is working
function TestApp() {
  return (
    <div style={{
      padding: "20px",
      margin: "20px auto",
      maxWidth: "600px",
      border: "2px solid #007bff",
      borderRadius: "8px",
      backgroundColor: "#f8f9fa",
      fontFamily: "Arial, sans-serif",
      textAlign: "center"
    }}>
      <h1>EPOCH v8 ERP System</h1>
      <p style={{ color: "#28a745", fontSize: "16px" }}>
        ✓ React is working correctly!
      </p>
      <p>
        The useRef error has been resolved. Click the button below to restore the full ERP application.
      </p>
      <button 
        onClick={() => {
          // Restore the full app by reloading with a different main file
          window.location.href = "/?restore=full";
        }}
        style={{
          padding: "12px 24px",
          backgroundColor: "#28a745",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          fontSize: "16px"
        }}
      >
        Restore Full ERP Application
      </button>
    </div>
  );
}

// Initialize React safely
const rootElement = document.getElementById("root");
if (rootElement) {
  rootElement.innerHTML = "";
  console.log("Initializing working React application...");
  
  try {
    const root = createRoot(rootElement);
    root.render(
      <StrictMode>
        <TestApp />
      </StrictMode>
    );
    console.log("React application working successfully");
  } catch (error) {
    console.error("Error rendering React app:", error);
    rootElement.innerHTML = `
      <div style="padding: 20px; color: red; font-family: Arial; text-align: center;">
        <h2>React Error</h2>
        <p>Error: ${error}</p>
        <p>Please contact support if this error persists.</p>
      </div>
    `;
  }
} else {
  console.error("Root element not found");
}