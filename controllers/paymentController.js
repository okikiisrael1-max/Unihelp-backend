import { db } from "../firebase/firebaseAdmin.js";

import {
  verifyFlutterwavePayment,
} from "../services/flutterwaveService.js";

export const verifyPayment =
  async (req, res) => {
    try {
      const {
        transaction_id,
        userId,
        plan,
        billing,
        amount,
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

      /* VERIFY WITH FLUTTERWAVE */

      const verification =
        await verifyFlutterwavePayment(
          transaction_id
        );

      const paymentData =
        verification.data;

      console.log(paymentData);

      if (
        paymentData.status !==
          "successful" ||
        paymentData.amount !== amount
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

          billing,

          amount,

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
              amount,

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