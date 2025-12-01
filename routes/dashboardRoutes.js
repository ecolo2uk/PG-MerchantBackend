// routes/dashboardRoutes.js
import express from 'express';
import { 
   getMerchantAnalytics,
  getMerchantTransactions,
  getMerchantSalesReport,
  getCurrentMerchant,
  getCurrentMerchantTransactions,
  getCurrentMerchantAnalytics,
  debugMerchantTransactions
} from '../controllers/dashboardController.js';

const router = express.Router();

router.get('/merchant/analytics', getMerchantAnalytics);
router.get('/merchant/transactions', getMerchantTransactions);
router.get('/merchant/sales-report', getMerchantSalesReport);
router.get('/merchant/info', getCurrentMerchant);

// ✅ MERCHANT CURRENT (LOGGED-IN MERCHANT) ROUTES
router.get('/merchant/only/transactions', getCurrentMerchantTransactions);
router.get('/merchant/only/analytics', getCurrentMerchantAnalytics);
router.get('/merchant/debug', debugMerchantTransactions);

export default router;