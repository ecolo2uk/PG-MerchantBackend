import express from "express";
import {
  loginMerchant,
  getUser,
  logoutMerchant,
} from "../controllers/merchantAuth.js"; // Removed registerMerchant
import { authenticateMerchant } from "../middleware/authMiddleware.js";

const router = express.Router();

// Merchant Login Route
router.post("/login", loginMerchant);
router.post("/logout", authenticateMerchant, logoutMerchant);
router.get("/user", authenticateMerchant, getUser);

export default router;
