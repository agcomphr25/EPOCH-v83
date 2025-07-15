import React from "react";
import { createRoot } from "react-dom/client";

function DirectTest() {
  return (
    <div style={{ padding: '20px', backgroundColor: '#f0f0f0', border: '2px solid red' }}>
      <h1 style={{ color: 'red' }}>DIRECT REACT TEST WORKING</h1>
      <p>This bypasses all complex imports and routing</p>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<DirectTest />);
  console.log("Direct test rendered");
}