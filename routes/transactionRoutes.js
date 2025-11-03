import express from "express";
import {
  getTransactions,
  generateDynamicQR,
  generateDefaultQR,
  checkTransactionStatus,
  handlePaymentWebhook,
  getTransactionDetails,
  testConnection,
  debugDefaultQRSimple,
  testDatabaseConnection,
  testSchemaValidation,
  downloadReceipt,
  initiateRefund,
  simulatePaymentWebhook
} from "../controllers/transactionController.js";
import { authenticateMerchant } from "../middleware/authMiddleware.js";
import { validateTransactionData } from "../middleware/validationMiddleware.js";

const router = express.Router();

// Debug routes
router.get('/debug-simple', authenticateMerchant, debugDefaultQRSimple);
// router.get('/test-schema', authenticateMerchant, testSchemaValidation);
router.get('/test-db', authenticateMerchant, testDatabaseConnection);

// Main routes
router.get("/", authenticateMerchant, getTransactions);
router.post("/generate-qr", authenticateMerchant, validateTransactionData, generateDynamicQR);
router.post("/default-qr", authenticateMerchant, generateDefaultQR);
router.get("/status/:transactionId", authenticateMerchant, checkTransactionStatus);
router.get("/details/:transactionId", authenticateMerchant, getTransactionDetails);
router.get("/test", authenticateMerchant, testConnection);

// Receipt and Refund routes
router.get("/receipt/:transactionId", authenticateMerchant, downloadReceipt);
router.post("/refund/:transactionId", authenticateMerchant, initiateRefund);

// Webhook and simulation routes
router.post("/webhook", handlePaymentWebhook);
router.post("/simulate-webhook", simulatePaymentWebhook);

export default router;