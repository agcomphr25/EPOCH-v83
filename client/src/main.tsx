// Emergency fix: Override all React refresh functionality
if (typeof window !== 'undefined') {
  // Override ALL refresh-related functions before any module loads
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (type) => type;
  window.__vite_plugin_react_preamble_installed__ = true;
  
  // Intercept and disable the refresh runtime injection
  const originalCreateElement = document.createElement;
  document.createElement = function(tagName) {
    const element = originalCreateElement.call(this, tagName);
    if (tagName === 'script' && element.src && element.src.includes('react-refresh')) {
      element.src = 'data:application/javascript,';
    }
    return element;
  };
  
  // Disable hot module replacement
  if (import.meta.hot) {
    import.meta.hot.accept = () => {};
    import.meta.hot.dispose = () => {};
  }
}

import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

const rootElement = document.getElementById("root");
if (rootElement) {
  console.log("Initializing React application...");
  const root = createRoot(rootElement);
  root.render(React.createElement(App));
  console.log("React application rendered successfully");
} else {
  console.error("Root element not found");
}
