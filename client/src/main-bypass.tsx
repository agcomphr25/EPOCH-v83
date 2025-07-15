// Complete bypass of Vite React plugin
import "./index.css";

// Create a completely isolated React environment
const React = await import("react");
const ReactDOM = await import("react-dom/client");

// Completely disable all Vite HMR and refresh features
if (import.meta.hot) {
  import.meta.hot.dispose(() => {});
  import.meta.hot.accept(() => {});
}

// Clear any existing React refresh globals
delete (window as any).$RefreshReg$;
delete (window as any).$RefreshSig$;
delete (window as any).__vite_plugin_react_preamble_installed__;

// Create the app using React.createElement to avoid JSX transform issues
const App = () => {
  const [count, setCount] = React.useState(0);
  
  return React.createElement("div", {
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
    React.createElement("p", { key: "status" }, "React bypassed Vite plugin successfully!"),
    React.createElement("p", { key: "counter", style: { fontSize: "18px", margin: "20px 0" } }, `Button clicked ${count} times`),
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
        window.location.href = "/";
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
};

// Initialize React without any plugin interference
async function initializeReact() {
  try {
    const rootElement = document.getElementById("root");
    if (!rootElement) {
      throw new Error("Root element not found");
    }
    
    // Clear any existing content
    rootElement.innerHTML = "";
    
    console.log("Initializing React with complete plugin bypass...");
    
    const root = ReactDOM.createRoot(rootElement);
    root.render(React.createElement(App));
    
    console.log("React initialized successfully without Vite plugin");
    
  } catch (error) {
    console.error("Error initializing React:", error);
    const rootElement = document.getElementById("root");
    if (rootElement) {
      rootElement.innerHTML = `
        <div style="padding: 20px; color: red; font-family: Arial; text-align: center;">
          <h2>React Initialization Error</h2>
          <p>Error: ${error}</p>
          <button onclick="window.location.reload()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Reload Page
          </button>
        </div>
      `;
    }
  }
}

// Start initialization
initializeReact();