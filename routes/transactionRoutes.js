// routes/transactionRoutes.js
import express from 'express';
import {
  getTransactions,
  generateDynamicQR,
  generateDefaultQR,
  handlePaymentWebhook,
  simulatePaymentWebhook,
  handleEnpayReturn,
  handleEnpaySuccess,
  debugQR
} from '../controllers/transactionController.js';

import { authenticateMerchant } from '../middleware/authMiddleware.js'; // <-- Import your middleware

const router = express.Router();

// Public routes (no authentication needed for webhooks/return URLs from Enpay)
// IMPORTANT: These must be publicly accessible for Enpay to hit them.
router.post('/webhook', handlePaymentWebhook);
router.get('/enpay-return', handleEnpayReturn);
router.post('/enpay-return', handleEnpayReturn);
router.get('/enpay-success', handleEnpaySuccess);
router.post('/enpay-success', handleEnpaySuccess);

// Authenticated routes: Apply authenticateMerchant middleware here
// All these routes require a valid merchant token to access
router.get('/', authenticateMerchant, getTransactions); // <-- Apply authenticateMerchant
router.post('/generate-dynamic-qr', authenticateMerchant, generateDynamicQR); // <-- Apply authenticateMerchant
router.post('/generate-default-qr', authenticateMerchant, generateDefaultQR); // <-- Apply authenticateMerchant
router.post('/simulate-webhook', authenticateMerchant, simulatePaymentWebhook); // <-- Apply authenticateMerchant
router.post('/debug-qr', authenticateMerchant, debugQR);

export default router;