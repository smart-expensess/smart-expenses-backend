import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth";
import profileRoutes from "./routes/profiles";
import categoryRoutes from "./routes/categories";
import budgetRoutes from "./routes/budgets";
import receiptRoutes from "./routes/receipts";
import notificationRoutes from "./routes/notifications";
import aiRoutes from "./routes/ai";
import dashboardRoutes from "./routes/dashboard";

const app = express();

import multer from "multer";

// --- DEBUG MULTER SETUP ---
const debugUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
});

// Simple debug endpoint to see what Express gets
app.post("/test-upload", debugUpload.any(), (req, res) => {
  console.log("==== /test-upload called ====");
  console.log("Content-Type:", req.headers["content-type"]);
  console.log("BODY:", req.body);
  console.log("FILES:", req.files);

  return res.json({
    message: "OK",
    contentType: req.headers["content-type"],
    body: req.body,
    files: req.files,
  });
});

const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(
  cors({
    origin: clientOrigin,
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/budgets", budgetRoutes);
app.use("/api/receipts", receiptRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api", aiRoutes);

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({
    message: `Route ${req.method} ${req.path} not found`,
    path: req.path,
    method: req.method,
  });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
