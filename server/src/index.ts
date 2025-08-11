
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Import routes
import shippingRoutes from "./routes/shipping";
import ordersRouter from "./routes/orders";
// ... other route imports

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..", ".."); // adjust if needed

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const db = drizzle(pool);

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Static file serving for labels/invoices
app.use("/files", express.static(path.join(projectRoot, "files")));

// Routes
app.use("/api/ship", shippingRoutes({ db, projectRoot }));
app.use("/api/orders", ordersRouter);
// ... other routes

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Server listening on port ${port}`);
  console.log(`📁 Files served from: ${path.join(projectRoot, "files")}`);
});
