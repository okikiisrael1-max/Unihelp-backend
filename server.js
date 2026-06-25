import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import contactRoutes from "./routes/contact.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import reportRoutes from "./routes/report.js";
import notificationRoutes from "./routes/notifications.js";

dotenv.config();

const app = express();

/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================================================
   ROUTES
========================================================= */

app.use("/api/payments", paymentRoutes);

app.use("/api/contact", contactRoutes);

app.use("/api/reports", reportRoutes);

app.use("/api/notifications", notificationRoutes);


/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Backend is running 🚀",
  });
});

/* =========================================================
   404 HANDLER
========================================================= */

app.use(errorHandler);

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use((err, req, res, next) => {
  console.log(err);

  res.status(500).json({
    success: false,
    error: err.message || "Server Error",
  });
});

/* =========================================================
   SERVER
========================================================= */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(
    `🚀 Server running on port ${PORT}`
  );
});
