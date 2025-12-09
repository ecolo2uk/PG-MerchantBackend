import express from "express";
import { loginMerchant, getUser } from "../controllers/merchantAuth.js"; // Removed registerMerchant

const router = express.Router();

// Merchant Login Route
router.post("/login", loginMerchant);
router.get("/user", getUser);

export default router;
