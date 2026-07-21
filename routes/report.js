import express from "express";
import { db } from "../firebase/firebaseAdmin.js";

const router = express.Router();

const validateReportInput = ({ category, details }) => {
  const errors = [];
  if (!category?.trim()) errors.push("Category is required");
  if (!details?.trim()) errors.push("Details are required");
  return errors;
};

const handleReport = async (req, res) => {
  try {
    const { category, reportedUser, details, reportType, title, description } = req.body;

    const effectiveReportType = reportType || category;
    const effectiveDescription = description || details;
    const effectiveTitle = title || reportedUser || "";

    const errors = validateReportInput({ category: effectiveReportType, details: effectiveDescription });
    if (errors.length > 0) {
      return res.status(400).json({
        message: errors.join(". "),
        errors,
      });
    }

    const docData = {
      userId: req.user?.uid || null,
      displayName: req.user?.displayName || req.user?.name || "",
      email: req.user?.email || "",
      reportType: effectiveReportType.trim(),
      title: effectiveTitle.trim(),
      description: effectiveDescription.trim(),
      attachments: [],
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const ref = await db.collection("reports").add(docData);

    res.status(201).json({
      message: "Report submitted successfully",
      id: ref.id,
    });
  } catch (error) {
    console.error("Report submission error:", error);
    res.status(500).json({
      message: "Server Error",
    });
  }
};

router.post("/", handleReport);
router.post("/report", handleReport);

export default router;