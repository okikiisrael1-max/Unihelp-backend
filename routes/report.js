import express from "express";
import nodemailer from "nodemailer";

const router = express.Router();

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const handleReport = async (req, res) => {
  try {
    const { category, reportedUser, details } = req.body;

    if (!category?.trim() || !details?.trim()) {
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

      subject: `New Report - ${category.trim()}`,

      html: `
        <h2>New User Report</h2>

        <p><strong>Category:</strong> ${escapeHtml(category.trim())}</p>

        <p><strong>Reported User:</strong> ${
          escapeHtml(reportedUser?.trim() || "Not provided")
        }</p>

        <p><strong>Details:</strong></p>

        <p>${escapeHtml(details.trim()).replace(/\n/g, "<br />")}</p>
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
};

router.post("/", handleReport);
router.post("/report", handleReport);

export default router;
