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
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setDate(now.getDate() + (6 - now.getDay()));
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


// Middleware to protect routes and get merchantId
// This is a placeholder. You should replace it with your actual auth middleware.
const protect = (req, res, next) => {
  // In a real application, you would verify a JWT token and
  // attach the user object (including _id and role) to req.user.
  // For demonstration, let's assume req.user is populated.
  
  // Example: If an admin is logged in, they might not have a merchantId.
  // If a merchant is logged in, req.user._id would be their merchantId.
  
  // For now, we'll let all requests through, but if you pass a merchantId
  // in the query, it will be used. In a real scenario, you'd extract
  // req.user._id for a merchant user.

  // req.user = { _id: '65239a259c02d1a3c6168e36', role: 'merchant' }; // Example merchant user
  // req.user = { _id: '65239a259c02d1a3c6168e35', role: 'admin' }; // Example admin user
  next();
};

// Get All Merchant Users for Filter (Admin Only)
export const getAllMerchants = async (req, res) => {
  try {
    // Only allow this for admin users
    // if (req.user && req.user.role !== 'admin') {
    //   return res.status(403).json({ message: 'Access denied. Admins only.' });
    // }

    const merchants = await User.find({ 
      role: "merchant", 
      status: "Active" 
    })
    .select('_id firstname lastname company email contact')
    .sort({ firstname: 1 });

    console.log('✅ Merchants fetched from User model:', merchants.length);
    res.status(200).json(merchants);
  } catch (error) {
    console.error('❌ Error fetching merchants:', error);
    res.status(500).json({ 
      message: 'Server Error', 
      error: error.message 
    });
  }
};

export const getDashboardAnalytics = async (req, res) => {
  try {
    let { merchantId, timeFilter = 'today', startDate, endDate } = req.query;

    // If a merchant is logged in, override the merchantId from query with their own
    // if (req.user && req.user.role === 'merchant') {
    //   merchantId = req.user._id;
    // }

    console.log('🟡 Fetching analytics with:', { merchantId, timeFilter, startDate, endDate });

    let matchQuery = {};
    
    // Merchant filter with ObjectId conversion
    if (merchantId && merchantId !== 'all') {
      // Ensure merchantId is a valid ObjectId
      if (!mongoose.Types.ObjectId.isValid(merchantId)) {
        return res.status(400).json({ message: 'Invalid merchant ID format.' });
      }
      matchQuery.merchantId = new mongoose.Types.ObjectId(merchantId);
    }

    // Date filter
    if (timeFilter !== 'all') {
      const dateRange = getDateRange(timeFilter, startDate, endDate);
      matchQuery = { ...matchQuery, ...dateRange };
    }

    const analytics = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalSuccessAmount: {
            $sum: { 
              $cond: [{ $in: ["$status", ["Success", "SUCCESS"]] }, "$amount", 0] 
            }
          },
          totalFailedAmount: {
            $sum: { 
              $cond: [{ $in: ["$status", ["Failed", "FAILED"]] }, "$amount", 0] 
            }
          },
          totalPendingAmount: {
            $sum: { 
              $cond: [{ $in: ["$status", ["Pending", "PENDING"]] }, "$amount", 0] 
            }
          },
          totalRefundAmount: {
            $sum: { 
              $cond: [{ $eq: ["$status", "REFUND"] }, "$amount", 0] 
            }
          },
          totalSuccessOrders: {
            $sum: { 
              $cond: [{ $in: ["$status", ["Success", "SUCCESS"]] }, 1, 0] 
            }
          },
          totalFailedOrders: {
            $sum: { 
              $cond: [{ $in: ["$status", ["Failed", "FAILED"]] }, 1, 0] 
            }
          },
          totalPendingOrders: {
            $sum: { 
              $cond: [{ $in: ["$status", ["Pending", "PENDING"]] }, 1, 0] 
            }
          },
          totalRefundOrders: {
            $sum: { 
              $cond: [{ $eq: ["$status", "REFUND"] }, 1, 0] 
            }
          },
          totalTransactions: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          totalSuccessAmount: { $ifNull: ["$totalSuccessAmount", 0] },
          totalFailedAmount: { $ifNull: ["$totalFailedAmount", 0] },
          totalPendingAmount: { $ifNull: ["$totalPendingAmount", 0] },
          totalRefundAmount: { $ifNull: ["$totalRefundAmount", 0] },
          totalSuccessOrders: { $ifNull: ["$totalSuccessOrders", 0] },
          totalFailedOrders: { $ifNull: ["$totalFailedOrders", 0] },
          totalPendingOrders: { $ifNull: ["$totalPendingOrders", 0] },
          totalRefundOrders: { $ifNull: ["$totalRefundOrders", 0] },
          totalTransactions: { $ifNull: ["$totalTransactions", 0] }
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

    console.log('✅ Analytics result:', result);

    res.status(200).json(result);
  } catch (error) {
    console.error('❌ Error fetching dashboard analytics:', error);
    res.status(500).json({
      message: 'Server Error',
      error: error.message
    });
  }
};

// Get Transactions by Merchant and Status
export const getTransactionsByMerchantStatus = async (req, res) => {
  try {
    let { merchantId, status, timeFilter = 'today', page = 1, limit = 10, startDate, endDate } = req.query;

    // If a merchant is logged in, override the merchantId from query with their own
    // if (req.user && req.user.role === 'merchant') {
    //   merchantId = req.user._id;
    // }

    console.log('🟡 Fetching transactions with:', { merchantId, status, timeFilter, startDate, endDate });

    let matchQuery = {};
    
    // CRITICAL FIX: Convert merchantId to ObjectId for query
    if (merchantId && merchantId !== 'all') {
      if (!mongoose.Types.ObjectId.isValid(merchantId)) {
        return res.status(400).json({ message: 'Invalid merchant ID format.' });
      }
      matchQuery.merchantId = new mongoose.Types.ObjectId(merchantId);
    }

    // Status filter
    if (status && status !== 'all') {
      const statusMapping = {
        'SUCCESS': ['Success', 'SUCCESS'],
        'PENDING': ['Pending', 'PENDING'],
        'FAILED': ['Failed', 'FAILED'],
        'REFUND': ['REFUND', 'Refund']
      };
      
      if (statusMapping[status]) {
        matchQuery.status = { $in: statusMapping[status] };
      } else {
        matchQuery.status = { $regex: new RegExp(status, 'i') };
      }
    }

    // Date filter
    if (timeFilter !== 'all') {
      const dateRange = getDateRange(timeFilter, startDate, endDate);
      matchQuery = { ...matchQuery, ...dateRange };
    }

    console.log('🔍 Final Match Query for transactions:', JSON.stringify(matchQuery, null, 2));

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Use aggregation with proper ObjectId handling
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
                  else: "$merchantName" // Fallback to original merchantName
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

    console.log(`✅ Found ${transactions.length} transactions out of ${totalDocs} total`);

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
    console.error('❌ Error fetching transactions by merchant status:', error);
    console.error('🔍 Error stack:', error.stack);
    
    res.status(500).json({ 
      message: 'Server Error', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const getMerchantTransactionSummary = async (req, res) => {
  try {
    let { timeFilter = 'today', merchantId, startDate, endDate } = req.query;

    // If a merchant is logged in, override the merchantId from query with their own
    // if (req.user && req.user.role === 'merchant') {
    //   merchantId = req.user._id;
    // }

    console.log('🟡 Fetching merchant summary with:', { timeFilter, merchantId, startDate, endDate });

    let matchQuery = {};
    
    // Merchant filter with ObjectId conversion
    if (merchantId && merchantId !== 'all') {
      if (!mongoose.Types.ObjectId.isValid(merchantId)) {
        return res.status(400).json({ message: 'Invalid merchant ID format.' });
      }
      matchQuery.merchantId = new mongoose.Types.ObjectId(merchantId);
    }

    // Date filter
    if (timeFilter !== 'all') {
      const dateRange = getDateRange(timeFilter, startDate, endDate);
      matchQuery = { ...matchQuery, ...dateRange };
    }

    console.log('🔍 Match Query for merchant summary:', JSON.stringify(matchQuery, null, 2));

    const merchantSummary = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$merchantId",
          totalTransactions: { $sum: 1 },
          successCount: { 
            $sum: { 
              $cond: [{ $in: ["$status", ["Success", "SUCCESS"]] }, 1, 0] 
            } 
          },
          pendingCount: { 
            $sum: { 
              $cond: [{ $in: ["$status", ["Pending", "PENDING"]] }, 1, 0] 
            } 
          },
          failedCount: { 
            $sum: { 
              $cond: [{ $in: ["$status", ["Failed", "FAILED"]] }, 1, 0] 
            } 
          },
          refundCount: { 
            $sum: { 
              $cond: [{ $eq: ["$status", "REFUND"] }, 1, 0] 
            } 
          },
          totalAmount: { $sum: "$amount" }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
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
          merchantId: "$_id",
          merchantName: {
            $cond: {
              if: { $and: ["$merchantInfo", "$merchantInfo.company", { $ne: ["$merchantInfo.company", ""] }] },
              then: "$merchantInfo.company",
              else: {
                $cond: {
                  if: { $and: ["$merchantInfo", "$merchantInfo.firstname", "$merchantInfo.lastname"] },
                  then: { $concat: ["$merchantInfo.firstname", " ", "$merchantInfo.lastname"] },
                  else: "Unknown Merchant"
                }
              }
            }
          },
          merchantEmail: { $ifNull: ["$merchantInfo.email", "N/A"] },
          merchantContact: { $ifNull: ["$merchantInfo.contact", "N/A"] },
          totalTransactions: 1,
          successCount: 1,
          pendingCount: 1,
          failedCount: 1,
          refundCount: 1,
          totalAmount: 1
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);

    console.log('✅ Merchant summary fetched:', merchantSummary.length, 'merchants');
    if (merchantSummary.length > 0) {
      console.log('📊 Sample merchant data:', merchantSummary[0]);
    }

    res.status(200).json(merchantSummary);
  } catch (error) {
    console.error('❌ Error fetching merchant transaction summary:', error);
    res.status(500).json({ 
      message: 'Server Error', 
      error: error.message,
      stack: error.stack 
    });
  }
};

// Recent Orders
export const getRecentOrders = async (req, res) => {
  try {
    let { limit = 10, merchantId, status, timeFilter = 'today', startDate, endDate } = req.query;

    // If a merchant is logged in, override the merchantId from query with their own
    // if (req.user && req.user.role === 'merchant') {
    //   merchantId = req.user._id;
    // }

    let matchQuery = {};
    if (merchantId && merchantId !== 'all') {
      if (!mongoose.Types.ObjectId.isValid(merchantId)) {
        return res.status(400).json({ message: 'Invalid merchant ID format.' });
      }
      matchQuery.merchantId = new mongoose.Types.ObjectId(merchantId);
    }
    if (status && status !== 'all') {
      matchQuery.status = { $regex: new RegExp(status, 'i') };
    }

    if (timeFilter !== 'all') {
      const dateRange = getDateRange(timeFilter, startDate, endDate);
      matchQuery = { ...matchQuery, ...dateRange };
    }

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
          createdAt: 1,
          merchantName: {
            $cond: {
              if: { $and: ["$merchantInfo", "$merchantInfo.company"] },
              then: "$merchantInfo.company",
              else: {
                $cond: {
                  if: { $and: ["$merchantInfo", "$merchantInfo.firstname", "$merchantInfo.lastname"] },
                  then: { $concat: ["$merchantInfo.firstname", " ", "$merchantInfo.lastname"] },
                  else: "Unknown Merchant"
                }
              }
            }
          }
        }
      },
      { $sort: { createdAt: -1 } },
      { $limit: parseInt(limit, 10) }
    ]);

    const totalDocs = await Transaction.countDocuments(matchQuery);
    
    console.log('✅ Recent orders fetched:', transactions.length);

    res.status(200).json({
      docs: transactions,
      totalDocs,
      limit: parseInt(limit, 10),
      page: 1,
      totalPages: Math.ceil(totalDocs / parseInt(limit, 10)),
      hasNextPage: false,
      hasPrevPage: false
    });

  } catch (error) {
    console.error('❌ Error fetching recent orders:', error);
    res.status(500).json({ 
      message: 'Server Error', 
      error: error.message 
    });
  }
};

// Debug endpoint to check data structure
export const debugDataStructure = async (req, res) => {
  try {
    // Check a sample transaction
    const sampleTransaction = await Transaction.findOne();
    console.log('🔍 Sample Transaction:', sampleTransaction);
    
    // Check a sample merchant
    const sampleMerchant = await User.findOne({ role: "merchant" });
    console.log('🔍 Sample Merchant:', sampleMerchant);
    
    // Check if merchantId matches
    const merchantIdInTransaction = sampleTransaction?.merchantId;
    const merchantIdInUser = sampleMerchant?._id?.toString();
    
    console.log('🔍 ID Comparison:', {
      transactionMerchantId: merchantIdInTransaction,
      userMerchantId: merchantIdInUser,
      typeTransaction: typeof merchantIdInTransaction,
      typeUser: typeof merchantIdInUser,
      areEqual: merchantIdInTransaction == merchantIdInUser // Use == for coercion comparison if types differ
    });

    res.status(200).json({
      sampleTransaction: {
        merchantId: sampleTransaction?.merchantId,
        merchantName: sampleTransaction?.merchantName,
        type: typeof sampleTransaction?.merchantId,
        _id: sampleTransaction?._id // Include _id for debugging
      },
      sampleMerchant: {
        _id: sampleMerchant?._id,
        company: sampleMerchant?.company,
        firstname: sampleMerchant?.firstname,
        lastname: sampleMerchant?.lastname,
        type: typeof sampleMerchant?._id
      },
      comparison: {
        areIdsMatching: sampleTransaction?.merchantId && sampleMerchant?._id ? sampleTransaction.merchantId.equals(sampleMerchant._id) : false, // Proper ObjectId comparison
        transactionId: merchantIdInTransaction,
        userId: merchantIdInUser
      }
    });
    
  } catch (error) {
    console.error('❌ Debug error:', error);
    res.status(500).json({ error: error.message });
  }
};

// dashboardController.js मध्ये
export const getMerchantAnalytics = async (req, res) => {
  try {
    let { merchantId, timeFilter = 'today', startDate, endDate } = req.query;

    console.log('🟡 Merchant Analytics Request:', { 
      merchantId, 
      timeFilter, 
      headers: req.headers 
    });

    if (!merchantId) {
      return res.status(400).json({ 
        message: 'Merchant ID is required',
        receivedQuery: req.query
      });
    }

    // ObjectId validation
    if (!mongoose.Types.ObjectId.isValid(merchantId)) {
      return res.status(400).json({ 
        message: 'Invalid merchant ID format',
        receivedId: merchantId
      });
    }

    const objectId = new mongoose.Types.ObjectId(merchantId);
    
    let matchQuery = {
      merchantId: objectId
    };

    // Date range
    if (timeFilter !== 'all') {
      const dateRange = getDateRange(timeFilter, startDate, endDate);
      matchQuery = { ...matchQuery, ...dateRange };
    }

    console.log('🔍 Final Match Query:', JSON.stringify(matchQuery, null, 2));

    // प्रथम transactions तपासा
    const totalTransactions = await Transaction.countDocuments(matchQuery);
    console.log(`📊 Found ${totalTransactions} transactions for merchant ${merchantId}`);

    // Sample transaction तपासा
    const sampleTx = await Transaction.findOne(matchQuery);
    console.log('🔍 Sample transaction:', sampleTx);

    const analytics = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalSuccessAmount: {
            $sum: { 
              $cond: [{ $in: ["$status", ["Success", "SUCCESS"]] }, "$amount", 0] 
            }
          },
          totalFailedAmount: {
            $sum: { 
              $cond: [{ $in: ["$status", ["Failed", "FAILED"]] }, "$amount", 0] 
            }
          },
          totalPendingAmount: {
            $sum: { 
              $cond: [{ $in: ["$status", ["Pending", "PENDING"]] }, "$amount", 0] 
            }
          },
          totalRefundAmount: {
            $sum: { 
              $cond: [{ $eq: ["$status", "REFUND"] }, "$amount", 0] 
            }
          },
          totalSuccessOrders: {
            $sum: { 
              $cond: [{ $in: ["$status", ["Success", "SUCCESS"]] }, 1, 0] 
            }
          },
          totalFailedOrders: {
            $sum: { 
              $cond: [{ $in: ["$status", ["Failed", "FAILED"]] }, 1, 0] 
            }
          },
          totalPendingOrders: {
            $sum: { 
              $cond: [{ $in: ["$status", ["Pending", "PENDING"]] }, 1, 0] 
            }
          },
          totalRefundOrders: {
            $sum: { 
              $cond: [{ $eq: ["$status", "REFUND"] }, 1, 0] 
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

    console.log('✅ Final Analytics Result:', result);
    
    res.status(200).json(result);

  } catch (error) {
    console.error('❌ Merchant Analytics Error:', error);
    res.status(500).json({
      message: 'Server Error',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Debug endpoint जोडा
export const checkMerchantData = async (req, res) => {
  try {
    const { merchantId } = req.query;
    
    // Merchant user तपासा
    const merchantUser = await User.findById(merchantId);
    console.log('🔍 Merchant User:', merchantUser);
    
    // Transactions तपासा  
    const transactions = await Transaction.find({ merchantId: merchantId }).limit(5);
    console.log('🔍 Merchant Transactions:', transactions);
    
    // Count तपासा
    const txCount = await Transaction.countDocuments({ merchantId: merchantId });
    console.log(`🔍 Total transactions for merchant: ${txCount}`);
    
    res.status(200).json({
      merchant: merchantUser,
      sampleTransactions: transactions,
      totalTransactions: txCount
    });
    
  } catch (error) {
    console.error('❌ Check merchant data error:', error);
    res.status(500).json({ error: error.message });
  }
};