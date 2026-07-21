import express from "express";
import { db } from "../firebase/firebaseAdmin.js";

const router = express.Router();

const validateContactInput = ({ name, email, subject, message }) => {
  const errors = [];
  if (!name?.trim()) errors.push("Name is required");
  if (!email?.trim()) errors.push("Email is required");
  if (!subject?.trim()) errors.push("Subject is required");
  if (!message?.trim()) errors.push("Message is required");
  return errors;
};

const handleContact = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    const errors = validateContactInput({ name, email, subject, message });
    if (errors.length > 0) {
      return res.status(400).json({
        message: errors.join(". "),
        errors,
      });
    }

    const docData = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || "",
      subject: subject.trim(),
      message: message.trim(),
      userId: req.user?.uid || null,
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const ref = await db.collection("contactMessages").add(docData);

    res.status(201).json({
      message: "Message sent successfully",
      id: ref.id,
    });
  } catch (error) {
    console.error("Contact submission error:", error);
    res.status(500).json({
      message: "Server Error",
    });
  }
};

router.post("/", handleContact);
router.post("/contact", handleContact);

export default router;