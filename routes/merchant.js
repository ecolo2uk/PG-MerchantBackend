import express from "express";

import { getMerchantConnector } from '../controllers/merchantController.js';
import { authenticateMerchant } from "../middleware/authMiddleware.js";

const router = express.Router();


router.get('/connector-account', authenticateMerchant, getMerchantConnector);

export default router;