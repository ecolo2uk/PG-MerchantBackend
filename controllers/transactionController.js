import Transaction from "../models/Transaction.js";
import QrTransaction from "../models/QrTransaction.js";
import mongoose from 'mongoose';

const generateTransactionId = () => `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateTxnRefId = () => `REF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
const generateMid = () => `MID${Date.now()}`;
const generateVendorRefId = () => `VENDORREF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

// IMPROVED SYNC FUNCTION - ALWAYS SYNC TO MAIN TRANSACTION
const syncQrTransactionToMain = async (qrTransaction, webhookData = {}) => {
  try {
    console.log("🔄 Syncing to main Transaction collection...");
    
    const source = qrTransaction || webhookData;
    const merchantId = source.merchantId;

    if (!merchantId) {
      console.error("❌ No merchantId found for transaction");
      return null;
    }

    // Prepare transaction data for MAIN collection
    const transactionData = {
      transactionId: source.transactionId || generateTransactionId(),
      merchantId: new mongoose.Types.ObjectId(merchantId),
      merchantName: source.merchantName || "SKYPAL SYSTEM PRIVATE LIMITED",
      amount: parseFloat(source.amount) || 0,
      status: source.status || webhookData?.status || "INITIATED",
      qrCode: source.qrCode || null,
      paymentUrl: source.paymentUrl || null,
      txnNote: source.txnNote || "Payment for Order",
      txnRefId: source.txnRefId || generateTxnRefId(),
      upiId: source.upiId || "enpay1.skypal@fino",
      merchantVpa: source.merchantVpa || "enpay1.skypal@fino",
      merchantOrderId: source.merchantOrderId || `ORDER${Date.now()}`,
      "Commission Amount": source["Commission Amount"] || 0,
      createdAt: source.createdAt || new Date(),
      mid: source.mid || generateMid(),
      "Settlement Status": source.settlementStatus || webhookData?.settlementStatus || "Unsettled",
      "Vendor Ref ID": source["Vendor Ref ID"] || generateVendorRefId(),
      "Customer Name": source.customerName || source["Customer Name"] || webhookData?.customerName || null,
      "Customer VPA": source.customerVpa || source["Customer VPA"] || webhookData?.customerVpa || null,
      "Customer Contact No": source.customerContact || source["Customer Contact No"] || webhookData?.customerContact || null,
      "Failure Reasons": source.failureReason || source["Failure Reasons"] || webhookData?.failureReason || null,
      "Vendor Txn ID": source.vendorTxnId || source["Vendor Txn ID"] || webhookData?.vendorTxnId || null,
      enpayTxnId: source.enpayTxnId || webhookData?.enpayTxnId || null
    };

    // Check if already exists in main collection
    let mainTransaction = await Transaction.findOne({ 
      transactionId: transactionData.transactionId 
    });

    if (mainTransaction) {
      // Update existing transaction
      console.log(`🔄 Updating existing main transaction: ${mainTransaction.transactionId}`);
      Object.keys(transactionData).forEach(key => {
        if (transactionData[key] !== undefined && transactionData[key] !== null) {
          mainTransaction[key] = transactionData[key];
        }
      });
      await mainTransaction.save();
      console.log(`✅ Main transaction updated: ${mainTransaction.transactionId}`);
    } else {
      // Create new transaction in MAIN collection
      console.log("🆕 Creating new transaction in MAIN collection");
      mainTransaction = new Transaction(transactionData);
      
      // Validate before saving
      const validationError = mainTransaction.validateSync();
      if (validationError) {
        console.error("❌ Main Transaction Validation Error:", validationError.errors);
        throw new Error(`Main transaction validation failed: ${JSON.stringify(validationError.errors)}`);
      }
      
      await mainTransaction.save();
      console.log(`✅ New main transaction created: ${mainTransaction.transactionId}`);
    }

    return mainTransaction;

  } catch (error) {
    console.error("❌ Sync to Main Error:", error);
    throw error;
  }
};

export const getTransactions = async (req, res) => {
  try {
    const merchantId = req.user.id;
    console.log("🟡 Fetching transactions for merchant:", merchantId);

    // Fetch from the main Transaction collection ONLY
    const transactions = await Transaction.find({ 
      merchantId: new mongoose.Types.ObjectId(merchantId) 
    })
    .sort({ createdAt: -1 })
    .select('-__v');

    console.log(`✅ Found ${transactions.length} transactions in MAIN collection`);

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

export const generateDynamicQR = async (req, res) => {
  try {
    console.log("🟡 generateDynamicQR - Processing request...");
    console.log("Full req.body:", req.body);
    
    // Handle amount parsing with multiple fallbacks
    let amountValue = req.body.amount;
    let parsedAmount;

    // EMERGENCY FIX: Handle [object Object] case
    if (amountValue && typeof amountValue === 'object') {
      console.log("🚨 EMERGENCY: Amount is object, attempting recovery...");
      console.log("Object keys:", Object.keys(amountValue));
      
      // Try multiple extraction methods
      amountValue = amountValue.value || amountValue.amount || 
                   amountValue.data || Object.values(amountValue).find(val => 
                     typeof val === 'number' || (typeof val === 'string' && !isNaN(parseFloat(val)))
                   );
      
      console.log("Recovered amount value:", amountValue);
    }

    // Parse the amount
    if (typeof amountValue === 'number') {
      parsedAmount = amountValue;
    } else if (typeof amountValue === 'string') {
      parsedAmount = parseFloat(amountValue);
    } else if (amountValue === undefined || amountValue === null) {
      return res.status(400).json({
        code: 400,
        message: "Amount is required"
      });
    } else {
      // Final fallback
      try {
        const stringValue = String(amountValue).replace('[object Object]', '').trim();
        parsedAmount = parseFloat(stringValue);
      } catch (error) {
        return res.status(400).json({
          code: 400,
          message: `Invalid amount format: ${amountValue}`
        });
      }
    }

    console.log("🟡 Final parsed amount:", parsedAmount);

    // Validation
    if (isNaN(parsedAmount)) {
      return res.status(400).json({
        code: 400,
        message: `Amount must be a valid number. Received: ${amountValue}`
      });
    }

    if (parsedAmount <= 0) {
      return res.status(400).json({
        code: 400,
        message: "Amount must be greater than 0"
      });
    }

    const { txnNote = "Payment for Order" } = req.body;
    const merchantId = req.user.id;
    const merchantName = `${req.user.firstname || ''} ${req.user.lastname || ''}`.trim() || "SKYPAL SYSTEM PRIVATE LIMITED";

    console.log("✅ Amount validation passed:", parsedAmount);

    // Generate unique IDs
    const transactionId = generateTransactionId();
    const txnRefId = generateTxnRefId();
    const merchantOrderId = `ORDER${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const mid = generateMid();
    const vendorRefId = generateVendorRefId();

    // Create UPI URL and QR Code
    const upiId = "enpay1.skypal@fino";
    const paymentUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&am=${parsedAmount}&tn=${encodeURIComponent(txnNote)}&tr=${txnRefId}&cu=INR`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(paymentUrl)}`;

    // Data for BOTH collections
    const transactionData = {
      transactionId,
      merchantId: new mongoose.Types.ObjectId(merchantId),
      merchantName,
      amount: parsedAmount,
      status: "INITIATED",
      qrCode: qrCodeUrl,
      paymentUrl,
      txnNote,
      txnRefId,
      upiId,
      merchantVpa: upiId,
      merchantOrderId,
      mid,
      "Vendor Ref ID": vendorRefId,
      "Commission Amount": 0,
      "Settlement Status": "Unsettled",
      createdAt: new Date()
    };

    console.log("🟡 Transaction data for BOTH collections:", transactionData);

    // 🔥 CRITICAL: Save to BOTH collections
    let mainTransaction;
    let qrTransaction;

    try {
      // 1. First save to MAIN Transaction collection
      console.log("💾 Saving to MAIN Transaction collection...");
      mainTransaction = new Transaction(transactionData);
      await mainTransaction.save();
      console.log("✅ Saved to MAIN Transaction collection:", mainTransaction.transactionId);

      // 2. Then save to QR Transaction collection
      console.log("💾 Saving to QR Transaction collection...");
      qrTransaction = new QrTransaction(transactionData);
      await qrTransaction.save();
      console.log("✅ Saved to QR Transaction collection:", qrTransaction.transactionId);

    } catch (saveError) {
      console.error("❌ Error saving transactions:", saveError);
      
      // If one fails, try to save the other
      if (!mainTransaction) {
        console.log("🔄 Retrying MAIN transaction save...");
        mainTransaction = new Transaction(transactionData);
        await mainTransaction.save();
      }
      if (!qrTransaction) {
        console.log("🔄 Retrying QR transaction save...");
        qrTransaction = new QrTransaction(transactionData);
        await qrTransaction.save();
      }
    }

    // Response with data from MAIN collection
    res.json({
      code: 200,
      message: "QR generated successfully",
      transaction: {
        transactionId: mainTransaction.transactionId,
        amount: mainTransaction.amount,
        status: mainTransaction.status,
        upiId: mainTransaction.upiId,
        txnRefId: mainTransaction.txnRefId,
        qrCode: mainTransaction.qrCode,
        paymentUrl: mainTransaction.paymentUrl,
        txnNote: mainTransaction.txnNote,
        merchantName: mainTransaction.merchantName,
        createdAt: mainTransaction.createdAt,
        merchantOrderId: mainTransaction.merchantOrderId
      },
      qrCode: qrCodeUrl,
      upiUrl: paymentUrl,
      enpayInitiated: false,
      savedTo: {
        mainCollection: true,
        qrCollection: true
      }
    });

  } catch (error) {
    console.error("❌ QR Generation Error:", error);
    res.status(500).json({
      code: 500,
      message: "QR generation failed",
      error: error.message
    });
  }
};

export const generateDefaultQR = async (req, res) => {
  try {
    const merchantId = req.user.id;
    const merchantName = `${req.user.firstname || ''} ${req.user.lastname || ''}`.trim() || "SKYPAL SYSTEM PRIVATE LIMITED";

    console.log("🟡 Default QR Request from:", merchantName);

    // Generate unique IDs
    const transactionId = generateTransactionId();
    const txnRefId = generateTxnRefId();
    const merchantOrderId = `ORDER${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // Create UPI URL without amount
    const upiId = "enpay1.skypal@fino";
    const paymentUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&tn=Default%20QR%20Payment&tr=${txnRefId}&cu=INR`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(paymentUrl)}`;

    // Data for BOTH collections
    const transactionData = {
      transactionId: transactionId,
      merchantId: new mongoose.Types.ObjectId(merchantId),
      merchantName: merchantName,
      amount: 0,
      status: "INITIATED",
      qrCode: qrCodeUrl,
      paymentUrl: paymentUrl,
      txnNote: "Default QR Payment",
      txnRefId: txnRefId,
      upiId: upiId,
      merchantVpa: upiId,
      merchantOrderId: merchantOrderId,
      mid: generateMid(),
      "Vendor Ref ID": generateVendorRefId(),
      "Commission Amount": 0,
      "Settlement Status": "Unsettled",
      createdAt: new Date()
    };

    console.log("🟡 Default QR data for BOTH collections:", transactionData);

    // 🔥 CRITICAL: Save to BOTH collections
    let mainTransaction;
    let qrTransaction;

    try {
      // 1. First save to MAIN Transaction collection
      console.log("💾 Saving default QR to MAIN Transaction collection...");
      mainTransaction = new Transaction(transactionData);
      await mainTransaction.save();
      console.log("✅ Saved to MAIN Transaction collection:", mainTransaction.transactionId);

      // 2. Then save to QR Transaction collection
      console.log("💾 Saving default QR to QR Transaction collection...");
      qrTransaction = new QrTransaction(transactionData);
      await qrTransaction.save();
      console.log("✅ Saved to QR Transaction collection:", qrTransaction.transactionId);

    } catch (saveError) {
      console.error("❌ Error saving default QR:", saveError);
      
      // If one fails, try to save the other
      if (!mainTransaction) {
        console.log("🔄 Retrying MAIN transaction save...");
        mainTransaction = new Transaction(transactionData);
        await mainTransaction.save();
      }
    }

    res.json({
      code: 200,
      message: "Default QR generated successfully",
      transaction: {
        transactionId: mainTransaction.transactionId,
        amount: mainTransaction.amount,
        status: mainTransaction.status,
        upiId: mainTransaction.upiId,
        txnRefId: mainTransaction.txnRefId,
        qrCode: mainTransaction.qrCode,
        paymentUrl: mainTransaction.paymentUrl,
        txnNote: mainTransaction.txnNote,
        merchantName: mainTransaction.merchantName,
        createdAt: mainTransaction.createdAt,
        merchantOrderId: mainTransaction.merchantOrderId
      },
      qrCode: qrCodeUrl,
      upiUrl: paymentUrl,
      enpayInitiated: false,
      savedTo: {
        mainCollection: true,
        qrCollection: !!qrTransaction
      }
    });

  } catch (error) {
    console.error("❌ Default QR Error:", error);
    res.status(500).json({
      code: 500,
      message: "Default QR generation failed",
      error: error.message
    });
  }
};

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
      merchantOrderId,
      enpayTxnId,
      failureReason,
      vendorTxnId
    } = req.body;

    console.log("🟡 Webhook Received:", req.body);

    let qrTransaction;
    let mainTransaction;

    // First, try to find in MAIN Transaction collection
    if (transactionId) {
      mainTransaction = await Transaction.findOne({ transactionId });
    }
    if (!mainTransaction && merchantOrderId) {
      mainTransaction = await Transaction.findOne({ merchantOrderId });
    }
    if (!mainTransaction && txnRefId) {
      mainTransaction = await Transaction.findOne({ txnRefId });
    }

    // Also try to find in QR collection for reference
    if (transactionId) {
      qrTransaction = await QrTransaction.findOne({ transactionId });
    }

    if (mainTransaction) {
      console.log(`✅ Found in MAIN Transaction: ${mainTransaction.transactionId}, Current status: ${mainTransaction.status}`);

      const oldStatus = mainTransaction.status;

      // Update MAIN Transaction fields
      if (status) mainTransaction.status = status;
      if (upiId) mainTransaction.upiId = upiId;
      if (amount) mainTransaction.amount = parseFloat(amount);
      if (customerName) mainTransaction["Customer Name"] = customerName;
      if (customerVpa) mainTransaction["Customer VPA"] = customerVpa;
      if (customerContact) mainTransaction["Customer Contact No"] = customerContact;
      if (settlementStatus) mainTransaction["Settlement Status"] = settlementStatus;
      if (enpayTxnId) mainTransaction.enpayTxnId = enpayTxnId;
      if (failureReason) mainTransaction["Failure Reasons"] = failureReason;
      if (vendorTxnId) mainTransaction["Vendor Txn ID"] = vendorTxnId;

      await mainTransaction.save();
      console.log(`✅ MAIN Transaction ${mainTransaction.transactionId} updated from ${oldStatus} to: ${mainTransaction.status}`);

      // Also update QR transaction if exists
      if (qrTransaction) {
        if (status) qrTransaction.status = status;
        if (upiId) qrTransaction.upiId = upiId;
        if (amount) qrTransaction.amount = parseFloat(amount);
        await qrTransaction.save();
        console.log(`✅ QR Transaction also updated: ${qrTransaction.transactionId}`);
      }

      res.json({
        code: 200,
        message: "Webhook processed successfully",
        transactionId: mainTransaction.transactionId,
        oldStatus: oldStatus,
        newStatus: mainTransaction.status,
        amount: mainTransaction.amount,
        updatedIn: "main"
      });

    } else {
      console.log("❌ Transaction not found in MAIN collection. Creating new...");

      // Create new transaction in MAIN collection from webhook data
      const newTransactionData = {
        transactionId: transactionId || generateTransactionId(),
        merchantId: new mongoose.Types.ObjectId("60a7e6b0c2e3a4001c8c4f9f"), // Default merchant ID
        merchantName: "SKYPAL SYSTEM PRIVATE LIMITED",
        amount: parseFloat(amount) || 0,
        status: status || "SUCCESS",
        upiId: upiId || "customer@upi",
        txnRefId: txnRefId || generateTxnRefId(),
        merchantOrderId: merchantOrderId || `ORDER${Date.now()}`,
        "Commission Amount": 0,
        mid: generateMid(),
        "Settlement Status": settlementStatus || "Unsettled",
        "Vendor Ref ID": generateVendorRefId(),
        "Customer Name": customerName || null,
        "Customer VPA": customerVpa || null,
        "Customer Contact No": customerContact || null,
        "Failure Reasons": failureReason || null,
        "Vendor Txn ID": vendorTxnId || null,
        enpayTxnId: enpayTxnId || null,
        createdAt: new Date()
      };

      mainTransaction = new Transaction(newTransactionData);
      await mainTransaction.save();
      console.log(`✅ Created new MAIN transaction from webhook: ${mainTransaction.transactionId}`);

      res.json({
        code: 200,
        message: "Webhook processed successfully, new transaction created in MAIN collection",
        transactionId: mainTransaction.transactionId,
        status: mainTransaction.status,
        createdIn: "main"
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

// Other functions remain the same but only work with MAIN collection
export const checkTransactionStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const merchantId = req.user.id;

    console.log("🟡 Checking transaction status in MAIN collection:", { transactionId, merchantId });

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
      transaction: {
        transactionId: transaction.transactionId,
        status: transaction.status,
        amount: transaction.amount,
        upiId: transaction.upiId,
        txnRefId: transaction.txnRefId,
        createdAt: transaction.createdAt,
        settlementStatus: transaction["Settlement Status"]
      },
      collection: "main"
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
      collection: "main"
    });
  } catch (error) {
    console.error("❌ Get Details Error:", error);
    res.status(500).json({ 
      code: 500,
      message: error.message 
    });
  }
};

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
export const testMainCollection = async (req, res) => {
  try {
    const merchantId = req.user.id;
    
    const testTransaction = {
      transactionId: `TEST${Date.now()}`,
      merchantId: new mongoose.Types.ObjectId(merchantId),
      merchantName: "Test Merchant",
      amount: 100,
      status: "INITIATED",
      mid: "TESTMID",
      "Vendor Ref ID": "TESTVENDOR",
      "Commission Amount": 0,
      "Settlement Status": "Unsettled"
    };

    console.log("🧪 Testing MAIN collection save...");
    
    const mainTxn = new Transaction(testTransaction);
    await mainTxn.save();
    
    // Verify it's saved
    const verified = await Transaction.findOne({ transactionId: testTransaction.transactionId });
    
    res.json({
      code: 200,
      message: "Test completed",
      testData: testTransaction,
      saved: !!verified,
      verified: verified ? {
        transactionId: verified.transactionId,
        collection: "transactions"
      } : null
    });
    
  } catch (error) {
    console.error("❌ Test error:", error);
    res.status(500).json({
      code: 500,
      error: error.message
    });
  }
};

// Keep other existing functions (downloadReceipt, initiateRefund, etc.) as they are
// but ensure they only work with Transaction model (MAIN collection)

export const downloadReceipt = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const merchantId = req.user.id;

    console.log("🟡 Download receipt from MAIN collection:", { transactionId, merchantId });

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
      settlementStatus: transaction["Settlement Status"],
      collection: "main"
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