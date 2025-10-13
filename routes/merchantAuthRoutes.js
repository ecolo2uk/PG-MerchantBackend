import express from 'express';
import { loginMerchant } from '../controllers/merchantAuth.js'; // Removed registerMerchant

const router = express.Router();

// Merchant Login Route
router.post("/login", loginMerchant);

export default router;