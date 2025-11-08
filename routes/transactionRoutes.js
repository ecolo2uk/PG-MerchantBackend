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
 fixSchema,
  testEnpayConnection,
  testEnpayEndpoints,
  enpayDebugScript
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
router.get("/debug-simple", authenticateMerchant, debugSchema);
router.post("/fix-schema", authenticateMerchant, fixSchema);
router.get("/test-connection", authenticateMerchant, testConnection);
// Debug routes
router.post("/test-enpay", authenticateMerchant, testEnpayConnection);
router.post("/webhook", handlePaymentWebhook);
// routes/transactionRoutes.js मध्ये
router.get('/test-enpay-endpoints', authenticateMerchant, testEnpayEndpoints);
router.get('/enpay-debug', authenticateMerchant, enpayDebugScript);
export default router;