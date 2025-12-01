





// controllers/merchantDashboardController.js
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

// ✅ Get merchant analytics - ONLY REAL DATA
export const getMerchantAnalytics = async (req, res) => {
  try {
    const { merchantId, timeFilter = 'today', startDate, endDate } = req.query;

    console.log('🟡 Merchant Analytics Request:', { merchantId, timeFilter });

    if (!merchantId) {
      return res.status(400).json({ message: 'Merchant ID is required' });
    }

    // ✅ FIXED: Handle both ObjectId and string formats
    let matchQuery = {
      $or: [
        // Try as ObjectId
        { merchantId: new mongoose.Types.ObjectId(merchantId) },
        // Try as string
        { merchantId: merchantId }
      ]
    };

    // Apply date filter
    const dateRange = getDateRange(timeFilter, startDate, endDate);
    if (Object.keys(dateRange).length > 0) {
      // Apply date filter to both OR conditions
      matchQuery = {
        $and: [
          { $or: matchQuery.$or },
          { createdAt: dateRange.createdAt }
        ]
      };
    }

    console.log('🔍 Merchant Analytics Match Query:', JSON.stringify(matchQuery, null, 2));

    // Check how many documents match
    const totalMatches = await Transaction.countDocuments(matchQuery);
    console.log(`📊 Total matches found: ${totalMatches}`);

    if (totalMatches === 0) {
      console.log('⚠️ No transactions found for this merchant/date range');
      
      // Return zero data with informative message
      return res.status(200).json({
        totalSuccessAmount: 0,
        totalFailedAmount: 0,
        totalPendingAmount: 0,
        totalRefundAmount: 0,
        totalSuccessOrders: 0,
        totalFailedOrders: 0,
        totalPendingOrders: 0,
        totalRefundOrders: 0,
        totalTransactions: 0,
        message: `No transactions found for merchant ${merchantId} in selected period`,
        isDataFound: false
      });
    }

    // Rest of your aggregation logic remains same...
    // Enhanced aggregation for unified schema
    const analytics = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $addFields: {
          unifiedAmount: {
            $cond: {
              if: { $ne: ["$amount", undefined] },
              then: "$amount",
              else: { $ifNull: ["$Amount", 0] }
            }
          },
          unifiedStatus: {
            $cond: {
              if: { $ne: ["$status", undefined] },
              then: { 
                $switch: {
                  branches: [
                    { case: { $eq: [{ $toUpper: { $trim: { input: "$status" } } }, "INITIATED"] }, then: "PENDING" },
                    { case: { $regexMatch: { input: { $toUpper: { $trim: { input: "$status" } } }, regex: /INITIATED/i } }, then: "PENDING" },
                    { case: { $regexMatch: { input: { $toUpper: { $trim: { input: "$status" } } }, regex: /SUCCESS/i } }, then: "SUCCESS" },
                    { case: { $regexMatch: { input: { $toUpper: { $trim: { input: "$status" } } }, regex: /FAIL/i } }, then: "FAILED" },
                    { case: { $regexMatch: { input: { $toUpper: { $trim: { input: "$status" } } }, regex: /PENDING/i } }, then: "PENDING" },
                    { case: { $regexMatch: { input: { $toUpper: { $trim: { input: "$status" } } }, regex: /REFUND/i } }, then: "REFUND" }
                  ],
                  default: { $toUpper: { $trim: { input: "$status" } } }
                }
              },
              else: { 
                $cond: {
                  if: { $ne: ["$Transaction Status", undefined] },
                  then: { 
                    $switch: {
                      branches: [
                        { case: { $eq: [{ $toUpper: { $trim: { input: "$Transaction Status" } } }, "INITIATED"] }, then: "PENDING" },
                        { case: { $regexMatch: { input: { $toUpper: { $trim: { input: "$Transaction Status" } } }, regex: /INITIATED/i } }, then: "PENDING" }
                      ],
                      default: { $toUpper: { $trim: { input: "$Transaction Status" } } }
                    }
                  },
                  else: "UNKNOWN"
                }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          totalSuccessAmount: {
            $sum: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ["$unifiedStatus", "SUCCESS"] },
                    { $eq: ["$unifiedStatus", "SUCCESSFUL"] },
                    { $eq: ["$unifiedStatus", "COMPLETED"] },
                    { $regexMatch: { input: "$unifiedStatus", regex: /SUCCESS/i } }
                  ]
                },
                then: "$unifiedAmount",
                else: 0
              }
            }
          },
          totalFailedAmount: {
            $sum: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ["$unifiedStatus", "FAILED"] },
                    { $eq: ["$unifiedStatus", "FAILURE"] },
                    { $eq: ["$unifiedStatus", "FALLED"] },
                    { $eq: ["$unifiedStatus", "REJECTED"] },
                    { $regexMatch: { input: "$unifiedStatus", regex: /FAIL/i } }
                  ]
                },
                then: "$unifiedAmount",
                else: 0
              }
            }
          },
          totalPendingAmount: {
            $sum: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ["$unifiedStatus", "PENDING"] },
                    { $eq: ["$unifiedStatus", "INITIATED"] },
                    { $eq: ["$unifiedStatus", "GENERATED"] },
                    { $eq: ["$unifiedStatus", "PROCESSING"] },
                    { $regexMatch: { input: "$unifiedStatus", regex: /PENDING/i } }
                  ]
                },
                then: "$unifiedAmount",
                else: 0
              }
            }
          },
          totalRefundAmount: {
            $sum: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ["$unifiedStatus", "REFUND"] },
                    { $eq: ["$unifiedStatus", "REFUNDED"] },
                    { $eq: ["$unifiedStatus", "CANCELLED"] },
                    { $regexMatch: { input: "$unifiedStatus", regex: /REFUND/i } }
                  ]
                },
                then: "$unifiedAmount",
                else: 0
              }
            }
          },
          totalSuccessOrders: {
            $sum: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ["$unifiedStatus", "SUCCESS"] },
                    { $eq: ["$unifiedStatus", "SUCCESSFUL"] },
                    { $eq: ["$unifiedStatus", "COMPLETED"] },
                    { $regexMatch: { input: "$unifiedStatus", regex: /SUCCESS/i } }
                  ]
                },
                then: 1,
                else: 0
              }
            }
          },
          totalFailedOrders: {
            $sum: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ["$unifiedStatus", "FAILED"] },
                    { $eq: ["$unifiedStatus", "FAILURE"] },
                    { $eq: ["$unifiedStatus", "FALLED"] },
                    { $eq: ["$unifiedStatus", "REJECTED"] },
                    { $regexMatch: { input: "$unifiedStatus", regex: /FAIL/i } }
                  ]
                },
                then: 1,
                else: 0
              }
            }
          },
          totalPendingOrders: {
            $sum: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ["$unifiedStatus", "PENDING"] },
                    { $eq: ["$unifiedStatus", "INITIATED"] },
                    { $eq: ["$unifiedStatus", "GENERATED"] },
                    { $eq: ["$unifiedStatus", "PROCESSING"] },
                    { $regexMatch: { input: "$unifiedStatus", regex: /PENDING/i } }
                  ]
                },
                then: 1,
                else: 0
              }
            }
          },
          totalRefundOrders: {
            $sum: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ["$unifiedStatus", "REFUND"] },
                    { $eq: ["$unifiedStatus", "REFUNDED"] },
                    { $eq: ["$unifiedStatus", "CANCELLED"] },
                    { $regexMatch: { input: "$unifiedStatus", regex: /REFUND/i } }
                  ]
                },
                then: 1,
                else: 0
              }
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

    delete result._id;
    
    // Add debug info
    result.debugInfo = {
      merchantId: merchantId,
      timeFilter: timeFilter,
      totalMatches: totalMatches,
      queryUsed: matchQuery
    };

    console.log('✅ Merchant Analytics Result:', result);
    
    res.status(200).json(result);

  } catch (error) {
    console.error('❌ Merchant Analytics Error:', error);
    
    // Return zero data on error
    const zeroData = {
      totalSuccessAmount: 0,
      totalFailedAmount: 0,
      totalPendingAmount: 0,
      totalRefundAmount: 0,
      totalSuccessOrders: 0,
      totalFailedOrders: 0,
      totalPendingOrders: 0,
      totalRefundOrders: 0,
      totalTransactions: 0,
      isError: true,
      error: error.message
    };
    
    res.status(500).json(zeroData);
  }
};

// Get merchant sales report - ONLY REAL DATA
export const getMerchantSalesReport = async (req, res) => {
  try {
    const { merchantId, timeFilter = 'today', startDate, endDate } = req.query;

    console.log('🟡 Merchant Sales Report Request:', { merchantId, timeFilter });

    if (!merchantId) {
      return res.status(400).json({ message: 'Merchant ID is required' });
    }

    let matchQuery = {};

    if (mongoose.Types.ObjectId.isValid(merchantId)) {
      matchQuery.merchantId = new mongoose.Types.ObjectId(merchantId);
    } else {
      matchQuery.merchantId = merchantId;
    }

    const dateRange = getDateRange(timeFilter, startDate, endDate);
    if (Object.keys(dateRange).length > 0) {
      matchQuery.createdAt = dateRange.createdAt;
    }

    console.log('🔍 Merchant Sales Report Match Query:', JSON.stringify(matchQuery, null, 2));

    // Enhanced aggregation for merchant data
    const salesReport = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $addFields: {
          unifiedAmount: {
            $cond: {
              if: { $ne: ["$amount", undefined] },
              then: "$amount",
              else: { $ifNull: ["$Amount", 0] }
            }
          },
          unifiedStatus: {
            $cond: {
              if: { $ne: ["$status", undefined] },
              then: { $toUpper: { $trim: { input: "$status" } } },
              else: { 
                $cond: {
                  if: { $ne: ["$Transaction Status", undefined] },
                  then: { $toUpper: { $trim: { input: "$Transaction Status" } } },
                  else: "UNKNOWN"
                }
              }
            }
          }
        }
      },
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
          successCount: {
            $sum: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ["$unifiedStatus", "SUCCESS"] },
                    { $eq: ["$unifiedStatus", "SUCCESSFUL"] },
                    { $eq: ["$unifiedStatus", "COMPLETED"] },
                    { $regexMatch: { input: "$unifiedStatus", regex: /SUCCESS/i } }
                  ]
                },
                then: 1,
                else: 0
              }
            }
          },
          failedCount: {
            $sum: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ["$unifiedStatus", "FAILED"] },
                    { $eq: ["$unifiedStatus", "FAILURE"] },
                    { $eq: ["$unifiedStatus", "FALLED"] },
                    { $eq: ["$unifiedStatus", "REJECTED"] },
                    { $regexMatch: { input: "$unifiedStatus", regex: /FAIL/i } }
                  ]
                },
                then: 1,
                else: 0
              }
            }
          },
          pendingCount: {
            $sum: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ["$unifiedStatus", "PENDING"] },
                    { $eq: ["$unifiedStatus", "INITIATED"] },
                    { $eq: ["$unifiedStatus", "GENERATED"] },
                    { $eq: ["$unifiedStatus", "PROCESSING"] },
                    { $regexMatch: { input: "$unifiedStatus", regex: /PENDING/i } }
                  ]
                },
                then: 1,
                else: 0
              }
            }
          },
          refundCount: {
            $sum: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ["$unifiedStatus", "REFUND"] },
                    { $eq: ["$unifiedStatus", "REFUNDED"] },
                    { $eq: ["$unifiedStatus", "CANCELLED"] },
                    { $regexMatch: { input: "$unifiedStatus", regex: /REFUND/i } }
                  ]
                },
                then: 1,
                else: 0
              }
            }
          },
          totalIncome: {
            $sum: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ["$unifiedStatus", "SUCCESS"] },
                    { $eq: ["$unifiedStatus", "SUCCESSFUL"] },
                    { $eq: ["$unifiedStatus", "COMPLETED"] },
                    { $regexMatch: { input: "$unifiedStatus", regex: /SUCCESS/i } }
                  ]
                },
                then: "$unifiedAmount",
                else: 0
              }
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          date: "$_id.date",
          successCount: 1,
          failedCount: 1,
          pendingCount: 1,
          refundCount: 1,
          totalIncome: 1
        }
      },
      { $sort: { date: 1 } }
    ]);

    console.log(`✅ Merchant sales report processed: ${salesReport.length} days`);

    // Fill missing dates with zeros (NO SAMPLE DATA)
    let filledReport = salesReport;
    if (salesReport.length === 0) {
      console.log('📊 No transactions found for this period');
      filledReport = fillMissingDatesWithZeros(timeFilter, startDate, endDate);
    }
    
    res.status(200).json(filledReport);

  } catch (error) {
    console.error('❌ Sales Report Error:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};



export const getCurrentMerchantAnalytics = async (req, res) => {
  try {
    const { merchantId, timeFilter = 'today', startDate, endDate } = req.query;

    console.log('🟡 Current Merchant Analytics Request for merchant:', merchantId);

    if (!merchantId) {
      return res.status(400).json({ message: 'Merchant ID is required' });
    }

    // ✅ Handle both ObjectId and string formats
    let matchQuery = {
      $or: [
        { merchantId: new mongoose.Types.ObjectId(merchantId) },
        { merchantId: merchantId }
      ]
    };

    // Apply date filter
    const dateRange = getDateRange(timeFilter, startDate, endDate);
    if (Object.keys(dateRange).length > 0) {
      matchQuery = {
        $and: [
          { $or: matchQuery.$or },
          { createdAt: dateRange.createdAt }
        ]
      };
    }

    console.log('🔍 Current Merchant Analytics Match Query:', JSON.stringify(matchQuery, null, 2));

    // First check if any transactions exist
    const transactionCount = await Transaction.countDocuments(matchQuery);
    console.log(`📊 Total transactions found: ${transactionCount}`);

    if (transactionCount === 0) {
      console.log('⚠️ No transactions found for this merchant');
      
      return res.status(200).json({
        totalSuccessAmount: 0,
        totalFailedAmount: 0,
        totalPendingAmount: 0,
        totalRefundAmount: 0,
        totalSuccessOrders: 0,
        totalFailedOrders: 0,
        totalPendingOrders: 0,
        totalRefundOrders: 0,
        totalTransactions: 0,
        message: 'No transactions found for this merchant',
        merchantId: merchantId,
        suggestion: 'Create transactions through payment gateway'
      });
    }

    // Get sample transactions to check statuses
    const sampleTransactions = await Transaction.find(matchQuery).limit(5);
    const statuses = [...new Set(sampleTransactions.map(t => t.status))];
    console.log('📊 Statuses found:', statuses);

    // Enhanced aggregation for unified schema
    const analytics = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $addFields: {
          unifiedAmount: {
            $cond: {
              if: { $ne: ["$amount", undefined] },
              then: "$amount",
              else: { $ifNull: ["$Amount", 0] }
            }
          },
          unifiedStatus: {
            $cond: {
              if: { $ne: ["$status", undefined] },
              then: { 
                $switch: {
                  branches: [
                    { case: { $eq: [{ $toUpper: { $trim: { input: "$status" } } }, "INITIATED"] }, then: "PENDING" },
                    { case: { $regexMatch: { input: { $toUpper: { $trim: { input: "$status" } } }, regex: /INITIATED/i } }, then: "PENDING" },
                    { case: { $regexMatch: { input: { $toUpper: { $trim: { input: "$status" } } }, regex: /SUCCESS/i } }, then: "SUCCESS" },
                    { case: { $regexMatch: { input: { $toUpper: { $trim: { input: "$status" } } }, regex: /FAIL/i } }, then: "FAILED" },
                    { case: { $regexMatch: { input: { $toUpper: { $trim: { input: "$status" } } }, regex: /PENDING/i } }, then: "PENDING" },
                    { case: { $regexMatch: { input: { $toUpper: { $trim: { input: "$status" } } }, regex: /REFUND/i } }, then: "REFUND" }
                  ],
                  default: { $toUpper: { $trim: { input: "$status" } } }
                }
              },
              else: { 
                $cond: {
                  if: { $ne: ["$Transaction Status", undefined] },
                  then: { 
                    $switch: {
                      branches: [
                        { case: { $eq: [{ $toUpper: { $trim: { input: "$Transaction Status" } } }, "INITIATED"] }, then: "PENDING" },
                        { case: { $regexMatch: { input: { $toUpper: { $trim: { input: "$Transaction Status" } } }, regex: /INITIATED/i } }, then: "PENDING" }
                      ],
                      default: { $toUpper: { $trim: { input: "$Transaction Status" } } }
                    }
                  },
                  else: "UNKNOWN"
                }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          totalSuccessAmount: {
            $sum: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ["$unifiedStatus", "SUCCESS"] },
                    { $regexMatch: { input: "$unifiedStatus", regex: /SUCCESS/i } }
                  ]
                },
                then: "$unifiedAmount",
                else: 0
              }
            }
          },
          totalFailedAmount: {
            $sum: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ["$unifiedStatus", "FAILED"] },
                    { $regexMatch: { input: "$unifiedStatus", regex: /FAIL/i } }
                  ]
                },
                then: "$unifiedAmount",
                else: 0
              }
            }
          },
          totalPendingAmount: {
            $sum: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ["$unifiedStatus", "PENDING"] },
                    { $eq: ["$unifiedStatus", "INITIATED"] },
                    { $regexMatch: { input: "$unifiedStatus", regex: /PENDING/i } }
                  ]
                },
                then: "$unifiedAmount",
                else: 0
              }
            }
          },
          totalRefundAmount: {
            $sum: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ["$unifiedStatus", "REFUND"] },
                    { $regexMatch: { input: "$unifiedStatus", regex: /REFUND/i } }
                  ]
                },
                then: "$unifiedAmount",
                else: 0
              }
            }
          },
          totalSuccessOrders: {
            $sum: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ["$unifiedStatus", "SUCCESS"] },
                    { $regexMatch: { input: "$unifiedStatus", regex: /SUCCESS/i } }
                  ]
                },
                then: 1,
                else: 0
              }
            }
          },
          totalFailedOrders: {
            $sum: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ["$unifiedStatus", "FAILED"] },
                    { $regexMatch: { input: "$unifiedStatus", regex: /FAIL/i } }
                  ]
                },
                then: 1,
                else: 0
              }
            }
          },
          totalPendingOrders: {
            $sum: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ["$unifiedStatus", "PENDING"] },
                    { $eq: ["$unifiedStatus", "INITIATED"] },
                    { $regexMatch: { input: "$unifiedStatus", regex: /PENDING/i } }
                  ]
                },
                then: 1,
                else: 0
              }
            }
          },
          totalRefundOrders: {
            $sum: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ["$unifiedStatus", "REFUND"] },
                    { $regexMatch: { input: "$unifiedStatus", regex: /REFUND/i } }
                  ]
                },
                then: 1,
                else: 0
              }
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

    delete result._id;

    // Add debug info
    result.merchantId = merchantId;
    result.transactionCount = transactionCount;
    result.statusesFound = statuses;
    
    // Check if all transactions are INITIATED
    if (statuses.length === 1 && statuses[0] === "INITIATED") {
      result.message = "All transactions are in 'INITIATED' status";
      result.suggestion = "Complete the payments to see success/failed analytics";
      // Update pending count to include INITIATED transactions
      result.totalPendingOrders = transactionCount;
    }

    console.log('✅ Current Merchant Analytics Result:', result);
    
    res.status(200).json(result);

  } catch (error) {
    console.error('❌ Current Merchant Analytics Error:', error);
    
    // Return zero data on error
    const zeroData = {
      totalSuccessAmount: 0,
      totalFailedAmount: 0,
      totalPendingAmount: 0,
      totalRefundAmount: 0,
      totalSuccessOrders: 0,
      totalFailedOrders: 0,
      totalPendingOrders: 0,
      totalRefundOrders: 0,
      totalTransactions: 0,
      isError: true,
      error: error.message
    };
    
    res.status(500).json(zeroData);
  }
};

// Helper function to fill missing dates with zeros (NO SAMPLE DATA)
const fillMissingDatesWithZeros = (timeFilter, startDate, endDate) => {
  const now = new Date();
  const result = [];
  let daysToShow = 7;
  
  if (timeFilter === 'today' || timeFilter === 'yesterday') {
    daysToShow = 1;
  } else if (timeFilter === 'this_week') {
    daysToShow = 7;
  } else if (timeFilter === 'this_month' || timeFilter === 'last_month') {
    daysToShow = 30;
  } else if (timeFilter === 'custom' && startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    daysToShow = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  }
  
  for (let i = daysToShow - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const dateString = date.toISOString().split('T')[0];
    
    result.push({
      date: dateString,
      successCount: 0,
      failedCount: 0,
      pendingCount: 0,
      refundCount: 0,
      totalIncome: 0
    });
  }
  
  return result;
};

// Keep other functions as they are...
// Get merchant transactions
export const getMerchantTransactions = async (req, res) => {
  try {
    const { merchantId, status, timeFilter = 'today', page = 1, limit = 10, startDate, endDate } = req.query;

    console.log('🟡 Merchant Transactions Request:', { merchantId, status, timeFilter, page, limit });

    if (!merchantId) {
      return res.status(400).json({ message: 'Merchant ID is required' });
    }

    let matchQuery = {
      merchantId: merchantId
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

    const transactions = await Transaction.find(matchQuery)
      .select('transactionId merchantOrderId amount status currency createdAt updatedAt merchantName customerName customerVPA')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalCount = await Transaction.countDocuments(matchQuery);

    console.log(`✅ Found ${transactions.length} transactions for merchant ${merchantId}`);

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



// Get current merchant info
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
        successCount: 0,
        failedCount: 0,
        pendingCount: 0,
        refundCount: 0
      });
    }
  }
  
  return result;
};

// Backend मध्ये debug endpoint add करा
export const debugMerchantTransactions = async (req, res) => {
  try {
    const { merchantId } = req.query;
    
    console.log('🔍 Debugging merchant transactions for:', merchantId);
    
    // Check transactions with this merchant ID
    const transactions = await Transaction.find({ 
      merchantId: merchantId 
    });
    
    console.log(`📊 Found ${transactions.length} transactions for merchant ${merchantId}`);
    
    // Check ALL transactions to see what merchant IDs exist
    const allTransactions = await Transaction.find().limit(10);
    const merchantIds = [...new Set(allTransactions.map(t => t.merchantId))];
    
    console.log('🔍 All merchant IDs in database:', merchantIds);
    
    res.json({
      merchantId: merchantId,
      transactionsFound: transactions.length,
      transactions: transactions,
      allMerchantIds: merchantIds,
      sampleTransactions: allTransactions.map(t => ({
        _id: t._id,
        merchantId: t.merchantId,
        status: t.status,
        amount: t.amount,
        createdAt: t.createdAt
      }))
    });
    
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getCurrentMerchantTransactions = async (req, res) => {
  try {
    const { 
      merchantId, 
      status, 
      timeFilter = 'today', 
      page = 1, 
      limit = 10, 
      startDate, 
      endDate 
    } = req.query;

    console.log('🟡 Current Merchant Transactions Request:', { 
      merchantId, 
      status, 
      timeFilter,
      page,
      limit
    });

    // Validate merchant ID
    if (!merchantId || merchantId === 'all' || merchantId === 'null') {
      return res.status(400).json({ 
        message: 'Valid merchant ID is required' 
      });
    }

    // Build match query
    let matchQuery = {};

    // ✅ क्रिटिकल: merchantId को filter में जोड़ें
    if (mongoose.Types.ObjectId.isValid(merchantId)) {
      matchQuery.merchantId = new mongoose.Types.ObjectId(merchantId);
      console.log('✅ Merchant ID is valid MongoDB ObjectId');
    } else {
      matchQuery.merchantId = merchantId;
      console.log('ℹ️ Merchant ID is string, using as-is');
    }

    // Status filter
    if (status && status !== 'all') {
      const statusMappings = {
        'SUCCESS': ['SUCCESS', 'Success', 'success', 'SUCCESSFUL', 'successful'],
        'FAILED': ['FAILED', 'Failed', 'failed', 'FAILURE', 'failure', 'REJECTED', 'rejected'],
        'PENDING': ['PENDING', 'Pending', 'pending', 'INITIATED', 'Initiated', 'initiated', 'GENERATED', 'Generated', 'generated'],
        'REFUND': ['REFUND', 'Refund', 'refund', 'REFUNDED', 'refunded']
      };
      
      if (statusMappings[status]) {
        matchQuery.status = { $in: statusMappings[status] };
        console.log(`✅ Filtering by status: ${status}`);
      }
    }

    // Date filter
    const dateRange = getDateRange(timeFilter, startDate, endDate);
    if (Object.keys(dateRange).length > 0) {
      matchQuery.createdAt = dateRange.createdAt;
    }

    console.log('🔍 Final Match Query for current merchant:', JSON.stringify(matchQuery, null, 2));

    // Aggregate for unified schema handling
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const aggregationPipeline = [
      {
        $match: matchQuery
      },
      {
        $addFields: {
          // Unified fields for both schemas
          unifiedAmount: {
            $cond: {
              if: { $ne: ["$amount", undefined] },
              then: "$amount",
              else: { $ifNull: ["$Amount", 0] }
            }
          },
          unifiedStatus: {
            $cond: {
              if: { $ne: ["$status", undefined] },
              then: { $toUpper: { $trim: { input: "$status" } } },
              else: { 
                $cond: {
                  if: { $ne: ["$Transaction Status", undefined] },
                  then: { $toUpper: { $trim: { input: "$Transaction Status" } } },
                  else: "UNKNOWN"
                }
              }
            }
          },
          unifiedTransactionId: {
            $cond: {
              if: { $ne: ["$transactionId", undefined] },
              then: "$transactionId",
              else: { $ifNull: ["$Transaction Reference ID", "N/A"] }
            }
          },
          unifiedMerchantOrderId: {
            $cond: {
              if: { $ne: ["$merchantOrderId", undefined] },
              then: "$merchantOrderId",
              else: { $ifNull: ["$Vendor Ref ID", "N/A"] }
            }
          },
          unifiedCreatedAt: {
            $cond: {
              if: { $ne: ["$createdAt", undefined] },
              then: "$createdAt",
              else: { 
                $cond: {
                  if: { $ne: ["$Transaction Date", undefined] },
                  then: { $dateFromString: { dateString: "$Transaction Date" } },
                  else: new Date()
                }
              }
            }
          },
          unifiedMerchantName: {
            $cond: {
              if: { $ne: ["$merchantName", undefined] },
              then: "$merchantName",
              else: { $ifNull: ["$Merchant Name", "My Business"] }
            }
          }
        }
      },
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
          _id: 1,
          transactionId: "$unifiedTransactionId",
          merchantOrderId: "$unifiedMerchantOrderId",
          amount: "$unifiedAmount",
          status: "$unifiedStatus",
          currency: { $ifNull: ["$currency", "INR"] },
          createdAt: "$unifiedCreatedAt",
          updatedAt: { $ifNull: ["$updatedAt", "$unifiedCreatedAt"] },
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
                  else: "$unifiedMerchantName"
                }
              }
            }
          },
          customerName: { $ifNull: ["$customerName", "$Customer Name", "N/A"] },
          customerVPA: { $ifNull: ["$customerVPA", "$Customer VPA", "N/A"] },
          customerContact: { $ifNull: ["$customerContact", "$Customer Contact No", "N/A"] }
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $skip: skip
      },
      {
        $limit: parseInt(limit)
      }
    ];

    // Execute aggregation
    const transactions = await Transaction.aggregate(aggregationPipeline);

    // Count total documents
    const totalDocsResult = await Transaction.aggregate([
      { $match: matchQuery },
      { $count: "total" }
    ]);
    
    const totalDocs = totalDocsResult.length > 0 ? totalDocsResult[0].total : 0;

    console.log(`✅ Found ${transactions.length} transactions for current merchant ${merchantId}`);

    if (transactions.length > 0) {
      console.log('📊 Sample transaction:', {
        merchantId: merchantId,
        transactionId: transactions[0].transactionId,
        amount: transactions[0].amount,
        status: transactions[0].status,
        date: transactions[0].createdAt
      });
    }

    res.status(200).json({
      docs: transactions,
      totalDocs: totalDocs,
      limit: parseInt(limit),
      page: parseInt(page),
      totalPages: Math.ceil(totalDocs / parseInt(limit)),
      hasNextPage: (parseInt(page) * parseInt(limit)) < totalDocs,
      hasPrevPage: parseInt(page) > 1
    });

  } catch (error) {
    console.error('❌ Error fetching current merchant transactions:', error);
    console.error('🔍 Error stack:', error.stack);
    
    res.status(500).json({
      message: 'Server Error',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Add to controllers/merchantDashboardController.js
export const debugAllTransactions = async (req, res) => {
  try {
    console.log('🔍 Debugging ALL transactions in database');
    
    // Get ALL transactions
    const allTransactions = await Transaction.find({}).limit(50);
    
    // Check what merchant IDs exist
    const allMerchantIds = [...new Set(allTransactions.map(t => t.merchantId?.toString()))];
    
    // Check what field names exist
    const sampleTransaction = allTransactions[0] || {};
    const fieldNames = Object.keys(sampleTransaction._doc || {});
    
    // Check specific merchant's transactions
    const specificMerchantId = "692d18afc7e70c765a6f3292";
    const merchantTransactions = await Transaction.find({ 
      $or: [
        { merchantId: specificMerchantId },
        { merchantId: new mongoose.Types.ObjectId(specificMerchantId) },
        { merchantId: { $regex: specificMerchantId, $options: 'i' } }
      ]
    });
    
    res.json({
      totalTransactions: await Transaction.countDocuments(),
      merchantIdsInDB: allMerchantIds,
      fieldNamesInTransactions: fieldNames,
      merchantTransactionsCount: merchantTransactions.length,
      sampleTransaction: allTransactions.slice(0, 3).map(t => ({
        _id: t._id,
        merchantId: t.merchantId,
        status: t.status,
        amount: t.amount,
        Amount: t.Amount,
        'Transaction Status': t['Transaction Status'],
        createdAt: t.createdAt,
        updatedAt: t.updatedAt
      })),
      merchant692Transactions: merchantTransactions.map(t => ({
        _id: t._id,
        merchantId: t.merchantId,
        status: t.status,
        amount: t.amount,
        Amount: t.Amount,
        createdAt: t.createdAt
      }))
    });
    
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: error.message });
  }
};

// एक debug function add करा dashboardController.js मध्ये
export const checkDatabaseState = async (req, res) => {
  try {
    const { merchantId } = req.query;
    
    console.log('🔍 Checking database state for merchant:', merchantId);
    
    // Check ALL transactions (first 20)
    const allTransactions = await Transaction.find({}).limit(20);
    
    // Count by merchantId type
    let objectIdCount = 0;
    let stringCount = 0;
    let nullCount = 0;
    
    allTransactions.forEach(t => {
      if (!t.merchantId) {
        nullCount++;
      } else if (mongoose.Types.ObjectId.isValid(t.merchantId.toString())) {
        objectIdCount++;
      } else {
        stringCount++;
      }
    });
    
    // Check specific merchant transactions with both formats
    const transactionsAsObjectId = await Transaction.find({
      merchantId: new mongoose.Types.ObjectId(merchantId)
    });
    
    const transactionsAsString = await Transaction.find({
      merchantId: merchantId
    });
    
    res.json({
      totalTransactionsInDB: await Transaction.countDocuments(),
      merchantIdTypesInDB: {
        objectId: objectIdCount,
        string: stringCount,
        null: nullCount
      },
      transactionsForThisMerchant: {
        asObjectId: transactionsAsObjectId.length,
        asString: transactionsAsString.length,
        total: transactionsAsObjectId.length + transactionsAsString.length
      },
      sampleTransactions: allTransactions.slice(0, 3).map(t => ({
        _id: t._id,
        merchantId: t.merchantId,
        merchantIdType: typeof t.merchantId,
        isObjectId: mongoose.Types.ObjectId.isValid(t.merchantId?.toString() || ''),
        status: t.status,
        amount: t.amount
      }))
    });
    
  } catch (error) {
    console.error('Database state check error:', error);
    res.status(500).json({ error: error.message });
  }
};