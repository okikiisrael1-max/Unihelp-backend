import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import contactRoutes from "./routes/contact.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import reportRoutes from "./routes/report.js";
import notificationRoutes, { sendStudyReminderNotifications } from "./routes/notifications.js";
import mediaCleanupRoutes from "./routes/mediaCleanup.js";

dotenv.config();

const app = express();

/* =========================================================
   MIDDLEWARE
========================================================= */

const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://unihelp-testing.vercel.app",
  "https://unihelp-testing.vercel.app/",
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
};

app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/payments", paymentRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/media-cleanup", mediaCleanupRoutes);

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Backend is running 🚀",
  });
});

app.use(errorHandler);

app.use((err, req, res, next) => {
  console.log(err);

  res.status(500).json({
    success: false,
    error: err.message || "Server Error",
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(
    `🚀 Server running on port ${PORT}`
  );
});

setInterval(() => {
  sendStudyReminderNotifications().catch((error) => {
    console.error("Reminder scheduler failed:", error);
  });
}, 15 * 60 * 1000);
