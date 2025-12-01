// routes/dashboardRoutes.js
import express from 'express';
import { 
   getMerchantAnalytics,
  getMerchantTransactions,
  getMerchantSalesReport,
  getCurrentMerchant,
  getCurrentMerchantTransactions,
  getCurrentMerchantAnalytics,
  debugMerchantTransactions,
  checkDatabaseState
} from '../controllers/dashboardController.js';

const router = express.Router();

router.get('/merchant/analytics', getMerchantAnalytics);
router.get('/merchant/transactions', getMerchantTransactions);
router.get('/merchant/sales-report', getMerchantSalesReport);
router.get('/merchant/info', getCurrentMerchant);

// ✅ CURRENT MERCHANT (LOGGED-IN) ROUTES
router.get('/merchant/only/transactions', getCurrentMerchantTransactions);
router.get('/merchant/only/analytics', getCurrentMerchantAnalytics); // ✅ या endpoint ची गरज आहे

// ✅ DEBUG ROUTES
router.get('/merchant/debug', debugMerchantTransactions);
router.get('/check-db-state', checkDatabaseState);

// ✅ ADMIN ROUTES (असल्यास)
router.get('/sales-report', getMerchantSalesReport); // ✅ हे admin साठी


export default router;