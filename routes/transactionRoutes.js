// routes/transaction.js
import express from "express";
import {
  getTransactions,
  generateDynamicQR,
  generateDefaultQR,
  // checkTransactionStatus,
  // getTransactionDetails,
  // testConnection,
  simpleDebug,
} from "../controllers/transactionController.js";
import { authenticateMerchant } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authenticateMerchant, getTransactions);
router.post("/generate-qr", authenticateMerchant, generateDynamicQR);
router.post("/default-qr", authenticateMerchant, generateDefaultQR);
// router.get("/status/:transactionId", authenticateMerchant, checkTransactionStatus);
// router.get("/details/:transactionId", authenticateMerchant, getTransactionDetails);
// router.get("/test-connection", authenticateMerchant, testConnection);
router.get("/debug", authenticateMerchant, simpleDebug);

export default router;