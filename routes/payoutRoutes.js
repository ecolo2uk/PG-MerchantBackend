import express from "express";
import {
  checkBalance,
  checkPayoutTransactionStatus,
  initiatePayoutTransaction,
} from "../controllers/payoutController.js";
const router = express.Router();

router.post("/initiate-transaction", initiatePayoutTransaction);
router.post("/transaction-status", checkPayoutTransactionStatus);
router.post("/check-balance", checkBalance);

export default router;
