import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// Comprehensive React refresh runtime prevention
if (typeof window !== 'undefined') {
  // Disable React refresh completely
  (window as any).$RefreshReg$ = () => {};
  (window as any).$RefreshSig$ = () => (type: any) => type;
  
  // Prevent RefreshRuntime from being called
  (window as any).RefreshRuntime = {
    register: () => {},
    createSignatureFunctionForTransform: () => () => {},
    isLikelyComponentType: () => false,
    getFamilyByType: () => null,
    register: () => {},
    performReactRefresh: () => {},
    findAffectedHostInstances: () => [],
    injectIntoGlobalHook: () => {},
    hasUnrecoverableErrors: () => false,
    scheduleRefresh: () => {},
    scheduleRoot: () => {},
    setSignature: () => {},
    collectCustomHooksForSignature: () => [],
    isSignatureEqual: () => false,
    shouldInvalidateReactFresh: () => false,
    shouldUpdateReactFresh: () => false,
  };
}

const rootElement = document.getElementById("root");
if (rootElement) {
  rootElement.innerHTML = "";
  console.log("Initializing React application...");
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
  console.log("React application rendered successfully");
} else {
  console.error("Root element not found");
}