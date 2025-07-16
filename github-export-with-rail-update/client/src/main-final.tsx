// Final solution: Disable React refresh and restore full app
import { StrictMode, createElement } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

// Complete React refresh override
if (typeof window !== 'undefined') {
  // Prevent any React refresh from loading
  Object.defineProperty(window, '$RefreshReg$', {
    value: function() {},
    writable: true,
    configurable: true
  });
  
  Object.defineProperty(window, '$RefreshSig$', {
    value: function() { return function(type: any) { return type; }; },
    writable: true,
    configurable: true
  });
  
  // Mark as installed to prevent further setup
  (window as any).__vite_plugin_react_preamble_installed__ = true;
}

// Import App component dynamically to avoid any plugin conflicts
async function loadApp() {
  try {
    const { default: App } = await import("./App");
    return App;
  } catch (error) {
    console.error("Failed to load App component:", error);
    return null;
  }
}

// Initialize React application
async function initializeApp() {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    console.error("Root element not found");
    return;
  }

  try {
    rootElement.innerHTML = "";
    console.log("Initializing React application with refresh disabled...");
    
    const App = await loadApp();
    if (!App) {
      throw new Error("Failed to load App component");
    }
    
    const root = createRoot(rootElement);
    root.render(createElement(StrictMode, null, createElement(App)));
    
    console.log("React application initialized successfully");
    
  } catch (error) {
    console.error("Error initializing React app:", error);
    
    // Fallback to basic HTML interface
    rootElement.innerHTML = `
      <div style="padding: 20px; max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
        <h1>EPOCH v8 ERP System</h1>
        <div style="background: #f8d7da; color: #721c24; padding: 15px; border-radius: 4px; margin: 20px 0;">
          <h3>React Initialization Error</h3>
          <p>Error: ${error}</p>
          <p>The system has detected a React configuration issue. Please contact support.</p>
        </div>
        <button onclick="window.location.reload()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Reload Application
        </button>
      </div>
    `;
  }
}

// Start initialization
initializeApp();