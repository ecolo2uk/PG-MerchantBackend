// import Transaction from '../models/Transaction.js';
// import User from '../models/User.js';
// import mongoose from 'mongoose';

// const getDateRange = (filter, startDate, endDate) => {
//   const now = new Date();
//   let start, end;

//   switch (filter) {
//     case 'today':
//       start = new Date(now);
//       start.setHours(0, 0, 0, 0);
//       end = new Date(now);
//       end.setHours(23, 59, 59, 999);
//       break;
//     case 'yesterday':
//       start = new Date(now);
//       start.setDate(now.getDate() - 1);
//       start.setHours(0, 0, 0, 0);
//       end = new Date(now);
//       end.setDate(now.getDate() - 1);
//       end.setHours(23, 59, 59, 999);
//       break;
//     case 'this_week':
//       start = new Date(now);
//       start.setDate(now.getDate() - 6);
//       start.setHours(0, 0, 0, 0);
//       end = new Date(now);
//       end.setHours(23, 59, 59, 999);
//       break;
//     case 'this_month':
//       start = new Date(now.getFullYear(), now.getMonth(), 1);
//       start.setHours(0, 0, 0, 0);
//       end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
//       end.setHours(23, 59, 59, 999);
//       break;
//     case 'last_month':
//       start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
//       start.setHours(0, 0, 0, 0);
//       end = new Date(now.getFullYear(), now.getMonth(), 0);
//       end.setHours(23, 59, 59, 999);
//       break;
//     case 'custom':
//       if (startDate && endDate) {
//         start = new Date(startDate);
//         end = new Date(endDate);
//         start.setHours(0, 0, 0, 0);
//         end.setHours(23, 59, 59, 999);
//       } else {
//         return {};
//       }
//       break;
//     default:
//       return {};
//   }

//   return {
//     createdAt: {
//       $gte: start,
//       $lte: end
//     }
//   };
// };

// // Merchant Analytics
// export const getMerchantAnalytics = async (req, res) => {
//   try {
//     const { merchantId, timeFilter = 'today', startDate, endDate } = req.query;

//     console.log('🟡 Merchant Analytics Request:', { merchantId, timeFilter });

//     if (!merchantId) {
//       return res.status(400).json({ message: 'Merchant ID is required' });
//     }

//     if (!mongoose.Types.ObjectId.isValid(merchantId)) {
//       return res.status(400).json({ message: 'Invalid merchant ID format' });
//     }

//     const objectId = new mongoose.Types.ObjectId(merchantId);
    
//     let matchQuery = {
//       merchantId: objectId
//     };

//     const dateRange = getDateRange(timeFilter, startDate, endDate);
//     if (Object.keys(dateRange).length > 0) {
//       matchQuery.createdAt = dateRange.createdAt;
//     }

//     console.log('🔍 Merchant Analytics Match Query:', JSON.stringify(matchQuery, null, 2));

//     const analytics = await Transaction.aggregate([
//       { $match: matchQuery },
//       {
//         $group: {
//           _id: null,
//           totalSuccessAmount: {
//             $sum: { 
//               $cond: [{ $in: ["$status", ["Success", "SUCCESS", "success"]] }, "$amount", 0] 
//             }
//           },
//           totalFailedAmount: {
//             $sum: { 
//               $cond: [{ $in: ["$status", ["Failed", "FAILED", "failed"]] }, "$amount", 0] 
//             }
//           },
//           totalPendingAmount: {
//             $sum: { 
//               $cond: [{ $in: ["$status", ["Pending", "PENDING", "pending", "INITIATED"]] }, "$amount", 0] 
//             }
//           },
//           totalRefundAmount: {
//             $sum: { 
//               $cond: [{ $in: ["$status", ["Refund", "REFUND", "refund"]] }, "$amount", 0] 
//             }
//           },
//           totalSuccessOrders: {
//             $sum: { 
//               $cond: [{ $in: ["$status", ["Success", "SUCCESS", "success"]] }, 1, 0] 
//             }
//           },
//           totalFailedOrders: {
//             $sum: { 
//               $cond: [{ $in: ["$status", ["Failed", "FAILED", "failed"]] }, 1, 0] 
//             }
//           },
//           totalPendingOrders: {
//             $sum: { 
//               $cond: [{ $in: ["$status", ["Pending", "PENDING", "pending", "INITIATED"]] }, 1, 0] 
//             }
//           },
//           totalRefundOrders: {
//             $sum: { 
//               $cond: [{ $in: ["$status", ["Refund", "REFUND", "refund"]] }, 1, 0] 
//             }
//           },
//           totalTransactions: { $sum: 1 }
//         }
//       }
//     ]);

//     let result = analytics.length > 0 ? analytics[0] : {
//       totalSuccessAmount: 0,
//       totalFailedAmount: 0,
//       totalPendingAmount: 0,
//       totalRefundAmount: 0,
//       totalSuccessOrders: 0,
//       totalFailedOrders: 0,
//       totalPendingOrders: 0,
//       totalRefundOrders: 0,
//       totalTransactions: 0
//     };

//     // 🔥 TEMPORARY: If no data, return mock data for testing
//     if (result.totalTransactions === 0) {
//       console.log('📊 No transactions found, returning mock data for testing');
//       result = {
//         totalSuccessAmount: 125000,
//         totalFailedAmount: 25000,
//         totalPendingAmount: 35000,
//         totalRefundAmount: 15000,
//         totalSuccessOrders: 45,
//         totalFailedOrders: 8,
//         totalPendingOrders: 12,
//         totalRefundOrders: 3,
//         totalTransactions: 68,
//         isMockData: true // Flag to identify mock data
//       };
//     }

//     console.log('✅ Merchant Analytics Result:', result);
//     res.status(200).json(result);

//   } catch (error) {
//     console.error('❌ Merchant Analytics Error:', error);
    
//     // 🔥 TEMPORARY: Return mock data on error
//     const mockData = {
//       totalSuccessAmount: 125000,
//       totalFailedAmount: 25000,
//       totalPendingAmount: 35000,
//       totalRefundAmount: 15000,
//       totalSuccessOrders: 45,
//       totalFailedOrders: 8,
//       totalPendingOrders: 12,
//       totalRefundOrders: 3,
//       totalTransactions: 68,
//       isMockData: true,
//       error: error.message
//     };
    
//     res.status(200).json(mockData);
//   }
// };

// // Merchant Transactions
// export const getMerchantTransactions = async (req, res) => {
//   try {
//     const { merchantId, status, timeFilter = 'today', page = 1, limit = 10, startDate, endDate } = req.query;

//     console.log('🟡 Merchant Transactions Request:', { merchantId, status, timeFilter });

//     if (!merchantId) {
//       return res.status(400).json({ message: 'Merchant ID is required' });
//     }

//     if (!mongoose.Types.ObjectId.isValid(merchantId)) {
//       return res.status(400).json({ message: 'Invalid merchant ID format' });
//     }

//     const objectId = new mongoose.Types.ObjectId(merchantId);
    
//     let matchQuery = {
//       merchantId: objectId
//     };

//     if (status && status !== 'all') {
//       const statusMapping = {
//         'SUCCESS': ['Success', 'SUCCESS', 'success'],
//         'PENDING': ['Pending', 'PENDING', 'pending', 'INITIATED'],
//         'FAILED': ['Failed', 'FAILED', 'failed'],
//         'REFUND': ['Refund', 'REFUND', 'refund']
//       };
      
//       if (statusMapping[status]) {
//         matchQuery.status = { $in: statusMapping[status] };
//       }
//     }

//     const dateRange = getDateRange(timeFilter, startDate, endDate);
//     if (Object.keys(dateRange).length > 0) {
//       matchQuery.createdAt = dateRange.createdAt;
//     }

//     console.log('🔍 Merchant Transactions Match Query:', JSON.stringify(matchQuery, null, 2));

//     const skip = (parseInt(page) - 1) * parseInt(limit);

//     const transactions = await Transaction.aggregate([
//       { $match: matchQuery },
//       {
//         $lookup: {
//           from: 'users',
//           localField: 'merchantId',
//           foreignField: '_id',
//           as: 'merchantInfo'
//         }
//       },
//       {
//         $unwind: {
//           path: '$merchantInfo',
//           preserveNullAndEmptyArrays: true
//         }
//       },
//       {
//         $project: {
//           transactionId: 1,
//           merchantOrderId: 1,
//           amount: 1,
//           status: 1,
//           currency: 1,
//           createdAt: 1,
//           updatedAt: 1,
//           merchantName: {
//             $cond: {
//               if: { 
//                 $and: [
//                   "$merchantInfo",
//                   "$merchantInfo.company",
//                   { $ne: ["$merchantInfo.company", ""] }
//                 ]
//               },
//               then: "$merchantInfo.company",
//               else: {
//                 $cond: {
//                   if: { 
//                     $and: [
//                       "$merchantInfo",
//                       "$merchantInfo.firstname", 
//                       "$merchantInfo.lastname"
//                     ]
//                   },
//                   then: { $concat: ["$merchantInfo.firstname", " ", "$merchantInfo.lastname"] },
//                   else: "Unknown Merchant"
//                 }
//               }
//             }
//           }
//         }
//       },
//       { $sort: { createdAt: -1 } },
//       { $skip: skip },
//       { $limit: parseInt(limit) }
//     ]);

//     const totalDocs = await Transaction.countDocuments(matchQuery);

//     console.log(`✅ Found ${transactions.length} transactions for merchant`);

//     // 🔥 TEMPORARY: If no transactions, return mock data
//     let finalTransactions = transactions;
//     let finalTotalDocs = totalDocs;
    
//     if (transactions.length === 0) {
//       console.log('📊 No transactions found, returning mock data');
//       finalTransactions = generateMockTransactions(status);
//       finalTotalDocs = finalTransactions.length;
//     }

//     res.status(200).json({
//       docs: finalTransactions,
//       totalDocs: finalTotalDocs,
//       limit: parseInt(limit),
//       page: parseInt(page),
//       totalPages: Math.ceil(finalTotalDocs / parseInt(limit)),
//       hasNextPage: page * limit < finalTotalDocs,
//       hasPrevPage: page > 1,
//       isMockData: transactions.length === 0 // Flag for mock data
//     });

//   } catch (error) {
//     console.error('❌ Merchant Transactions Error:', error);
    
//     // 🔥 TEMPORARY: Return mock data on error
//     const mockTransactions = generateMockTransactions(status);
//     res.status(200).json({
//       docs: mockTransactions,
//       totalDocs: mockTransactions.length,
//       limit: parseInt(limit),
//       page: parseInt(page),
//       totalPages: 1,
//       hasNextPage: false,
//       hasPrevPage: false,
//       isMockData: true,
//       error: error.message
//     });
//   }
// };

// // Helper function to generate mock transactions
// const generateMockTransactions = (statusFilter = 'all') => {
//   const statuses = ['SUCCESS', 'PENDING', 'FAILED', 'REFUND'];
//   const filteredStatuses = statusFilter === 'all' ? statuses : [statusFilter];
  
//   const transactions = [];
//   const now = new Date();
  
//   filteredStatuses.forEach((status, index) => {
//     for (let i = 0; i < 5; i++) {
//       transactions.push({
//         _id: `mock_${status}_${i}`,
//         transactionId: `TXN${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
//         merchantOrderId: `ORDER${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
//         amount: Math.floor(Math.random() * 10000) + 1000,
//         status: status,
//         currency: 'INR',
//         createdAt: new Date(now.getTime() - (i * 24 * 60 * 60 * 1000)),
//         updatedAt: new Date(now.getTime() - (i * 24 * 60 * 60 * 1000)),
//         merchantName: 'Demo Merchant'
//       });
//     }
//   });
  
//   return transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
// };



// // Merchant Sales Report
// export const getMerchantSalesReport = async (req, res) => {
//   try {
//     const { merchantId, timeFilter = 'today', startDate, endDate } = req.query;

//     console.log('🟡 Merchant Sales Report Request:', { merchantId, timeFilter });

//     if (!merchantId) {
//       return res.status(400).json({ message: 'Merchant ID is required' });
//     }

//     if (!mongoose.Types.ObjectId.isValid(merchantId)) {
//       return res.status(400).json({ message: 'Invalid merchant ID format' });
//     }

//     const objectId = new mongoose.Types.ObjectId(merchantId);
    
//     let matchQuery = {
//       merchantId: objectId
//     };

//     const dateRange = getDateRange(timeFilter, startDate, endDate);
//     if (Object.keys(dateRange).length > 0) {
//       matchQuery.createdAt = dateRange.createdAt;
//     }

//     console.log('🔍 Merchant Sales Report Match Query:', JSON.stringify(matchQuery, null, 2));

//     const salesReport = await Transaction.aggregate([
//       { $match: matchQuery },
//       {
//         $group: {
//           _id: {
//             year: { $year: "$createdAt" },
//             month: { $month: "$createdAt" },
//             day: { $dayOfMonth: "$createdAt" }
//           },
//           totalIncome: {
//             $sum: {
//               $cond: [{ $in: ["$status", ["Success", "SUCCESS", "success"]] }, "$amount", 0]
//             }
//           },
//           totalCostOfSales: {
//             $sum: {
//               $cond: [{ $in: ["$status", ["Failed", "FAILED", "failed"]] }, "$amount", 0]
//             }
//           },
//           totalRefundAmount: {
//             $sum: {
//               $cond: [{ $in: ["$status", ["Refund", "REFUND", "refund"]] }, "$amount", 0]
//             }
//           },
//           totalPendingAmount: {
//             $sum: {
//               $cond: [{ $in: ["$status", ["Pending", "PENDING", "pending", "INITIATED"]] }, "$amount", 0]
//             }
//           },
//           successCount: {
//             $sum: { $cond: [{ $in: ["$status", ["Success", "SUCCESS", "success"]] }, 1, 0] }
//           },
//           failedCount: {
//             $sum: { $cond: [{ $in: ["$status", ["Failed", "FAILED", "failed"]] }, 1, 0] }
//           },
//           pendingCount: {
//             $sum: { $cond: [{ $in: ["$status", ["Pending", "PENDING", "pending", "INITIATED"]] }, 1, 0] }
//           },
//           refundCount: {
//             $sum: { $cond: [{ $in: ["$status", ["Refund", "REFUND", "refund"]] }, 1, 0] }
//           }
//         }
//       },
//       {
//         $project: {
//           _id: 0,
//           date: {
//             $dateFromParts: {
//               year: "$_id.year",
//               month: "$_id.month",
//               day: "$_id.day"
//             }
//           },
//           totalIncome: { $ifNull: ["$totalIncome", 0] },
//           totalCostOfSales: { $ifNull: ["$totalCostOfSales", 0] },
//           totalRefundAmount: { $ifNull: ["$totalRefundAmount", 0] },
//           totalPendingAmount: { $ifNull: ["$totalPendingAmount", 0] },
//           successCount: 1,
//           failedCount: 1,
//           pendingCount: 1,
//           refundCount: 1
//         }
//       },
//       { $sort: { date: 1 } }
//     ]);

//     console.log(`✅ Merchant sales report fetched: ${salesReport.length} entries`);
    
//     // Fill missing dates
//     let filledReport = fillMissingDates(salesReport, timeFilter);
    
//     // 🔥 TEMPORARY: If no real data, generate mock sales report
//     if (salesReport.length === 0 || salesReport.every(item => 
//       item.successCount === 0 && item.failedCount === 0 && item.pendingCount === 0 && item.refundCount === 0
//     )) {
//       console.log('📊 No sales data found, generating mock sales report');
//       filledReport = generateMockSalesReport(timeFilter);
//     }
    
//     res.status(200).json(filledReport);

//   } catch (error) {
//     console.error('❌ Merchant Sales Report Error:', error);
    
//     // 🔥 TEMPORARY: Return mock data on error
//     const mockSalesReport = generateMockSalesReport(timeFilter);
//     res.status(200).json(mockSalesReport);
//   }
// };

// // Helper function to generate mock sales report
// const generateMockSalesReport = (timeFilter) => {
//   const now = new Date();
//   const report = [];
//   let daysToShow = 7;
  
//   if (timeFilter === 'this_month') daysToShow = 30;
//   else if (timeFilter === 'last_month') daysToShow = 30;
//   else if (timeFilter === 'this_week') daysToShow = 7;
//   else if (timeFilter === 'today') daysToShow = 1;
//   else if (timeFilter === 'yesterday') daysToShow = 1;
  
//   for (let i = daysToShow - 1; i >= 0; i--) {
//     const date = new Date(now);
//     date.setDate(now.getDate() - i);
//     date.setHours(0, 0, 0, 0);
    
//     report.push({
//       date: date.toISOString(),
//       totalIncome: Math.floor(Math.random() * 50000) + 10000,
//       totalCostOfSales: Math.floor(Math.random() * 10000) + 1000,
//       totalRefundAmount: Math.floor(Math.random() * 5000) + 500,
//       totalPendingAmount: Math.floor(Math.random() * 15000) + 3000,
//       successCount: Math.floor(Math.random() * 20) + 5,
//       failedCount: Math.floor(Math.random() * 10) + 1,
//       pendingCount: Math.floor(Math.random() * 8) + 2,
//       refundCount: Math.floor(Math.random() * 3) + 1
//     });
//   }
  
//   return report;
// };

// // Helper function to fill missing dates
// const fillMissingDates = (existingData, timeFilter) => {
//   const now = new Date();
//   const result = [];
//   let daysToShow = 7; // Default for this_week
  
//   if (timeFilter === 'this_month') daysToShow = 30;
//   else if (timeFilter === 'last_month') daysToShow = 30;
//   else if (timeFilter === 'this_week') daysToShow = 7;
//   else if (timeFilter === 'today') daysToShow = 1;
//   else if (timeFilter === 'yesterday') daysToShow = 1;
  
//   for (let i = daysToShow - 1; i >= 0; i--) {
//     const date = new Date(now);
//     date.setDate(now.getDate() - i);
//     date.setHours(0, 0, 0, 0);
    
//     const existing = existingData.find(item => {
//       const itemDate = new Date(item.date);
//       return itemDate.toDateString() === date.toDateString();
//     });
    
//     if (existing) {
//       result.push(existing);
//     } else {
//       result.push({
//         date: date.toISOString(),
//         totalIncome: 0,
//         totalCostOfSales: 0,
//         totalRefundAmount: 0,
//         totalPendingAmount: 0,
//         successCount: 0,
//         failedCount: 0,
//         pendingCount: 0,
//         refundCount: 0
//       });
//     }
//   }
  
//   return result;
// };

// // Get current merchant info
// export const getCurrentMerchant = async (req, res) => {
//   try {
//     const { merchantId } = req.query;

//     if (!merchantId) {
//       return res.status(400).json({ message: 'Merchant ID is required' });
//     }

//     if (!mongoose.Types.ObjectId.isValid(merchantId)) {
//       return res.status(400).json({ message: 'Invalid merchant ID format' });
//     }

//     const merchant = await User.findById(merchantId)
//       .select('_id firstname lastname company email contact role status');

//     if (!merchant) {
//       return res.status(404).json({ message: 'Merchant not found' });
//     }

//     res.status(200).json(merchant);
//   } catch (error) {
//     console.error('❌ Error fetching merchant:', error);
//     res.status(500).json({
//       message: 'Server Error',
//       error: error.message
//     });
//   }
// };

// // Debug endpoint to check merchant data
// export const debugMerchantData = async (req, res) => {
//   try {
//     const { merchantId } = req.query;

//     console.log('🔍 Debugging merchant data for:', merchantId);

//     if (!merchantId) {
//       return res.status(400).json({ message: 'Merchant ID is required' });
//     }

//     if (!mongoose.Types.ObjectId.isValid(merchantId)) {
//       return res.status(400).json({ message: 'Invalid merchant ID format' });
//     }

//     const objectId = new mongoose.Types.ObjectId(merchantId);

//     // Check if merchant exists in User collection
//     const merchantUser = await User.findById(objectId);
//     console.log('🔍 Merchant User:', merchantUser);

//     // Check transactions for this merchant
//     const transactions = await Transaction.find({ merchantId: objectId });
//     console.log('🔍 Transactions count:', transactions.length);
    
//     // Check first few transactions
//     const sampleTransactions = await Transaction.find({ merchantId: objectId }).limit(5);
//     console.log('🔍 Sample Transactions:', sampleTransactions);

//     // Check all transactions regardless of merchant
//     const allTransactionsCount = await Transaction.countDocuments();
//     console.log('🔍 All transactions in database:', allTransactionsCount);

//     res.status(200).json({
//       merchant: merchantUser,
//       transactionsCount: transactions.length,
//       sampleTransactions: sampleTransactions,
//       allTransactionsCount: allTransactionsCount,
//       merchantIdUsed: objectId
//     });

//   } catch (error) {
//     console.error('❌ Debug error:', error);
//     res.status(500).json({ error: error.message });
//   }
// };


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

// ✅ FIXED: Merchant Analytics - REAL DATA ONLY
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
              $cond: [{ $in: ["$status", ["PENDING", "INITIATED"]] }, "$amount", 0] 
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
              $cond: [{ $in: ["$status", ["PENDING", "INITIATED"]] }, 1, 0] 
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

    console.log('✅ Merchant Analytics Result (REAL DATA):', result);
    res.status(200).json(result);

  } catch (error) {
    console.error('❌ Merchant Analytics Error:', error);
    
    // ✅ REMOVED MOCK DATA - Return error instead
    res.status(500).json({
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
};

// ✅ FIXED: Merchant Transactions - REAL DATA ONLY
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
        'SUCCESS': 'SUCCESS',
        'PENDING': ['PENDING', 'INITIATED'],
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

    // ✅ FIXED: Use direct Transaction.find() instead of aggregate for better performance
    const transactions = await Transaction.find(matchQuery)
      .select('transactionId merchantOrderId amount status currency createdAt updatedAt merchantName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalDocs = await Transaction.countDocuments(matchQuery);

    console.log(`✅ Found ${transactions.length} REAL transactions for merchant`);

    res.status(200).json({
      docs: transactions,
      totalDocs: totalDocs,
      limit: parseInt(limit),
      page: parseInt(page),
      totalPages: Math.ceil(totalDocs / parseInt(limit)),
      hasNextPage: page * limit < totalDocs,
      hasPrevPage: page > 1
    });

  } catch (error) {
    console.error('❌ Merchant Transactions Error:', error);
    
    // ✅ REMOVED MOCK DATA - Return error instead
    res.status(500).json({
      message: 'Failed to fetch transactions',
      error: error.message
    });
  }
};

// ✅ FIXED: Merchant Sales Report - REAL DATA ONLY
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
              $cond: [{ $in: ["$status", ["PENDING", "INITIATED"]] }, "$amount", 0]
            }
          },
          successCount: {
            $sum: { $cond: [{ $eq: ["$status", "SUCCESS"] }, 1, 0] }
          },
          failedCount: {
            $sum: { $cond: [{ $eq: ["$status", "FAILED"] }, 1, 0] }
          },
          pendingCount: {
            $sum: { $cond: [{ $in: ["$status", ["PENDING", "INITIATED"]] }, 1, 0] }
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
    
    // Fill missing dates with zeros
    let filledReport = fillMissingDates(salesReport, timeFilter);
    
    res.status(200).json(filledReport);

  } catch (error) {
    console.error('❌ Merchant Sales Report Error:', error);
    
    // ✅ REMOVED MOCK DATA - Return error instead
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