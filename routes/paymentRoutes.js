import express from "express";

import {
  initializePremiumPayment,
  verifyPayment,
} from "../controllers/paymentController.js";

const router = express.Router();

router.post(
  "/initialize-premium",
  initializePremiumPayment
);

router.post(
  "/verify-payment",
  verifyPayment
);

export default router;
