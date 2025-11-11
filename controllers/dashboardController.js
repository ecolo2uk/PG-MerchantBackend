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

// Merchant Analytics
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

    const analytics = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalSuccessAmount: {
            $sum: { 
              $cond: [{ $in: ["$status", ["Success", "SUCCESS", "success"]] }, "$amount", 0] 
            }
          },
          totalFailedAmount: {
            $sum: { 
              $cond: [{ $in: ["$status", ["Failed", "FAILED", "failed"]] }, "$amount", 0] 
            }
          },
          totalPendingAmount: {
            $sum: { 
              $cond: [{ $in: ["$status", ["Pending", "PENDING", "pending"]] }, "$amount", 0] 
            }
          },
          totalRefundAmount: {
            $sum: { 
              $cond: [{ $in: ["$status", ["Refund", "REFUND", "refund"]] }, "$amount", 0] 
            }
          },
          totalSuccessOrders: {
            $sum: { 
              $cond: [{ $in: ["$status", ["Success", "SUCCESS", "success"]] }, 1, 0] 
            }
          },
          totalFailedOrders: {
            $sum: { 
              $cond: [{ $in: ["$status", ["Failed", "FAILED", "failed"]] }, 1, 0] 
            }
          },
          totalPendingOrders: {
            $sum: { 
              $cond: [{ $in: ["$status", ["Pending", "PENDING", "pending"]] }, 1, 0] 
            }
          },
          totalRefundOrders: {
            $sum: { 
              $cond: [{ $in: ["$status", ["Refund", "REFUND", "refund"]] }, 1, 0] 
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

    console.log('✅ Merchant Analytics Result:', result);
    res.status(200).json(result);

  } catch (error) {
    console.error('❌ Merchant Analytics Error:', error);
    res.status(500).json({
      message: 'Server Error',
      error: error.message
    });
  }
};

// Merchant Transactions
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

    if (status && status !== 'all') {
      const statusMapping = {
        'SUCCESS': ['Success', 'SUCCESS', 'success'],
        'PENDING': ['Pending', 'PENDING', 'pending'],
        'FAILED': ['Failed', 'FAILED', 'failed'],
        'REFUND': ['Refund', 'REFUND', 'refund']
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

    const transactions = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: 'users',
          localField: 'merchantId',
          foreignField: '_id',
          as: 'merchantInfo'
        }
      },
      {
        $unwind: {
          path: '$merchantInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          transactionId: 1,
          merchantOrderId: 1,
          amount: 1,
          status: 1,
          currency: 1,
          createdAt: 1,
          updatedAt: 1,
          merchantName: {
            $cond: {
              if: { 
                $and: [
                  "$merchantInfo",
                  "$merchantInfo.company",
                  { $ne: ["$merchantInfo.company", ""] }
                ]
              },
              then: "$merchantInfo.company",
              else: {
                $cond: {
                  if: { 
                    $and: [
                      "$merchantInfo",
                      "$merchantInfo.firstname", 
                      "$merchantInfo.lastname"
                    ]
                  },
                  then: { $concat: ["$merchantInfo.firstname", " ", "$merchantInfo.lastname"] },
                  else: "Unknown Merchant"
                }
              }
            }
          }
        }
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) }
    ]);

    const totalDocs = await Transaction.countDocuments(matchQuery);

    console.log(`✅ Found ${transactions.length} transactions for merchant`);

    res.status(200).json({
      docs: transactions,
      totalDocs,
      limit: parseInt(limit),
      page: parseInt(page),
      totalPages: Math.ceil(totalDocs / parseInt(limit)),
      hasNextPage: page * limit < totalDocs,
      hasPrevPage: page > 1
    });

  } catch (error) {
    console.error('❌ Merchant Transactions Error:', error);
    res.status(500).json({ 
      message: 'Server Error', 
      error: error.message
    });
  }
};

// Merchant Sales Report
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
              $cond: [{ $in: ["$status", ["Success", "SUCCESS", "success"]] }, "$amount", 0]
            }
          },
          totalCostOfSales: {
            $sum: {
              $cond: [{ $in: ["$status", ["Failed", "FAILED", "failed"]] }, "$amount", 0]
            }
          },
          totalRefundAmount: {
            $sum: {
              $cond: [{ $in: ["$status", ["Refund", "REFUND", "refund"]] }, "$amount", 0]
            }
          },
          totalPendingAmount: {
            $sum: {
              $cond: [{ $in: ["$status", ["Pending", "PENDING", "pending"]] }, "$amount", 0]
            }
          },
          successCount: {
            $sum: { $cond: [{ $in: ["$status", ["Success", "SUCCESS", "success"]] }, 1, 0] }
          },
          failedCount: {
            $sum: { $cond: [{ $in: ["$status", ["Failed", "FAILED", "failed"]] }, 1, 0] }
          },
          pendingCount: {
            $sum: { $cond: [{ $in: ["$status", ["Pending", "PENDING", "pending"]] }, 1, 0] }
          },
          refundCount: {
            $sum: { $cond: [{ $in: ["$status", ["Refund", "REFUND", "refund"]] }, 1, 0] }
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

    console.log(`✅ Merchant sales report fetched: ${salesReport.length} entries`);
    
    // Fill missing dates
    const filledReport = fillMissingDates(salesReport, timeFilter);
    res.status(200).json(filledReport);

  } catch (error) {
    console.error('❌ Merchant Sales Report Error:', error);
    res.status(500).json({
      message: 'Server Error',
      error: error.message
    });
  }
};

// Helper function to fill missing dates
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

// Debug endpoint to check merchant data
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

    // Check transactions for this merchant
    const transactions = await Transaction.find({ merchantId: objectId });
    console.log('🔍 Transactions count:', transactions.length);
    
    // Check first few transactions
    const sampleTransactions = await Transaction.find({ merchantId: objectId }).limit(5);
    console.log('🔍 Sample Transactions:', sampleTransactions);

    // Check all transactions regardless of merchant
    const allTransactionsCount = await Transaction.countDocuments();
    console.log('🔍 All transactions in database:', allTransactionsCount);

    res.status(200).json({
      merchant: merchantUser,
      transactionsCount: transactions.length,
      sampleTransactions: sampleTransactions,
      allTransactionsCount: allTransactionsCount,
      merchantIdUsed: objectId
    });

  } catch (error) {
    console.error('❌ Debug error:', error);
    res.status(500).json({ error: error.message });
  }
};