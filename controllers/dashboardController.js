// controllers/dashboardController.js
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import mongoose from 'mongoose';

const getDateRange = (filter, startDate, endDate) => {
  const now = new Date();
  let start, end;

  switch (filter) {
    case 'today':
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
      break;
    case 'yesterday':
      start = new Date(now);
      start.setDate(now.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setDate(now.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case 'this_week':
      start = new Date(now);
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
      break;
    case 'this_month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'last_month':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'custom':
      if (startDate && endDate) {
        start = new Date(startDate);
        end = new Date(endDate);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
      } else {
        return {};
      }
      break;
    default:
      return {};
  }

  return {
    createdAt: {
      $gte: start,
      $lte: end
    }
  };
};

// ✅ FIXED: Merchant Analytics with proper merchant ID handling
export const getMerchantAnalytics = async (req, res) => {
  try {
    const { merchantId, timeFilter = 'today', startDate, endDate } = req.query;

    console.log('🟡 Merchant Analytics Request:', { merchantId, timeFilter });

    if (!merchantId) {
      return res.status(400).json({ message: 'Merchant ID is required' });
    }

    // ✅ FIX: Handle both string and ObjectId merchant IDs
    let merchantQuery;
    if (mongoose.Types.ObjectId.isValid(merchantId)) {
      merchantQuery = { merchantId: new mongoose.Types.ObjectId(merchantId) };
    } else {
      // If it's not a valid ObjectId, try as string
      merchantQuery = { merchantId: merchantId };
    }

    let matchQuery = { ...merchantQuery };

    const dateRange = getDateRange(timeFilter, startDate, endDate);
    if (Object.keys(dateRange).length > 0) {
      matchQuery.createdAt = dateRange.createdAt;
    }

    console.log('🔍 Merchant Analytics Match Query:', JSON.stringify(matchQuery, null, 2));

    // 🔍 DEBUG: Check what transactions actually exist
    const debugTransactions = await Transaction.find(matchQuery).select('status amount createdAt merchantId').lean();
    console.log('🔍 DEBUG - Found transactions:', debugTransactions.length);
    console.log('🔍 DEBUG - Transaction details:', debugTransactions.map(t => ({ 
      status: t.status, 
      amount: t.amount,
      merchantId: t.merchantId 
    })));

    const analytics = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalSuccessAmount: {
            $sum: { 
              $cond: [{ $eq: ["$status", "SUCCESS"] }, "$amount", 0] 
            }
          },
          totalFailedAmount: {
            $sum: { 
              $cond: [{ $eq: ["$status", "FAILED"] }, "$amount", 0] 
            }
          },
          totalPendingAmount: {
            $sum: { 
              $cond: [{ $in: ["$status", ["PENDING", "INITIATED", "CREATED"]] }, "$amount", 0] 
            }
          },
          totalRefundAmount: {
            $sum: { 
              $cond: [{ $eq: ["$status", "REFUNDED"] }, "$amount", 0] 
            }
          },
          totalSuccessOrders: {
            $sum: { 
              $cond: [{ $eq: ["$status", "SUCCESS"] }, 1, 0] 
            }
          },
          totalFailedOrders: {
            $sum: { 
              $cond: [{ $eq: ["$status", "FAILED"] }, 1, 0] 
            }
          },
          totalPendingOrders: {
            $sum: { 
              $cond: [{ $in: ["$status", ["PENDING", "INITIATED", "CREATED"]] }, 1, 0] 
            }
          },
          totalRefundOrders: {
            $sum: { 
              $cond: [{ $eq: ["$status", "REFUNDED"] }, 1, 0] 
            }
          },
          totalTransactions: { $sum: 1 }
        }
      }
    ]);

    const result = analytics.length > 0 ? analytics[0] : {
      totalSuccessAmount: 0,
      totalFailedAmount: 0,
      totalPendingAmount: 0,
      totalRefundAmount: 0,
      totalSuccessOrders: 0,
      totalFailedOrders: 0,
      totalPendingOrders: 0,
      totalRefundOrders: 0,
      totalTransactions: 0
    };

    // Remove _id field from result
    delete result._id;

    console.log('✅ Merchant Analytics Result:', result);
    console.log('✅ DEBUG - Actual transactions found:', debugTransactions.length);
    
    res.status(200).json(result);

  } catch (error) {
    console.error('❌ Merchant Analytics Error:', error);
    
    res.status(500).json({
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
};

// ✅ FIXED: Merchant Transactions with proper merchant ID handling
export const getMerchantTransactions = async (req, res) => {
  try {
    const { merchantId, status, timeFilter = 'today', page = 1, limit = 10, startDate, endDate } = req.query;

    console.log('🟡 Merchant Transactions Request:', { merchantId, status, timeFilter });

    if (!merchantId) {
      return res.status(400).json({ message: 'Merchant ID is required' });
    }

    // ✅ FIX: Handle both string and ObjectId merchant IDs
    let merchantQuery;
    if (mongoose.Types.ObjectId.isValid(merchantId)) {
      merchantQuery = { merchantId: new mongoose.Types.ObjectId(merchantId) };
    } else {
      merchantQuery = { merchantId: merchantId };
    }

    let matchQuery = { ...merchantQuery };

    // Status filter
    if (status && status !== 'all') {
      const statusMapping = {
        'SUCCESS': 'SUCCESS',
        'PENDING': ['PENDING', 'INITIATED', 'CREATED'],
        'FAILED': 'FAILED',
        'REFUND': 'REFUNDED'
      };
      
      if (statusMapping[status]) {
        matchQuery.status = Array.isArray(statusMapping[status]) 
          ? { $in: statusMapping[status] }
          : statusMapping[status];
      }
    }

    const dateRange = getDateRange(timeFilter, startDate, endDate);
    if (Object.keys(dateRange).length > 0) {
      matchQuery.createdAt = dateRange.createdAt;
    }

    console.log('🔍 Merchant Transactions Match Query:', JSON.stringify(matchQuery, null, 2));

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // 🔍 DEBUG: Check total count
    const totalCount = await Transaction.countDocuments(matchQuery);
    console.log(`🔍 DEBUG - Total transactions matching query: ${totalCount}`);

    const transactions = await Transaction.find(matchQuery)
      .select('transactionId merchantOrderId amount status currency createdAt updatedAt merchantName customerName customerVPA paymentMethod settlementStatus commission netAmount')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    console.log(`✅ Found ${transactions.length} transactions for merchant`);
    console.log('🔍 Sample transaction:', transactions.length > 0 ? {
      id: transactions[0]._id,
      status: transactions[0].status,
      amount: transactions[0].amount,
      merchantId: transactions[0].merchantId
    } : 'No transactions');

    res.status(200).json({
      docs: transactions,
      totalDocs: totalCount,
      limit: parseInt(limit),
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      hasNextPage: page * limit < totalCount,
      hasPrevPage: page > 1
    });

  } catch (error) {
    console.error('❌ Merchant Transactions Error:', error);
    
    res.status(500).json({
      message: 'Failed to fetch transactions',
      error: error.message
    });
  }
};

// ✅ FIXED: Debug endpoint to check ALL data
export const debugMerchantData = async (req, res) => {
  try {
    const { merchantId } = req.query;

    console.log('🔍 Debugging merchant data for:', merchantId);

    if (!merchantId) {
      return res.status(400).json({ message: 'Merchant ID is required' });
    }

    // Check merchant in User collection
    let merchantUser;
    if (mongoose.Types.ObjectId.isValid(merchantId)) {
      merchantUser = await User.findById(merchantId);
    } else {
      merchantUser = await User.findOne({ 
        $or: [
          { _id: merchantId },
          { email: merchantId },
          { company: merchantId }
        ]
      });
    }
    console.log('🔍 Merchant User:', merchantUser);

    // Check ALL transactions with different merchant ID formats
    const stringMerchantTransactions = await Transaction.find({ merchantId: merchantId });
    console.log('🔍 Transactions with string merchantId:', stringMerchantTransactions.length);

    let objectIdTransactions = [];
    if (mongoose.Types.ObjectId.isValid(merchantId)) {
      objectIdTransactions = await Transaction.find({ 
        merchantId: new mongoose.Types.ObjectId(merchantId) 
      });
      console.log('🔍 Transactions with ObjectId merchantId:', objectIdTransactions.length);
    }

    // Check ALL transactions regardless of merchant
    const allTransactions = await Transaction.find().limit(10);
    console.log('🔍 ALL transactions in database (first 10):', allTransactions.map(t => ({
      _id: t._id,
      merchantId: t.merchantId,
      status: t.status,
      amount: t.amount,
      createdAt: t.createdAt
    })));

    // Check transaction schema
    const sampleTransaction = await Transaction.findOne();
    console.log('🔍 Transaction schema sample:', sampleTransaction ? {
      fields: Object.keys(sampleTransaction.toObject())
    } : 'No transactions in database');

    res.status(200).json({
      merchant: merchantUser,
      transactionsWithStringId: stringMerchantTransactions.length,
      transactionsWithObjectId: objectIdTransactions.length,
      allTransactionsSample: allTransactions,
      transactionSchema: sampleTransaction ? Object.keys(sampleTransaction.toObject()) : []
    });

  } catch (error) {
    console.error('❌ Debug error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ✅ NEW: Fix merchant transactions by updating merchant IDs
export const fixMerchantTransactions = async (req, res) => {
  try {
    const { oldMerchantId, newMerchantId } = req.body;

    if (!oldMerchantId || !newMerchantId) {
      return res.status(400).json({ message: 'Both old and new merchant IDs are required' });
    }

    console.log('🔧 Fixing merchant transactions:', { oldMerchantId, newMerchantId });

    // Find transactions with old merchant ID
    const transactionsToUpdate = await Transaction.find({ merchantId: oldMerchantId });
    console.log(`🔧 Found ${transactionsToUpdate.length} transactions to update`);

    // Update merchant IDs
    const updateResult = await Transaction.updateMany(
      { merchantId: oldMerchantId },
      { $set: { merchantId: newMerchantId } }
    );

    console.log('🔧 Update result:', updateResult);

    // Verify the update
    const updatedTransactions = await Transaction.find({ merchantId: newMerchantId });
    console.log(`🔧 Now found ${updatedTransactions.length} transactions with new merchant ID`);

    res.status(200).json({
      message: 'Merchant transactions updated successfully',
      updatedCount: updateResult.modifiedCount,
      previousCount: transactionsToUpdate.length,
      currentCount: updatedTransactions.length
    });

  } catch (error) {
    console.error('❌ Fix merchant transactions error:', error);
    res.status(500).json({ error: error.message });
  }
};