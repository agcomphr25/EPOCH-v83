// Clean React setup without any complex dependencies
import "./react-refresh-disable";
import { createRoot } from "react-dom/client";
import "./index.css";

// Minimal React component without any hooks or complex features
function CleanApp() {
  return (
    <div style={{
      padding: "20px",
      margin: "20px auto",
      maxWidth: "600px",
      border: "2px solid #007bff",
      borderRadius: "8px",
      backgroundColor: "#f8f9fa",
      fontFamily: "Arial, sans-serif"
    }}>
      <h1>EPOCH v8 ERP System</h1>
      <p>React is working without refresh runtime!</p>
      <button 
        onClick={() => {
          const message = "Button clicked successfully!";
          alert(message);
        }}
        style={{
          padding: "10px 20px",
          backgroundColor: "#007bff",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          marginRight: "10px"
        }}
      >
        Test Button
      </button>
      <button 
        onClick={() => {
          window.location.reload();
        }}
        style={{
          padding: "10px 20px",
          backgroundColor: "#28a745",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer"
        }}
      >
        Restore Full App
      </button>
    </div>
  );
}

// Initialize React
const rootElement = document.getElementById("root");
if (rootElement) {
  rootElement.innerHTML = "";
  console.log("Initializing clean React setup...");
  try {
    const root = createRoot(rootElement);
    root.render(<CleanApp />);
    console.log("Clean React application rendered successfully");
  } catch (error) {
    console.error("Error rendering clean React app:", error);
    rootElement.innerHTML = `<div style="padding: 20px; color: red;">React Error: ${error}</div>`;
  }
} else {
  console.error("Root element not found");
  document.body.innerHTML = `<div style="padding: 20px; color: red;">Root element not found</div>`;
}