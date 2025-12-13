// routes/transaction.js - UPDATED
import express from "express";
import {
  getTransactions,
  generateDynamicQR,
  generateDefaultQR,
  getMerchantConnector,
  createDefaultConnectorAccount,
  debugEndpoint,
  generateDynamicQRTransaction,
  generateDefaultQRTransaction,
  generatePaymentLinkTransaction,
  getSalesTransactions,
  exportSalesToExcel,
} from "../controllers/transactionController.js";
import { authenticateMerchant } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authenticateMerchant, getTransactions);
router.get("/sales", authenticateMerchant, getSalesTransactions);
router.get("/exportSales", authenticateMerchant, exportSalesToExcel);

router.post("/generate-static-qr", generateDefaultQRTransaction);
router.post("/generate-dynamic-qr", generateDynamicQRTransaction);
router.post("/generate-payment-link", generatePaymentLinkTransaction);
router.post("/generate-qr", authenticateMerchant, generateDynamicQR);
router.post("/default-qr", authenticateMerchant, generateDefaultQR);
router.get("/connector", authenticateMerchant, getMerchantConnector);
router.post(
  "/create-connector",
  authenticateMerchant,
  createDefaultConnectorAccount
);
router.get("/debug", authenticateMerchant, debugEndpoint);

export default router;
