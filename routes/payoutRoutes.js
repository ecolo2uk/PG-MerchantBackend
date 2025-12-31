import express from "express";
import { initiatePayoutTransaction } from "../controllers/payoutController.js";
const router = express.Router();

router.post("/initiate-transaction", initiatePayoutTransaction);

export default router;
