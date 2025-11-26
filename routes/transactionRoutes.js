// routes/transaction.js
import express from "express";
import {
  getTransactions,
  generateDynamicQR,
  generateDefaultQR,
  getMerchantConnector,
  debugConnectorData,
  simpleDebug,
  createDefaultConnectorAccount,
  debugMerchantSetup,
} from "../controllers/transactionController.js";
import { authenticateMerchant } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authenticateMerchant, getTransactions);
router.post("/generate-qr", authenticateMerchant, generateDynamicQR);
router.post("/default-qr", authenticateMerchant, generateDefaultQR);
router.get("/connector", authenticateMerchant, getMerchantConnector);
router.get("/debug-connector", authenticateMerchant, debugConnectorData);
router.get("/debug", authenticateMerchant, simpleDebug);
// Add to routes/transaction.js
// Add to routes/transaction.js
router.post("/create-connector", authenticateMerchant, createDefaultConnectorAccount);
router.get("/debug-setup", authenticateMerchant, debugMerchantSetup);
export default router;