// routes/transactionRoutes.js
import express from 'express';
import {
  getTransactions,
  generateDynamicQR,
  generateDefaultQR,
  handlePaymentWebhook,
  simulatePaymentWebhook,
  handleEnpayReturn, // For Enpay's return URL
  handleEnpaySuccess  // For Enpay's success URL
} from '../controllers/transactionController.js';

// Assuming you have an authentication middleware (e.g., that sets req.user)
// import { authenticateJWT } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Public routes (no authentication needed for webhooks/return URLs from Enpay)
// IMPORTANT: Ensure these webhook/return URLs are publicly accessible
// from Enpay's servers.
router.post('/webhook', handlePaymentWebhook);
router.get('/enpay-return', handleEnpayReturn); // Enpay might use GET for returnURL
router.post('/enpay-return', handleEnpayReturn); // Or POST
router.get('/enpay-success', handleEnpaySuccess); // Enpay might use GET for successURL
router.post('/enpay-success', handleEnpaySuccess); // Or POST

// Authenticated routes (assuming you have authenticateJWT middleware)
// For demonstration, commenting out authenticateJWT. Uncomment for production.
// router.get('/', authenticateJWT, getTransactions);
// router.post('/generate-dynamic-qr', authenticateJWT, generateDynamicQR);
// router.post('/generate-default-qr', authenticateJWT, generateDefaultQR);
// router.post('/simulate-webhook', authenticateJWT, simulatePaymentWebhook);

// For testing purposes without JWT if not fully integrated yet:
router.get('/', getTransactions);
router.post('/generate-dynamic-qr', generateDynamicQR);
router.post('/generate-default-qr', generateDefaultQR);
router.post('/simulate-webhook', simulatePaymentWebhook); // Use this for testing webhook logic


export default router;