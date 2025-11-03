import express from "express";
import {
  getTransactions,
  generateDynamicQR,
  generateDefaultQR,
  checkTransactionStatus,
  handlePaymentWebhook,
  getTransactionDetails,
  testConnection,
 debugSchema,
 fixSchema
} from "../controllers/transactionController.js";
import { authenticateMerchant } from "../middleware/authMiddleware.js";
import { validateTransactionData } from "../middleware/validationMiddleware.js";

const router = express.Router();

// All transaction routes
router.get("/", authenticateMerchant, getTransactions);
router.post("/generate-qr", authenticateMerchant, validateTransactionData, generateDynamicQR);
router.post("/default-qr", authenticateMerchant, generateDefaultQR);
router.get("/status/:transactionId", authenticateMerchant, checkTransactionStatus);
router.get("/details/:transactionId", authenticateMerchant, getTransactionDetails);
// Add to your transaction routes
router.get("/debug-schema", authenticateMerchant, debugSchema);
router.post("/fix-schema", authenticateMerchant, fixSchema);
router.get("/test-connection", authenticateMerchant, testConnection);
// Debug routes

router.post("/webhook", handlePaymentWebhook);

export default router;