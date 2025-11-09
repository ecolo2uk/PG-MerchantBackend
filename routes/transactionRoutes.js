import express from "express";
import {
  getTransactions,
  generateDynamicQR,
  generateDefaultQR,
  checkTransactionStatus,
  getTransactionDetails,
  testConnection,
    testEnpayDirectAPI, // ✅ ADD THIS

  testEnpayConnection,
  simpleDebug
} from "../controllers/transactionController.js";
import { authenticateMerchant } from "../middleware/authMiddleware.js";

const router = express.Router();

// ✅ CLEAN ROUTES - No duplicates
router.get("/", authenticateMerchant, getTransactions);
router.post("/generate-qr", authenticateMerchant, generateDynamicQR);
router.post("/default-qr", authenticateMerchant, generateDefaultQR);
router.get("/status/:transactionId", authenticateMerchant, checkTransactionStatus);
router.get("/details/:transactionId", authenticateMerchant, getTransactionDetails);
router.get("/test-connection", authenticateMerchant, testConnection);
router.get("/test-enpay", authenticateMerchant, testEnpayConnection);
router.get("/debug", authenticateMerchant, simpleDebug);
router.get("/test-enpay-direct", authenticateMerchant, testEnpayDirectAPI); // ✅ ADD THIS

export default router;