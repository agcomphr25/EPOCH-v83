import React from "react";
import { createRoot } from "react-dom/client";

function BasicTest() {
  return <div>Basic Test Working</div>;
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<BasicTest />);
} else {
  console.error("Root element not found");
}