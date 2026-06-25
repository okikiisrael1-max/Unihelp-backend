import express from "express";
import nodemailer from "nodemailer";

const router = express.Router();

router.post("/report", async (req, res) => {
  try {
    const { category, reportedUser, details } = req.body;

    if (!category || !details) {
      return res.status(400).json({
        message: "Please fill all required fields",
      });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",

      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,

      to: process.env.RECEIVER_EMAIL,

      subject: `New Report - ${category}`,

      html: `
        <h2>New User Report</h2>

        <p><strong>Category:</strong> ${category}</p>

        <p><strong>Reported User:</strong> ${
          reportedUser || "Not provided"
        }</p>

        <p><strong>Details:</strong></p>

        <p>${details}</p>
      `,
    });

    res.status(200).json({
      message: "Report submitted successfully",
    });

  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Server Error",
    });
  }
});

export default router;