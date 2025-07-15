import { createRoot } from "react-dom/client";
import App from "./App";

// Absolute minimal setup
const root = createRoot(document.getElementById("root")!);
root.render(<App />);