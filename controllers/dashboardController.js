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

// ✅ IMPROVED: Merchant Analytics with ALL status support
export const getMerchantAnalytics = async (req, res) => {
  try {
    const { merchantId, timeFilter = 'today', startDate, endDate } = req.query;

    console.log('🟡 Merchant Analytics Request:', { merchantId, timeFilter });

    if (!merchantId) {
      return res.status(400).json({ message: 'Merchant ID is required' });
    }

    let matchQuery = {
      merchantId: merchantId // ✅ Direct string comparison
    };

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
      merchantId: t.merchantId,
      createdAt: t.createdAt
    })));

    const analytics = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalSuccessAmount: {
            $sum: { 
              $cond: [{ $eq: ["$status", "SUCCESS"] }, { $ifNull: ["$amount", 0] }, 0] 
            }
          },
          totalFailedAmount: {
            $sum: { 
              $cond: [{ $eq: ["$status", "FAILED"] }, { $ifNull: ["$amount", 0] }, 0] 
            }
          },
          totalPendingAmount: {
            $sum: { 
              $cond: [{ $in: ["$status", ["PENDING", "INITIATED", "CREATED"]] }, { $ifNull: ["$amount", 0] }, 0] 
            }
          },
          totalRefundAmount: {
            $sum: { 
              $cond: [{ $eq: ["$status", "REFUNDED"] }, { $ifNull: ["$amount", 0] }, 0] 
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
    
    res.status(200).json({
      ...result,
      debugInfo: {
        merchantIdUsed: merchantId,
        timeFilter: timeFilter,
        actualTransactions: debugTransactions.length,
        dateRange: dateRange
      }
    });

  } catch (error) {
    console.error('❌ Merchant Analytics Error:', error);
    
    res.status(500).json({
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
};

// ✅ IMPROVED: Merchant Transactions with better filtering
export const getMerchantTransactions = async (req, res) => {
  try {
    const { merchantId, status, timeFilter = 'today', page = 1, limit = 10, startDate, endDate } = req.query;

    console.log('🟡 Merchant Transactions Request:', { merchantId, status, timeFilter, page, limit });

    if (!merchantId) {
      return res.status(400).json({ message: 'Merchant ID is required' });
    }

    let matchQuery = {
      merchantId: merchantId // ✅ Direct string comparison
    };

    // Status filter
    if (status && status !== 'all') {
      const statusMapping = {
        'SUCCESS': ['SUCCESS'],
        'PENDING': ['PENDING', 'INITIATED', 'CREATED'],
        'FAILED': ['FAILED'],
        'REFUND': ['REFUNDED']
      };
      
      if (statusMapping[status]) {
        matchQuery.status = { $in: statusMapping[status] };
      }
    }

    const dateRange = getDateRange(timeFilter, startDate, endDate);
    if (Object.keys(dateRange).length > 0) {
      matchQuery.createdAt = dateRange.createdAt;
    }

    console.log('🔍 Merchant Transactions Match Query:', JSON.stringify(matchQuery, null, 2));

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get transactions with pagination
    const transactions = await Transaction.find(matchQuery)
      .select('transactionId merchantOrderId amount status currency createdAt updatedAt merchantName customerName customerVPA paymentMethod settlementStatus commission netAmount')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalCount = await Transaction.countDocuments(matchQuery);

    console.log(`✅ Found ${transactions.length} transactions for merchant ${merchantId}`);
    console.log('🔍 Sample transaction:', transactions.length > 0 ? {
      id: transactions[0]._id,
      transactionId: transactions[0].transactionId,
      status: transactions[0].status,
      amount: transactions[0].amount,
      merchantId: transactions[0].merchantId,
      createdAt: transactions[0].createdAt
    } : 'No transactions');

    res.status(200).json({
      docs: transactions,
      totalDocs: totalCount,
      limit: parseInt(limit),
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      hasNextPage: page * limit < totalCount,
      hasPrevPage: page > 1,
      debugInfo: {
        merchantId: merchantId,
        matchQuery: matchQuery,
        totalMatching: totalCount
      }
    });

  } catch (error) {
    console.error('❌ Merchant Transactions Error:', error);
    
    res.status(500).json({
      message: 'Failed to fetch transactions',
      error: error.message
    });
  }
};

// ✅ IMPROVED: Sales Report with proper data grouping
export const getMerchantSalesReport = async (req, res) => {
  try {
    const { merchantId, timeFilter = 'today', startDate, endDate } = req.query;

    console.log('🟡 Merchant Sales Report Request:', { merchantId, timeFilter });

    if (!merchantId) {
      return res.status(400).json({ message: 'Merchant ID is required' });
    }

    let matchQuery = {
      merchantId: merchantId
    };

    const dateRange = getDateRange(timeFilter, startDate, endDate);
    if (Object.keys(dateRange).length > 0) {
      matchQuery.createdAt = dateRange.createdAt;
    }

    console.log('🔍 Sales Report Match Query:', JSON.stringify(matchQuery, null, 2));

    const salesReport = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt"
              }
            }
          },
          totalIncome: {
            $sum: {
              $cond: [{ $eq: ["$status", "SUCCESS"] }, { $ifNull: ["$amount", 0] }, 0]
            }
          },
          totalCostOfSales: {
            $sum: {
              $cond: [{ $eq: ["$status", "FAILED"] }, { $ifNull: ["$amount", 0] }, 0]
            }
          },
          totalRefundAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", "REFUNDED"] }, { $ifNull: ["$amount", 0] }, 0]
            }
          },
          totalPendingAmount: {
            $sum: {
              $cond: [{ $in: ["$status", ["PENDING", "INITIATED", "CREATED"]] }, { $ifNull: ["$amount", 0] }, 0]
            }
          },
          successCount: {
            $sum: { $cond: [{ $eq: ["$status", "SUCCESS"] }, 1, 0] }
          },
          failedCount: {
            $sum: { $cond: [{ $eq: ["$status", "FAILED"] }, 1, 0] }
          },
          pendingCount: {
            $sum: { $cond: [{ $in: ["$status", ["PENDING", "INITIATED", "CREATED"]] }, 1, 0] }
          },
          refundCount: {
            $sum: { $cond: [{ $eq: ["$status", "REFUNDED"] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          _id: 0,
          date: "$_id.date",
          totalIncome: 1,
          totalCostOfSales: 1,
          totalRefundAmount: 1,
          totalPendingAmount: 1,
          successCount: 1,
          failedCount: 1,
          pendingCount: 1,
          refundCount: 1
        }
      },
      { $sort: { date: 1 } }
    ]);

    console.log(`✅ Sales report fetched: ${salesReport.length} entries`);
    
    // Fill missing dates
    let filledReport = fillMissingDates(salesReport, timeFilter);
    
    res.status(200).json(filledReport);

  } catch (error) {
    console.error('❌ Sales Report Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ✅ ADDED: Get current merchant info
export const getCurrentMerchant = async (req, res) => {
  try {
    const { merchantId } = req.query;

    if (!merchantId) {
      return res.status(400).json({ message: 'Merchant ID is required' });
    }

    const merchant = await User.findById(merchantId)
      .select('_id firstname lastname company email contact role status');

    if (!merchant) {
      return res.status(404).json({ message: 'Merchant not found' });
    }

    res.status(200).json(merchant);
  } catch (error) {
    console.error('❌ Error fetching merchant:', error);
    res.status(500).json({
      message: 'Server Error',
      error: error.message
    });
  }
};

// ✅ ADDED: Debug endpoint to check ALL data
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

// Helper function to fill missing dates
const fillMissingDates = (existingData, timeFilter) => {
  const now = new Date();
  const result = [];
  let daysToShow = 1;
  
  if (timeFilter === 'this_week') daysToShow = 7;
  else if (timeFilter === 'this_month') daysToShow = 30;
  else if (timeFilter === 'last_month') daysToShow = 30;
  else if (timeFilter === 'today') daysToShow = 1;
  else if (timeFilter === 'yesterday') daysToShow = 1;
  
  for (let i = daysToShow - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const dateString = date.toISOString().split('T')[0];
    
    const existing = existingData.find(item => item.date === dateString);
    
    if (existing) {
      result.push(existing);
    } else {
      result.push({
        date: dateString,
        totalIncome: 0,
        totalCostOfSales: 0,
        totalRefundAmount: 0,
        totalPendingAmount: 0,
        successCount: 0,
        failedCount: 0,
        pendingCount: 0,
        refundCount: 0
      });
    }
  }
  
  return result;
};