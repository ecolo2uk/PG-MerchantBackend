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

// ✅ MERCHANT CURRENT (LOGGED-IN MERCHANT) ROUTES
router.get('/merchant/only/transactions', getCurrentMerchantTransactions);
router.get('/merchant/only/analytics', getCurrentMerchantAnalytics);
router.get('/merchant/debug', debugMerchantTransactions);
// routes/dashboardRoutes.js मध्ये add करा:
router.get('/test-merchant', async (req, res) => {
  try {
    const { merchantId } = req.query;
    
    console.log('🧪 Testing merchant:', merchantId);
    
    // 1. Check User collection
    const merchant = await User.findById(merchantId);
    console.log('User found:', merchant ? 'YES' : 'NO');
    
    // 2. Check Transaction collection
    const transactions = await Transaction.find({
      $or: [
        { merchantId: merchantId },
        { merchantId: new mongoose.Types.ObjectId(merchantId) }
      ]
    }).limit(10);
    
    console.log(`Transactions found: ${transactions.length}`);
    
    // 3. Check all possible merchant IDs in transactions
    const allTransactions = await Transaction.find({}).limit(20);
    const allMerchantIds = allTransactions.map(t => ({
      merchantId: t.merchantId,
      type: typeof t.merchantId,
      isObjectId: mongoose.Types.ObjectId.isValid(t.merchantId)
    }));
    
    res.json({
      merchantExists: !!merchant,
      merchantDetails: merchant ? {
        id: merchant._id,
        name: merchant.company || `${merchant.firstname} ${merchant.lastname}`,
        email: merchant.email
      } : null,
      transactionsFound: transactions.length,
      transactions: transactions.map(t => ({
        id: t._id,
        merchantId: t.merchantId,
        status: t.status,
        amount: t.amount,
        Amount: t.Amount,
        createdAt: t.createdAt
      })),
      sampleMerchantIds: allMerchantIds,
      message: `Database check complete for merchant ${merchantId}`
    });
    
  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/check-db-state', checkDatabaseState);

export default router;