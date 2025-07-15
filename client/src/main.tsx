import React from "react";
import { createRoot } from "react-dom/client";

function ErrorBoundary({ children }) {
  const [hasError, setHasError] = React.useState(false);
  
  React.useEffect(() => {
    const handleError = (error) => {
      console.error("Error caught by boundary:", error);
      setHasError(true);
    };
    
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);
  
  if (hasError) {
    return (
      <div style={{ padding: '20px', backgroundColor: '#ffe0e0', border: '2px solid red' }}>
        <h1>APPLICATION ERROR DETECTED</h1>
        <p>Check console for details</p>
      </div>
    );
  }
  
  return children;
}

function SimpleApp() {
  return (
    <ErrorBoundary>
      <div style={{ padding: '20px', backgroundColor: '#f0f0f0' }}>
        <h1 style={{ color: 'blue' }}>EPOCH v8 - BASIC VERSION</h1>
        <p>Application is running in basic mode</p>
        <a href="/test-react.html">Test React with CDN</a>
      </div>
    </ErrorBoundary>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<SimpleApp />);
}
