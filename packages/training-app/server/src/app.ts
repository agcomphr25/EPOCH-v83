import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

import { healthRouter } from "./routes/health";
import { libraryRouter } from "./routes/library";
import { trainingRouter } from "./routes/training";
import { traineesRouter } from "./routes/trainees";
import importRouter from "./routes/import";
import plansRouter from "./routes/plans";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use("/api/health", healthRouter);
app.use("/api/library", libraryRouter);
app.use("/api/training", trainingRouter);
app.use("/api/trainees", traineesRouter);
app.use("/api/import", importRouter);
app.use("/api/plans", plansRouter);

const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || (isProduction ? 5000 : 3000));

if (isProduction) {
  const clientDist = path.join(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.join(clientDist, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.json({ ok: true, message: "API server running. Frontend on port 5000." });
  });
}

app.listen(port, "0.0.0.0", () => {
  console.log(`${isProduction ? "Production" : "API"} server running on :${port}`);
});
