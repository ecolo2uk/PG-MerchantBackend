import express from 'express';
import { 
  getMerchantAnalytics,
  getMerchantTransactions,
  getMerchantSalesReport,
  getCurrentMerchant
} from '../controllers/dashboardController.js';

const router = express.Router();

// Merchant-specific routes
router.get('/merchant/analytics', getMerchantAnalytics);
router.get('/merchant/transactions', getMerchantTransactions);
router.get('/merchant/sales-report', getMerchantSalesReport);
router.get('/merchant/info', getCurrentMerchant);

export default router;