import { db } from "../firebase/firebaseAdmin.js";

import {
  initializeFlutterwavePayment,
  verifyFlutterwavePayment,
} from "../services/flutterwaveService.js";
import { getPremiumAmount, getPremiumPlan } from "../config/premiumPlans.js";

export const initializePremiumPayment = async (req, res) => {
  try {
    const {
      userId,
      email,
      name,
      billing = "monthly",
      plan = "student-premium",
      redirectUrl,
    } = req.body;

    if (!userId || !email || !redirectUrl) {
      return res.status(400).json({
        success: false,
        error: "Missing fields",
      });
    }

    if (!["monthly", "yearly"].includes(billing)) {
      return res.status(400).json({
        success: false,
        error: "Invalid billing cycle",
      });
    }

    const selectedPlan = getPremiumPlan(plan);
    const amount = getPremiumAmount(selectedPlan.id, billing);
    const txRef = `UNIHELP_${userId}_${Date.now()}`;

    const payment = await initializeFlutterwavePayment({
      txRef,
      amount,
      redirectUrl,
      customer: {
        email,
        name: name || "UniHelp Student",
      },
      title: "UniHelp Student Premium",
      description: `${selectedPlan.name} ${billing} subscription`,
    });

    return res.status(200).json({
      success: true,
      paymentLink: payment.data?.link,
      txRef,
      amount,
      plan: selectedPlan.id,
      billing,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      error: "Could not start payment",
    });
  }
};

export const verifyPayment =
  async (req, res) => {
    try {
      const {
        transaction_id,
        userId,
        plan,
        billing,
      } = req.body;

      if (
        !transaction_id ||
        !userId
      ) {
        return res.status(400).json({
          success: false,
          error: "Missing fields",
        });
      }

      if (!["monthly", "yearly"].includes(billing)) {
        return res.status(400).json({
          success: false,
          error: "Invalid billing cycle",
        });
      }

      /* VERIFY WITH FLUTTERWAVE */

      const verification =
        await verifyFlutterwavePayment(
          transaction_id
        );

      const paymentData =
        verification.data;

      console.log(paymentData);

      const selectedPlan = getPremiumPlan(plan);
      const expectedAmount = getPremiumAmount(selectedPlan.id, billing);
      const paidAmount = Number(paymentData.amount);

      if (
        paymentData.status !==
          "successful" ||
        paidAmount !== expectedAmount
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Payment verification failed",
        });
      }

      /* CALCULATE EXPIRY */

      const now = new Date();

      let expiryDate =
        billing === "monthly"
          ? new Date(
              now.setMonth(
                now.getMonth() + 1
              )
            )
          : new Date(
              now.setFullYear(
                now.getFullYear() + 1
              )
            );

      /* SAVE SUBSCRIPTION */

      await db
        .collection("subscriptions")
        .doc(transaction_id.toString())
        .set({
          userId,

          transaction_id,

          plan,
          planId: selectedPlan.id,

          billing,

          amount: expectedAmount,

          status: "active",

          paymentMethod:
            paymentData.payment_type,

          customerEmail:
            paymentData.customer.email,

          customerName:
            paymentData.customer.name,

          createdAt:
            new Date(),

          expiresAt:
            expiryDate,
        });

      /* UPDATE USER */

      await db
        .collection("users")
        .doc(userId)
        .set(
          {
            premium: true,

            verified: true,

            subscriptionPlan:
              "student-premium",

            subscriptionBilling:
              billing,

            subscriptionAmount:
              expectedAmount,

            subscriptionStatus:
              "active",

            subscriptionExpiresAt:
              expiryDate,

            updatedAt:
              new Date(),
          },
          {
            merge: true,
          }
        );

      return res.status(200).json({
        success: true,

        message:
          "Payment verified successfully",
      });
    } catch (error) {
      console.log(error);

      return res.status(500).json({
        success: false,
        error:
          "Internal server error",
      });
    }
  };
