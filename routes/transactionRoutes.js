// routes/transactionRoutes.js - UPDATED
import express from "express";
import {
  getTransactions,
  generateDynamicQR,
  generateDefaultQR,
  checkTransactionStatus,
  handlePaymentWebhook,
  getTransactionDetails,
  downloadReceipt,
  initiateRefund,
  debugTransactions,
  checkSchema,
  debugQRGeneration,
  analyzeSchema,
  simulatePaymentWebhook,
  listAllEndpoints
} from "../controllers/transactionController.js";
import { authenticateMerchant } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes protected with merchant authentication
router.get("/", authenticateMerchant, getTransactions);
router.post("/generate-qr", authenticateMerchant, generateDynamicQR);
router.post("/default-qr", authenticateMerchant, generateDefaultQR);
router.get("/status/:transactionId", authenticateMerchant, checkTransactionStatus);
router.get("/details/:transactionId", authenticateMerchant, getTransactionDetails);
router.get("/receipt/:transactionId", authenticateMerchant, downloadReceipt);
router.post("/refund/:transactionId", authenticateMerchant, initiateRefund);
router.get("/debug", authenticateMerchant, debugTransactions);
router.get("/check-schema", authenticateMerchant, checkSchema);
// In your transactionRoutes.js, add:
router.post("/debug-qr", authenticateMerchant, debugQRGeneration);
// Add route
router.get("/analyze-schema", authenticateMerchant, analyzeSchema);
// Webhook doesn't need authentication
router.post("/webhook", handlePaymentWebhook);
router.post("/simulate-webhook", authenticateMerchant, simulatePaymentWebhook);
// In transactionRoutes.js
router.get("/endpoints", listAllEndpoints);
export default router;