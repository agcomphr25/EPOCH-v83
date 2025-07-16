// Pure React implementation without any Vite plugin dependencies
import("./index.css");

// Load React from CDN to avoid any local plugin conflicts
const loadReactFromCDN = async () => {
  // Create script tags for React
  const reactScript = document.createElement('script');
  reactScript.crossOrigin = 'anonymous';
  reactScript.src = 'https://unpkg.com/react@18/umd/react.development.js';
  
  const reactDOMScript = document.createElement('script');
  reactDOMScript.crossOrigin = 'anonymous';
  reactDOMScript.src = 'https://unpkg.com/react-dom@18/umd/react-dom.development.js';
  
  // Load React first, then ReactDOM
  return new Promise((resolve, reject) => {
    reactScript.onload = () => {
      document.head.appendChild(reactDOMScript);
      reactDOMScript.onload = () => resolve();
      reactDOMScript.onerror = reject;
    };
    reactScript.onerror = reject;
    document.head.appendChild(reactScript);
  });
};

// Initialize app after React loads
const initializeApp = () => {
  const { React, ReactDOM } = window;
  
  if (!React || !ReactDOM) {
    console.error('React not loaded from CDN');
    return;
  }
  
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
      React.createElement("p", { key: "status" }, "React loaded from CDN - No Vite plugin conflicts!"),
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
          // This will restore the original app
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
  };
  
  const rootElement = document.getElementById("root");
  if (rootElement) {
    rootElement.innerHTML = "";
    const root = ReactDOM.createRoot(rootElement);
    root.render(React.createElement(App));
    console.log("React app initialized successfully from CDN");
  }
};

// Show loading message while React loads
const showLoading = () => {
  const rootElement = document.getElementById("root");
  if (rootElement) {
    rootElement.innerHTML = `
      <div style="padding: 20px; text-align: center; font-family: Arial;">
        <h2>Loading React...</h2>
        <p>Bypassing Vite plugin conflicts...</p>
      </div>
    `;
  }
};

// Start the process
showLoading();
loadReactFromCDN()
  .then(initializeApp)
  .catch(error => {
    console.error('Failed to load React from CDN:', error);
    const rootElement = document.getElementById("root");
    if (rootElement) {
      rootElement.innerHTML = `
        <div style="padding: 20px; color: red; text-align: center; font-family: Arial;">
          <h2>Failed to Load React</h2>
          <p>Error: ${error}</p>
          <button onclick="window.location.reload()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Reload Page
          </button>
        </div>
      `;
    }
  });