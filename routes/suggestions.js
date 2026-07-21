import express from "express";
import { db } from "../firebase/firebaseAdmin.js";

const router = express.Router();

const validateSuggestionInput = ({ title, category }) => {
  const errors = [];
  if (!title?.trim()) errors.push("Title is required");
  if (!category?.trim()) errors.push("Category is required");
  return errors;
};

const handleSuggestion = async (req, res) => {
  try {
    const { title, category, description } = req.body;

    const errors = validateSuggestionInput({ title, category });
    if (errors.length > 0) {
      return res.status(400).json({
        message: errors.join(". "),
        errors,
      });
    }

    const docData = {
      userId: req.user?.uid || null,
      title: title.trim(),
      category: category.trim(),
      description: description?.trim() || "",
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const ref = await db.collection("suggestions").add(docData);

    res.status(201).json({
      message: "Suggestion submitted successfully",
      id: ref.id,
    });
  } catch (error) {
    console.error("Suggestion submission error:", error);
    res.status(500).json({
      message: "Server Error",
    });
  }
};

router.post("/", handleSuggestion);
router.post("/suggest", handleSuggestion);

export default router;