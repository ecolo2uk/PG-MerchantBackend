// routes/dashboardRoutes.js
import express from 'express';
import { 
  getMerchantAnalytics,
  getMerchantTransactions,
  getMerchantSalesReport,
  getCurrentMerchant,
  debugMerchantTransactions,
  getCurrentMerchantTransactions,    // ✅ सिर्फ एक बार
  getCurrentMerchantAnalytics   
} from '../controllers/dashboardController.js';

const router = express.Router();

router.get('/merchant/analytics', getMerchantAnalytics);
router.get('/merchant/transactions', getMerchantTransactions);
router.get('/merchant/sales-report', getMerchantSalesReport);
router.get('/merchant/info', getCurrentMerchant);
router.get('/merchant/debug', debugMerchantTransactions);

// ✅ NEW routes for merchant-specific data (RECOMMENDED)
router.get('/merchant/only/transactions', getCurrentMerchantTransactions);
router.get('/merchant/only/analytics', getCurrentMerchantAnalytics);

export default router;