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

// ✅ IMPROVED: Merchant Analytics with better debugging
export const getMerchantAnalytics = async (req, res) => {
  try {
    const { merchantId, timeFilter = 'today', startDate, endDate } = req.query;

    console.log('🟡 Merchant Analytics Request:', { merchantId, timeFilter });

    if (!merchantId) {
      return res.status(400).json({ message: 'Merchant ID is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(merchantId)) {
      return res.status(400).json({ message: 'Invalid merchant ID format' });
    }

    const objectId = new mongoose.Types.ObjectId(merchantId);
    
    let matchQuery = {
      merchantId: objectId
    };

    const dateRange = getDateRange(timeFilter, startDate, endDate);
    if (Object.keys(dateRange).length > 0) {
      matchQuery.createdAt = dateRange.createdAt;
    }

    console.log('🔍 Merchant Analytics Match Query:', JSON.stringify(matchQuery, null, 2));

    // 🔍 DEBUG: Check what transactions actually exist
    const debugTransactions = await Transaction.find(matchQuery).select('status amount createdAt').lean();
    console.log('🔍 DEBUG - Found transactions:', debugTransactions.length);
    console.log('🔍 DEBUG - Transaction statuses:', debugTransactions.map(t => ({ status: t.status, amount: t.amount })));

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

    // ✅ REMOVED MOCK DATA - Only return real data
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

    console.log('✅ Merchant Analytics Result (REAL DATA):', result);
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

// ✅ IMPROVED: Merchant Transactions with better status handling
export const getMerchantTransactions = async (req, res) => {
  try {
    const { merchantId, status, timeFilter = 'today', page = 1, limit = 10, startDate, endDate } = req.query;

    console.log('🟡 Merchant Transactions Request:', { merchantId, status, timeFilter });

    if (!merchantId) {
      return res.status(400).json({ message: 'Merchant ID is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(merchantId)) {
      return res.status(400).json({ message: 'Invalid merchant ID format' });
    }

    const objectId = new mongoose.Types.ObjectId(merchantId);
    
    let matchQuery = {
      merchantId: objectId
    };

    // ✅ IMPROVED: Better status mapping
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

    console.log(`✅ Found ${transactions.length} REAL transactions for merchant`);
    console.log('🔍 Sample transaction:', transactions.length > 0 ? transactions[0] : 'No transactions');

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

// ✅ IMPROVED: Merchant Sales Report with better debugging
export const getMerchantSalesReport = async (req, res) => {
  try {
    const { merchantId, timeFilter = 'today', startDate, endDate } = req.query;

    console.log('🟡 Merchant Sales Report Request:', { merchantId, timeFilter });

    if (!merchantId) {
      return res.status(400).json({ message: 'Merchant ID is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(merchantId)) {
      return res.status(400).json({ message: 'Invalid merchant ID format' });
    }

    const objectId = new mongoose.Types.ObjectId(merchantId);
    
    let matchQuery = {
      merchantId: objectId
    };

    const dateRange = getDateRange(timeFilter, startDate, endDate);
    if (Object.keys(dateRange).length > 0) {
      matchQuery.createdAt = dateRange.createdAt;
    }

    console.log('🔍 Merchant Sales Report Match Query:', JSON.stringify(matchQuery, null, 2));

    // 🔍 DEBUG: Check transactions for sales report
    const debugSalesTransactions = await Transaction.find(matchQuery).select('status amount createdAt').lean();
    console.log('🔍 DEBUG - Sales report transactions:', debugSalesTransactions.length);

    const salesReport = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" }
          },
          totalIncome: {
            $sum: {
              $cond: [{ $eq: ["$status", "SUCCESS"] }, "$amount", 0]
            }
          },
          totalCostOfSales: {
            $sum: {
              $cond: [{ $eq: ["$status", "FAILED"] }, "$amount", 0]
            }
          },
          totalRefundAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", "REFUNDED"] }, "$amount", 0]
            }
          },
          totalPendingAmount: {
            $sum: {
              $cond: [{ $in: ["$status", ["PENDING", "INITIATED", "CREATED"]] }, "$amount", 0]
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
          date: {
            $dateFromParts: {
              year: "$_id.year",
              month: "$_id.month",
              day: "$_id.day"
            }
          },
          totalIncome: { $ifNull: ["$totalIncome", 0] },
          totalCostOfSales: { $ifNull: ["$totalCostOfSales", 0] },
          totalRefundAmount: { $ifNull: ["$totalRefundAmount", 0] },
          totalPendingAmount: { $ifNull: ["$totalPendingAmount", 0] },
          successCount: 1,
          failedCount: 1,
          pendingCount: 1,
          refundCount: 1
        }
      },
      { $sort: { date: 1 } }
    ]);

    console.log(`✅ Merchant sales report fetched: ${salesReport.length} REAL entries`);
    console.log('🔍 Sales report data:', salesReport);
    
    // Fill missing dates with zeros
    let filledReport = fillMissingDates(salesReport, timeFilter);
    
    res.status(200).json(filledReport);

  } catch (error) {
    console.error('❌ Merchant Sales Report Error:', error);
    
    res.status(500).json({
      message: 'Failed to fetch sales report',
      error: error.message
    });
  }
};

// Helper function to fill missing dates with zeros
const fillMissingDates = (existingData, timeFilter) => {
  const now = new Date();
  const result = [];
  let daysToShow = 7; // Default for this_week
  
  if (timeFilter === 'this_month') daysToShow = 30;
  else if (timeFilter === 'last_month') daysToShow = 30;
  else if (timeFilter === 'this_week') daysToShow = 7;
  else if (timeFilter === 'today') daysToShow = 1;
  else if (timeFilter === 'yesterday') daysToShow = 1;
  
  for (let i = daysToShow - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    date.setHours(0, 0, 0, 0);
    
    const existing = existingData.find(item => {
      const itemDate = new Date(item.date);
      return itemDate.toDateString() === date.toDateString();
    });
    
    if (existing) {
      result.push(existing);
    } else {
      result.push({
        date: date.toISOString(),
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

// Get current merchant info
export const getCurrentMerchant = async (req, res) => {
  try {
    const { merchantId } = req.query;

    if (!merchantId) {
      return res.status(400).json({ message: 'Merchant ID is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(merchantId)) {
      return res.status(400).json({ message: 'Invalid merchant ID format' });
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

// ✅ IMPROVED: Enhanced debug endpoint
export const debugMerchantData = async (req, res) => {
  try {
    const { merchantId } = req.query;

    console.log('🔍 Debugging merchant data for:', merchantId);

    if (!merchantId) {
      return res.status(400).json({ message: 'Merchant ID is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(merchantId)) {
      return res.status(400).json({ message: 'Invalid merchant ID format' });
    }

    const objectId = new mongoose.Types.ObjectId(merchantId);

    // Check if merchant exists in User collection
    const merchantUser = await User.findById(objectId);
    console.log('🔍 Merchant User:', merchantUser);

    // Check ALL transactions for this merchant (no date filter)
    const allTransactions = await Transaction.find({ merchantId: objectId });
    console.log('🔍 ALL Transactions count (no date filter):', allTransactions.length);
    
    // Check today's transactions specifically
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayTransactions = await Transaction.find({ 
      merchantId: objectId,
      createdAt: { $gte: today, $lt: tomorrow }
    });
    console.log('🔍 TODAY\'S Transactions count:', todayTransactions.length);
    console.log('🔍 TODAY\'S Transactions details:', todayTransactions.map(t => ({
      status: t.status,
      amount: t.amount,
      createdAt: t.createdAt
    })));

    // Check transaction status distribution
    const statusCounts = await Transaction.aggregate([
      { $match: { merchantId: objectId } },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);
    console.log('🔍 Transaction status distribution:', statusCounts);

    res.status(200).json({
      merchant: merchantUser,
      allTransactionsCount: allTransactions.length,
      todayTransactionsCount: todayTransactions.length,
      todayTransactions: todayTransactions,
      statusDistribution: statusCounts,
      merchantIdUsed: objectId.toString()
    });

  } catch (error) {
    console.error('❌ Debug error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ✅ NEW: Health check endpoint for transactions
export const healthCheck = async (req, res) => {
  try {
    const { merchantId } = req.query;
    
    const totalTransactions = await Transaction.countDocuments();
    const totalMerchants = await User.countDocuments({ role: 'merchant' });
    
    let merchantStats = {};
    if (merchantId && mongoose.Types.ObjectId.isValid(merchantId)) {
      const objectId = new mongoose.Types.ObjectId(merchantId);
      merchantStats = {
        totalTransactions: await Transaction.countDocuments({ merchantId: objectId }),
        todayTransactions: await Transaction.countDocuments({ 
          merchantId: objectId,
          createdAt: { 
            $gte: new Date(new Date().setHours(0, 0, 0, 0)) 
          }
        })
      };
    }

    res.status(200).json({
      status: 'healthy',
      database: {
        totalTransactions,
        totalMerchants
      },
      merchant: merchantStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Health check error:', error);
    res.status(500).json({ 
      status: 'error',
      error: error.message 
    });
  }
};