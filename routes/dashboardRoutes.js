import express from 'express';
import { 
  getDashboardAnalytics, 
  getMerchantTransactionSummary,
  getRecentOrders,
  getAllMerchants,
  getTransactionsByMerchantStatus,
  debugDataStructure,
  checkMerchantData,
  getMerchantAnalytics,
  getSalesReport  // Add this import
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
// Merchant dashboard routes
router.get('/merchant-analytics', getMerchantAnalytics);
router.get('/merchant-transactions', getTransactionsByMerchantStatus);
router.get('/debug-structure', debugDataStructure);

// Add these new routes for merchant dashboard
router.get('/merchant-analytics', protect, getMerchantAnalytics);
router.get('/sales-report', protect, getSalesReport); // Add this route
router.get('/check-merchant-data', protect, checkMerchantData);

export default router;