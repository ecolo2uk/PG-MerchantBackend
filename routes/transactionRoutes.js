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
  simulatePaymentWebhook,
  syncAllQRToMain
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
router.post("/sync-all", authenticateMerchant, syncAllQRToMain);

// Webhook doesn't need authentication
router.post("/webhook", handlePaymentWebhook);
router.post("/simulate-webhook", authenticateMerchant, simulatePaymentWebhook);

export default router;