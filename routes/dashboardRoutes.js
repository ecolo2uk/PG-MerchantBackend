import express from 'express';
import { 
  getDashboardAnalytics, 
  getMerchantTransactionSummary,
  getRecentOrders,
  getAllMerchants,
  getTransactionsByMerchantStatus,
  debugDataStructure,
  checkMerchantData,
  getMerchantAnalytics  
} from '../controllers/dashboardController.js';

const router = express.Router();

const protect = (req, res, next) => {
  
  next(); 
};

// Apply protect middleware to routes that require authentication
router.get('/analytics', protect, getDashboardAnalytics);
router.get('/recent-orders', protect, getRecentOrders);
router.get('/merchant-transaction-summary', protect, getMerchantTransactionSummary); 
router.get('/merchants', protect, getAllMerchants); 
router.get('/transactions-by-merchant', protect, getTransactionsByMerchantStatus);
router.get('/debug-structure', debugDataStructure);

// Add these new routes for merchant dashboard
router.get('/merchant-analytics', protect, getMerchantAnalytics);
// Note: merchant-transactions route already exists above as 'transactions-by-merchant'
// routes.js मध्ये
router.get('/check-merchant-data', protect, checkMerchantData);
export default router;