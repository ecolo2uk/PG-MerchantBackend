// routes/transactionRoutes.js
import express from "express";
import {
  getTransactions,
  generateDynamicQR,
  generateDefaultQR,
  checkTransactionStatus,
  handlePaymentWebhook,
  getTransactionDetails,
  testConnection,
  

} from "../controllers/transactionController.js";
import { authenticateMerchant } from "../middleware/authMiddleware.js";
import  { validateTransactionData } from "../middleware/validationMiddleware.js";
const router = express.Router();

router.get("/", authenticateMerchant, getTransactions);
router.post("/generate-qr", authenticateMerchant, validateTransactionData, generateDynamicQR);
router.post("/default-qr", authenticateMerchant,  generateDefaultQR);
router.get("/status/:transactionId", authenticateMerchant, checkTransactionStatus);
router.get("/details/:transactionId", authenticateMerchant, getTransactionDetails);
router.get("/test", authenticateMerchant, testConnection); // Add test endpoint

// Webhook doesn't need authentication
router.post("/webhook", handlePaymentWebhook);

export default router;