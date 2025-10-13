// routes/transactionRoutes.js
import express from "express";
import {
  getTransactions,
  generateDynamicQR,
  initiateCollectRequest,
  generateDefaultQR,
  checkTransactionStatus,
  handlePaymentWebhook
} from "../controllers/transactionController.js";
import { authenticateMerchant } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes protected with merchant authentication
router.get("/", authenticateMerchant, getTransactions);
router.post("/generate-qr", authenticateMerchant, generateDynamicQR);
router.post("/initiate-collect", authenticateMerchant, initiateCollectRequest);
router.post("/default-qr", authenticateMerchant, generateDefaultQR);
router.get("/status/:transactionId", authenticateMerchant, checkTransactionStatus);

// Webhook doesn't need authentication
router.post("/webhook", handlePaymentWebhook);

export default router;