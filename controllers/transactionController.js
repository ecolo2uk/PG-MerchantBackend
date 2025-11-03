import Transaction from "../models/Transaction.js";
import QrTransaction from "../models/QrTransaction.js";
import mongoose from 'mongoose';

const generateTransactionId = () => `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateTxnRefId = () => `REF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
const generateMid = () => `MID${Date.now()}`;
const generateVendorRefId = () => `VENDORREF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

// 🔥 MAIN FIX: Direct save to Transaction collection
export const generateDynamicQR = async (req, res) => {
  try {
    console.log("🟡 generateDynamicQR - Processing request...");
    console.log("Full req.body:", req.body);
    
    // Handle amount parsing
    let amountValue = req.body.amount;
    let parsedAmount;

    // Handle [object Object] case
    if (amountValue && typeof amountValue === 'object') {
      console.log("🚨 EMERGENCY: Amount is object, attempting recovery...");
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

    // 🔥 CRITICAL: Data for MAIN TRANSACTION collection only
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

    console.log("🟡 Saving to MAIN Transaction collection:", transactionData);

    // 🔥 ONLY SAVE TO MAIN TRANSACTION COLLECTION
    let mainTransaction;
    try {
      mainTransaction = new Transaction(transactionData);
      
      // Validate before saving
      const validationError = mainTransaction.validateSync();
      if (validationError) {
        console.error("❌ Transaction Validation Error:", validationError.errors);
        return res.status(400).json({
          code: 400,
          message: `Transaction validation failed: ${JSON.stringify(validationError.errors)}`
        });
      }
      
      await mainTransaction.save();
      console.log("✅ SUCCESS: Saved to MAIN Transaction collection:", mainTransaction.transactionId);

    } catch (saveError) {
      console.error("❌ Error saving to MAIN Transaction:", saveError);
      return res.status(500).json({
        code: 500,
        message: "Failed to save transaction to main collection",
        error: saveError.message
      });
    }

    // Optional: Also save to QR collection if needed for tracking
    try {
      const qrTransaction = new QrTransaction(transactionData);
      await qrTransaction.save();
      console.log("✅ Also saved to QR collection for reference:", qrTransaction.transactionId);
    } catch (qrError) {
      console.log("⚠️ QR collection save failed, but main transaction saved:", qrError.message);
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
      savedTo: "transactions" // 🔥 Confirm it's saved to main collection
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

    // Data for MAIN TRANSACTION collection
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

    console.log("🟡 Saving default QR to MAIN Transaction collection:", transactionData);

    // 🔥 ONLY SAVE TO MAIN TRANSACTION COLLECTION
    let mainTransaction;
    try {
      mainTransaction = new Transaction(transactionData);
      
      // Validate before saving
      const validationError = mainTransaction.validateSync();
      if (validationError) {
        console.error("❌ Transaction Validation Error:", validationError.errors);
        return res.status(400).json({
          code: 400,
          message: `Transaction validation failed: ${JSON.stringify(validationError.errors)}`
        });
      }
      
      await mainTransaction.save();
      console.log("✅ SUCCESS: Default QR saved to MAIN Transaction collection:", mainTransaction.transactionId);

    } catch (saveError) {
      console.error("❌ Error saving default QR to MAIN Transaction:", saveError);
      return res.status(500).json({
        code: 500,
        message: "Failed to save default QR to main collection",
        error: saveError.message
      });
    }

    // Optional: Also save to QR collection
    try {
      const qrTransaction = new QrTransaction(transactionData);
      await qrTransaction.save();
      console.log("✅ Also saved to QR collection for reference:", qrTransaction.transactionId);
    } catch (qrError) {
      console.log("⚠️ QR collection save failed, but main transaction saved:", qrError.message);
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
      savedTo: "transactions" // 🔥 Confirm it's saved to main collection
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

export const getTransactions = async (req, res) => {
  try {
    const merchantId = req.user.id;
    console.log("🟡 Fetching transactions from MAIN collection for merchant:", merchantId);

    // Fetch ONLY from main Transaction collection
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

    console.log("🟡 Webhook Received - Updating MAIN collection:", req.body);

    let mainTransaction;

    // Find in MAIN Transaction collection
    if (transactionId) {
      mainTransaction = await Transaction.findOne({ transactionId });
    }
    if (!mainTransaction && merchantOrderId) {
      mainTransaction = await Transaction.findOne({ merchantOrderId });
    }
    if (!mainTransaction && txnRefId) {
      mainTransaction = await Transaction.findOne({ txnRefId });
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

      res.json({
        code: 200,
        message: "Webhook processed successfully",
        transactionId: mainTransaction.transactionId,
        oldStatus: oldStatus,
        newStatus: mainTransaction.status,
        amount: mainTransaction.amount,
        updatedIn: "transactions" // 🔥 Confirm update in main collection
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
        createdIn: "transactions" // 🔥 Confirm creation in main collection
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
      collection: "transactions" // 🔥 Confirm from main collection
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

export const initiateRefund = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { refundAmount, reason } = req.body;
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
        message: "Refund only available for successful transactions" 
      });
    }

    if (refundAmount > transaction.amount) {
      return res.status(400).json({ 
        code: 400,
        message: "Refund amount cannot exceed original transaction amount" 
      });
    }

    transaction.status = "REFUNDED";
    await transaction.save();

    res.json({
      code: 200,
      message: "Refund initiated successfully",
      refundId: `REF${Date.now()}`,
      transactionId: transactionId,
      refundAmount: refundAmount,
      originalAmount: transaction.amount,
      status: "REFUNDED"
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