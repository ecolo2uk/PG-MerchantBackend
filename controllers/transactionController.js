// controllers/transactionController.js
import { Transaction, QrTransaction } from "../models/Transaction.js";
import mongoose from 'mongoose';

const generateTransactionId = () => `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateTxnRefId = () => `REF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
const generateMid = () => `MID${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateVendorRefId = () => `VENDOR${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

// In your transactionController.js

export const generateDynamicQR = async (req, res) => {
  try {
    const { amount, txnNote = 'Payment for Order' } = req.body;
    const merchantId = req.merchant._id;
    const merchantName = req.merchant.name;

    // Generate unique IDs
    const transactionId = `TXN${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
    const txnRefId = `REF${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
    const merchantOrderId = `ORDER${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
    const vendorRefId = `VENDOR${Date.now()}${Math.random().toString(36).substr(2, 5)}`;

    const transactionData = {
      transactionId,
      merchantId,
      merchantName,
      amount: Number(amount),
      txnNote,
      txnRefId,
      merchantOrderId,
      mid: req.merchant.mid || 'DEFAULT_MID', // Get from merchant info
      "Vendor Ref ID": vendorRefId,
      status: 'GENERATED',
      // Include other required fields with appropriate values
      upiId: 'enpay1.skypal@fino',
      merchantVpa: 'enpay1.skypal@fino',
      "Commission Amount": 0,
      "Settlement Status": "NA"
    };

    const transaction = new QrTransaction(transactionData);
    await transaction.save();

    // Your QR generation logic here...

    res.status(200).json({
      success: true,
      transactionId: transaction.transactionId,
      qrCode: generatedQRCode, // Your generated QR code
      paymentUrl: generatedPaymentUrl // Your generated payment URL
    });
  } catch (error) {
    console.error('Generate QR Error:', error);
    res.status(500).json({
      code: 500,
      message: 'Failed to save transaction',
      error: error.message
    });
  }
};

export const generateDefaultQR = async (req, res) => {
  try {
    const merchantId = req.merchant._id;
    const merchantName = req.merchant.name;

    // Generate unique IDs for default QR too
    const transactionId = `DFT${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
    const txnRefId = `REF${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
    const merchantOrderId = `ORDER${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
    const vendorRefId = `VENDOR${Date.now()}${Math.random().toString(36).substr(2, 5)}`;

    const defaultQRData = {
      transactionId,
      merchantId,
      merchantName,
      amount: 0, // Default QR has zero amount
      status: 'GENERATED',
      txnRefId,
      merchantOrderId,
      mid: req.merchant.mid || 'DEFAULT_MID',
      "Vendor Ref ID": vendorRefId,
      upiId: 'enpay1.skypal@fino',
      merchantVpa: 'enpay1.skypal@fino',
      "Commission Amount": 0,
      "Settlement Status": "NA",
      txnNote: 'Default QR Code'
    };

    const defaultTransaction = new QrTransaction(defaultQRData);
    await defaultTransaction.save();

    // Your default QR generation logic here...

    res.status(200).json({
      success: true,
      transactionId: defaultTransaction.transactionId,
      qrCode: defaultQRCode, // Your generated default QR code
      isDefault: true
    });
  } catch (error) {
    console.error('Generate Default QR Error:', error);
    res.status(500).json({
      code: 500,
      message: 'Failed to save default QR',
      error: error.message
    });
  }
};

// ✅ WORKING: Get Transactions
export const getTransactions = async (req, res) => {
  try {
    const merchantId = req.user.id;
    console.log("🟡 Fetching transactions for merchant:", merchantId);

    const transactions = await Transaction.find({ 
      merchantId: new mongoose.Types.ObjectId(merchantId) 
    })
    .sort({ createdAt: -1 })
    .select('-__v');

    console.log(`✅ Found ${transactions.length} transactions`);

    res.json(transactions);

  } catch (error) {
    console.error("❌ Error fetching transactions:", error);
    res.status(500).json({
      code: 500,
      message: "Failed to fetch transactions",
      error: error.message
    });
  }
};

// ✅ WORKING: Check Transaction Status
export const checkTransactionStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const merchantId = req.user.id;

    console.log("🟡 Checking transaction status:", { transactionId, merchantId });

    const transaction = await Transaction.findOne({
      transactionId,
      merchantId: new mongoose.Types.ObjectId(merchantId)
    });

    if (!transaction) {
      return res.status(404).json({
        code: 404,
        message: "Transaction not found"
      });
    }

    res.json({
      code: 200,
      transaction: {
        transactionId: transaction.transactionId,
        status: transaction.status,
        amount: transaction.amount,
        upiId: transaction.upiId,
        txnRefId: transaction.txnRefId,
        createdAt: transaction.createdAt,
        settlementStatus: transaction["Settlement Status"]
      }
    });

  } catch (error) {
    console.error("❌ Check Status Error:", error);
    res.status(500).json({
      code: 500,
      message: "Failed to check transaction status",
      error: error.message
    });
  }
};

// ✅ Add this debug endpoint to test the connection
export const testConnection = async (req, res) => {
  try {
    const merchantId = req.user.id;
    
    // Test database connection
    const count = await Transaction.countDocuments({ merchantId });
    
    res.json({
      code: 200,
      message: "Connection successful",
      transactionCount: count,
      merchantId: merchantId,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("❌ Connection test error:", error);
    res.status(500).json({
      code: 500,
      error: error.message
    });
  }
};

// Keep other functions as needed...
export const handlePaymentWebhook = async (req, res) => {
  try {
    const {
      transactionId,
      status,
      upiId,
      amount,
      txnRefId,
      customerName,
      customerVpa,
      customerContact,
      settlementStatus,
      merchantOrderId
    } = req.body;

    console.log("🟡 Webhook Received:", req.body);

    let transaction = await Transaction.findOne({ 
      $or: [
        { transactionId },
        { merchantOrderId },
        { txnRefId }
      ]
    });

    if (transaction) {
      console.log(`✅ Found transaction: ${transaction.transactionId}`);
      
      // Update fields
      if (status) transaction.status = status;
      if (amount) transaction.amount = parseFloat(amount);
      if (customerName) transaction["Customer Name"] = customerName;
      if (customerVpa) transaction["Customer VPA"] = customerVpa;
      if (customerContact) transaction["Customer Contact No"] = customerContact;
      if (settlementStatus) transaction["Settlement Status"] = settlementStatus;
      
      await transaction.save();
      
      res.json({
        code: 200,
        message: "Webhook processed successfully",
        transactionId: transaction.transactionId,
        status: transaction.status
      });
    } else {
      res.status(404).json({
        code: 404,
        message: "Transaction not found"
      });
    }

  } catch (error) {
    console.error("❌ Webhook Error:", error);
    res.status(500).json({
      code: 500,
      message: "Webhook processing failed",
      error: error.message
    });
  }
};

// Other functions that work with MAIN collection only
// export const checkTransactionStatus = async (req, res) => {
//   try {
//     const { transactionId } = req.params;
//     const merchantId = req.user.id;

//     console.log("🟡 Checking transaction status in MAIN collection:", { transactionId, merchantId });

//     const transaction = await Transaction.findOne({
//       transactionId,
//       merchantId: new mongoose.Types.ObjectId(merchantId)
//     });

//     if (!transaction) {
//       return res.status(404).json({
//         code: 404,
//         message: "Transaction not found in MAIN collection"
//       });
//     }

//     res.json({
//       code: 200,
//       transaction: {
//         transactionId: transaction.transactionId,
//         status: transaction.status,
//         amount: transaction.amount,
//         upiId: transaction.upiId,
//         txnRefId: transaction.txnRefId,
//         createdAt: transaction.createdAt,
//         settlementStatus: transaction["Settlement Status"]
//       },
//       collection: "transactions" // 🔥 Confirm from main collection
//     });

//   } catch (error) {
//     console.error("❌ Check Status Error:", error);
//     res.status(500).json({
//       code: 500,
//       message: "Failed to check transaction status",
//       error: error.message
//     });
//   }
// };

export const getTransactionDetails = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const merchantId = req.user.id;

    console.log("🟡 Get transaction details from MAIN collection:", { transactionId, merchantId });

    const transaction = await Transaction.findOne({ 
      transactionId, 
      merchantId: new mongoose.Types.ObjectId(merchantId)
    });

    if (!transaction) {
      return res.status(404).json({ 
        code: 404,
        message: "Transaction not found in MAIN collection" 
      });
    }

    res.json({
      code: 200,
      transaction,
      collection: "transactions" // 🔥 Confirm from main collection
    });
  } catch (error) {
    console.error("❌ Get Details Error:", error);
    res.status(500).json({ 
      code: 500,
      message: error.message 
    });
  }
};

// Test endpoint to verify main collection is working
export const testMainCollection = async (req, res) => {
  try {
    const merchantId = req.user.id;
    
    // Count documents in both collections
    const mainCount = await Transaction.countDocuments({ merchantId });
    const qrCount = await QrTransaction.countDocuments({ merchantId });
    
    // Get recent transactions from both
    const mainTransactions = await Transaction.find({ merchantId }).limit(3).sort({ createdAt: -1 });
    const qrTransactions = await QrTransaction.find({ merchantId }).limit(3).sort({ createdAt: -1 });

    res.json({
      code: 200,
      message: "Collection status check",
      counts: {
        transactions: mainCount,
        qr_transactions: qrCount
      },
      recent: {
        transactions: mainTransactions.map(t => ({
          transactionId: t.transactionId,
          amount: t.amount,
          status: t.status,
          createdAt: t.createdAt
        })),
        qr_transactions: qrTransactions.map(t => ({
          transactionId: t.transactionId,
          amount: t.amount,
          status: t.status,
          createdAt: t.createdAt
        }))
      }
    });
    
  } catch (error) {
    console.error("❌ Test error:", error);
    res.status(500).json({
      code: 500,
      error: error.message
    });
  }
};

// Manual sync from QR to Main (if needed)
export const syncQRToMain = async (req, res) => {
  try {
    const merchantId = req.user.id;
    
    console.log("🔄 Manual sync: QR to Main for merchant:", merchantId);
    
    const qrTransactions = await QrTransaction.find({ merchantId });
    let syncedCount = 0;
    
    for (const qrTxn of qrTransactions) {
      try {
        const existing = await Transaction.findOne({ transactionId: qrTxn.transactionId });
        
        if (!existing) {
          const mainTxn = new Transaction({
            transactionId: qrTxn.transactionId,
            merchantId: qrTxn.merchantId,
            merchantName: qrTxn.merchantName,
            amount: qrTxn.amount,
            status: qrTxn.status,
            qrCode: qrTxn.qrCode,
            paymentUrl: qrTxn.paymentUrl,
            txnNote: qrTxn.txnNote,
            txnRefId: qrTxn.txnRefId,
            upiId: qrTxn.upiId,
            merchantVpa: qrTxn.merchantVpa,
            merchantOrderId: qrTxn.merchantOrderId,
            mid: qrTxn.mid,
            "Vendor Ref ID": qrTxn["Vendor Ref ID"],
            "Commission Amount": qrTxn["Commission Amount"],
            "Settlement Status": qrTxn["Settlement Status"],
            createdAt: qrTxn.createdAt
          });
          
          await mainTxn.save();
          syncedCount++;
          console.log(`✅ Synced: ${qrTxn.transactionId}`);
        }
      } catch (error) {
        console.error(`❌ Failed to sync: ${qrTxn.transactionId}`, error);
      }
    }
    
    res.json({
      code: 200,
      message: "Manual sync completed",
      synced: syncedCount,
      total: qrTransactions.length
    });
    
  } catch (error) {
    console.error("❌ Manual sync error:", error);
    res.status(500).json({
      code: 500,
      message: "Manual sync failed",
      error: error.message
    });
  }
};

// Keep other functions as needed...
export const downloadReceipt = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const merchantId = req.user.id;

    const transaction = await Transaction.findOne({ 
      transactionId, 
      merchantId: new mongoose.Types.ObjectId(merchantId)
    });

    if (!transaction) {
      return res.status(404).json({ 
        code: 404,
        message: "Transaction not found in MAIN collection" 
      });
    }

    if (transaction.status !== "SUCCESS") {
      return res.status(400).json({ 
        code: 400,
        message: "Receipt only available for successful transactions" 
      });
    }

    const receiptData = {
      transactionId: transaction.transactionId,
      merchantOrderId: transaction.merchantOrderId,
      amount: transaction.amount,
      date: transaction.createdAt,
      merchantName: transaction.merchantName,
      status: transaction.status,
      upiId: transaction.upiId,
      customerName: transaction["Customer Name"] || 'N/A',
      customerVpa: transaction["Customer VPA"] || 'N/A',
      commissionAmount: transaction["Commission Amount"],
      settlementStatus: transaction["Settlement Status"]
    };

    res.json({
      code: 200,
      message: "Receipt generated successfully",
      receipt: receiptData
    });

  } catch (error) {
    console.error("❌ Download Receipt Error:", error);
    res.status(500).json({ 
      code: 500,
      message: "Failed to download receipt",
      error: error.message 
    });
  }
};

// export const initiateRefund = async (req, res) => {
//   try {
//     const { transactionId } = req.params;
//     const { refundAmount, reason } = req.body;
//     const merchantId = req.user.id;

//     const transaction = await Transaction.findOne({ 
//       transactionId, 
//       merchantId: new mongoose.Types.ObjectId(merchantId)
//     });

//     if (!transaction) {
//       return res.status(404).json({ 
//         code: 404,
//         message: "Transaction not found in MAIN collection" 
//       });
//     }

//     if (transaction.status !== "SUCCESS") {
//       return res.status(400).json({ 
//         code: 400,
//         message: "Refund only available for successful transactions" 
//       });
//     }

//     if (refundAmount > transaction.amount) {
//       return res.status(400).json({ 
//         code: 400,
//         message: "Refund amount cannot exceed original transaction amount" 
//       });
//     }

//     transaction.status = "REFUNDED";
//     await transaction.save();

//     res.json({
//       code: 200,
//       message: "Refund initiated successfully",
//       refundId: `REF${Date.now()}`,
//       transactionId: transactionId,
//       refundAmount: refundAmount,
//       originalAmount: transaction.amount,
//       status: "REFUNDED"
//     });

//   } catch (error) {
//     console.error("❌ Refund Error:", error);
//     res.status(500).json({ 
//       code: 500,
//       message: "Failed to initiate refund",
//       error: error.message 
//     });
//   }
// };

// Manual sync endpoint for existing QR transactions to MAIN
export const syncAllQRToMain = async (req, res) => {
  try {
    const merchantId = req.user.id;
    
    console.log("🔄 Manual sync: QR to MAIN for merchant:", merchantId);
    
    // Find all QR transactions for this merchant
    const qrTransactions = await QrTransaction.find({ merchantId });
    
    let syncedCount = 0;
    let errorCount = 0;
    
    for (const qrTxn of qrTransactions) {
      try {
        // Check if already exists in main collection
        const existing = await Transaction.findOne({ transactionId: qrTxn.transactionId });
        
        if (!existing) {
          await syncQrTransactionToMain(qrTxn, {});
          syncedCount++;
          console.log(`✅ Synced: ${qrTxn.transactionId}`);
        }
      } catch (error) {
        console.error(`❌ Failed to sync: ${qrTxn.transactionId}`, error);
        errorCount++;
      }
    }
    
    res.json({
      code: 200,
      message: "Manual sync completed",
      results: {
        totalQRTransactions: qrTransactions.length,
        syncedToMain: syncedCount,
        alreadyExists: qrTransactions.length - syncedCount - errorCount,
        errors: errorCount
      }
    });
    
  } catch (error) {
    console.error("❌ Manual sync error:", error);
    res.status(500).json({
      code: 500,
      message: "Manual sync failed",
      error: error.message
    });
  }
};

// Check sync status between collections
export const checkSyncStatus = async (req, res) => {
  try {
    const merchantId = req.user.id;
    
    // QR Transactions
    const qrTransactions = await QrTransaction.find({ merchantId })
      .sort({ createdAt: -1 })
      .limit(10);
    
    // Main Transactions  
    const mainTransactions = await Transaction.find({ merchantId })
      .sort({ createdAt: -1 })
      .limit(10);
    
    // Sync status check
    const syncStatus = await Promise.all(
      qrTransactions.map(async (qrTxn) => {
        const mainTxn = await Transaction.findOne({ 
          transactionId: qrTxn.transactionId 
        });
        return {
          transactionId: qrTxn.transactionId,
          qrExists: true,
          mainExists: !!mainTxn,
          status: qrTxn.status,
          amount: qrTxn.amount,
          createdAt: qrTxn.createdAt
        };
      })
    );
    
    res.json({
      code: 200,
      syncStatus: {
        totalQR: qrTransactions.length,
        totalMain: mainTransactions.length,
        transactions: syncStatus
      }
    });
    
  } catch (error) {
    console.error("❌ Sync check error:", error);
    res.status(500).json({
      code: 500,
      message: "Sync check failed",
      error: error.message
    });
  }
};

// Test endpoint to verify data is going to MAIN collection
// export const testMainCollection = async (req, res) => {
//   try {
//     const merchantId = req.user.id;
    
//     const testTransaction = {
//       transactionId: `TEST${Date.now()}`,
//       merchantId: new mongoose.Types.ObjectId(merchantId),
//       merchantName: "Test Merchant",
//       amount: 100,
//       status: "INITIATED",
//       mid: "TESTMID",
//       "Vendor Ref ID": "TESTVENDOR",
//       "Commission Amount": 0,
//       "Settlement Status": "Unsettled"
//     };

//     console.log("🧪 Testing MAIN collection save...");
    
//     const mainTxn = new Transaction(testTransaction);
//     await mainTxn.save();
    
//     // Verify it's saved
//     const verified = await Transaction.findOne({ transactionId: testTransaction.transactionId });
    
//     res.json({
//       code: 200,
//       message: "Test completed",
//       testData: testTransaction,
//       saved: !!verified,
//       verified: verified ? {
//         transactionId: verified.transactionId,
//         collection: "transactions"
//       } : null
//     });
    
//   } catch (error) {
//     console.error("❌ Test error:", error);
//     res.status(500).json({
//       code: 500,
//       error: error.message
//     });
//   }
// };

// Keep other existing functions (downloadReceipt, initiateRefund, etc.) as they are
// but ensure they only work with Transaction model (MAIN collection)

// export const downloadReceipt = async (req, res) => {
//   try {
//     const { transactionId } = req.params;
//     const merchantId = req.user.id;

//     console.log("🟡 Download receipt from MAIN collection:", { transactionId, merchantId });

//     const transaction = await Transaction.findOne({ 
//       transactionId, 
//       merchantId: new mongoose.Types.ObjectId(merchantId)
//     });

//     if (!transaction) {
//       return res.status(404).json({ 
//         code: 404,
//         message: "Transaction not found in MAIN collection" 
//       });
//     }

//     if (transaction.status !== "SUCCESS") {
//       return res.status(400).json({ 
//         code: 400,
//         message: "Receipt only available for successful transactions" 
//       });
//     }

//     const receiptData = {
//       transactionId: transaction.transactionId,
//       merchantOrderId: transaction.merchantOrderId,
//       amount: transaction.amount,
//       date: transaction.createdAt,
//       merchantName: transaction.merchantName,
//       status: transaction.status,
//       upiId: transaction.upiId,
//       customerName: transaction["Customer Name"] || 'N/A',
//       customerVpa: transaction["Customer VPA"] || 'N/A',
//       commissionAmount: transaction["Commission Amount"],
//       settlementStatus: transaction["Settlement Status"],
//       collection: "main"
//     };

//     res.json({
//       code: 200,
//       message: "Receipt generated successfully",
//       receipt: receiptData
//     });

//   } catch (error) {
//     console.error("❌ Download Receipt Error:", error);
//     res.status(500).json({ 
//       code: 500,
//       message: "Failed to download receipt",
//       error: error.message 
//     });
//   }
// };

export const initiateRefund = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { refundAmount, reason } = req.body;
    const merchantId = req.user.id;

    console.log("🟡 Refund request in MAIN collection:", { transactionId, merchantId, refundAmount, reason });

    const transaction = await Transaction.findOne({ 
      transactionId, 
      merchantId: new mongoose.Types.ObjectId(merchantId)
    });

    if (!transaction) {
      return res.status(404).json({ 
        code: 404,
        message: "Transaction not found in MAIN collection" 
      });
    }

    if (transaction.status !== "SUCCESS") {
      return res.status(400).json({ 
        code: 400,
        message: "Refund only available for successful transactions" 
      });
    }

    if (refundAmount > transaction.amount) {
      return res.status(400).json({ 
        code: 400,
        message: "Refund amount cannot exceed original transaction amount" 
      });
    }

    console.log(`🟡 Refund initiated for: ${transactionId}, Amount: ${refundAmount}, Reason: ${reason}`);

    // Update transaction status to Refunded in MAIN collection
    transaction.status = "REFUNDED";
    await transaction.save();

    res.json({
      code: 200,
      message: "Refund initiated successfully",
      refundId: `REF${Date.now()}`,
      transactionId: transactionId,
      refundAmount: refundAmount,
      originalAmount: transaction.amount,
      status: "REFUNDED",
      collection: "main"
    });

  } catch (error) {
    console.error("❌ Refund Error:", error);
    res.status(500).json({ 
      code: 500,
      message: "Failed to initiate refund",
      error: error.message 
    });
  }
};

// Add to routes
export const simulatePaymentWebhook = async (req, res) => {
  try {
    const { transactionId, merchantOrderId, txnRefId, amount = 100, status = "SUCCESS" } = req.body;

    const webhookData = {
      transactionId: transactionId,
      merchantOrderId: merchantOrderId,
      txnRefId: txnRefId,
      status: status,
      upiId: "customer@upi",
      amount: amount,
      customerName: "Test Customer",
      customerVpa: "customer@okicici",
      customerContact: "9876543210",
      settlementStatus: "Unsettled",
      enpayTxnId: `ENPAY${Date.now()}`,
      mid: `MID${Date.now()}`,
      "Vendor Ref ID": `VENDORREF${Date.now()}`,
      "Commission Amount": 0,
      merchantName: "Test Merchant"
    };

    // Call webhook internally
    const fakeReq = { body: webhookData };
    const fakeRes = {
      json: (data) => {
        console.log("✅ Simulated webhook response:", data);
        res.json({
          code: 200,
          message: "Webhook simulation completed",
          simulation: data
        });
      },
      status: (code) => ({
        json: (data) => {
          console.log("❌ Simulated webhook error:", data);
          res.status(code).json(data);
        }
      })
    };

    await handlePaymentWebhook(fakeReq, fakeRes);

  } catch (error) {
    console.error("❌ Simulation error:", error);
    res.status(500).json({
      code: 500,
      message: "Simulation failed",
      error: error.message
    });
  }
};