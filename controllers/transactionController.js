import Transaction from "../models/Transaction.js";
import QrTransaction from "../models/QrTransaction.js";
import mongoose from 'mongoose';

const generateTransactionId = () => `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateTxnRefId = () => `REF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
const generateMid = () => `MID${Date.now()}`;
const generateVendorRefId = () => `VENDORREF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

// सुधारित sync function
const syncQrTransactionToMain = async (qrTransaction, webhookData) => {
  try {
    let mainTransaction;
    const source = qrTransaction || webhookData;
    
    if (!source) {
      console.error("No data provided for sync");
      return null;
    }

    const transactionId = source.transactionId;
    
    // प्रथम Main Transaction मध्ये शोधा
    if (transactionId) {
      mainTransaction = await Transaction.findOne({ transactionId });
    }

    // Merchant ID तपासा
    const merchantId = source.merchantId;
    if (!merchantId) {
      console.error("No merchantId found for transaction:", transactionId);
      return null;
    }

    // Transaction data तयार करा
    const transactionData = {
      transactionId: transactionId,
      merchantId: new mongoose.Types.ObjectId(merchantId),
      merchantName: source.merchantName || "SKYPAL SYSTEM PRIVATE LIMITED",
      amount: parseFloat(source.amount) || 0,
      status: source.status || webhookData?.status || "PENDING",
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
      "Settlement Status": source["Settlement Status"] || webhookData?.settlementStatus || "Unsettled",
      "Vendor Ref ID": source["Vendor Ref ID"] || generateVendorRefId(),
      "Customer Name": source.customerName || source["Customer Name"] || webhookData?.customerName || null,
      "Customer VPA": source.customerVpa || source["Customer VPA"] || webhookData?.customerVpa || null,
      "Customer Contact No": source.customerContact || source["Customer Contact No"] || webhookData?.customerContact || null,
      "Failure Reasons": source.failureReason || source["Failure Reasons"] || webhookData?.failureReason || null,
      "Vendor Txn ID": source.vendorTxnId || source["Vendor Txn ID"] || webhookData?.vendorTxnId || null,
      enpayTxnId: source.enpayTxnId || webhookData?.enpayTxnId || null
    };

    console.log("Syncing transaction:", transactionId, "Data:", transactionData);

    // Main Transaction update किंवा create करा
    if (mainTransaction) {
      // Update existing transaction
      Object.keys(transactionData).forEach(key => {
        if (transactionData[key] !== undefined && transactionData[key] !== null && transactionData[key] !== "") {
          mainTransaction[key] = transactionData[key];
        }
      });
      
      const updated = await mainTransaction.save();
      console.log("Transaction updated:", updated.transactionId);
      return updated;
    } else {
      // Create new transaction
      const newMainTransaction = new Transaction(transactionData);
      const saved = await newMainTransaction.save();
      console.log("New transaction created:", saved.transactionId);
      return saved;
    }

  } catch (error) {
    console.error("Sync Error Details:", error);
    throw error;
  }
};
export const getTransactions = async (req, res) => {
  try {
    const merchantId = req.user.id;

    const transactions = await Transaction.find({ merchantId: new mongoose.Types.ObjectId(merchantId) })
      .sort({ createdAt: -1 })
      .select('-__v');

    res.json(transactions);

  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({
      code: 500,
      message: "Failed to fetch transactions",
      error: error.message
    });
  }
};

export const generateDynamicQR = async (req, res) => {
  try {
    let amountValue = req.body.amount;
    const { txnNote = "Payment for Order" } = req.body;
    const merchantId = req.user.id;
    const merchantName = `${req.user.firstname || ''} ${req.user.lastname || ''}`.trim() || "SKYPAL SYSTEM PRIVATE LIMITED";

    // Parse the amount
    let parsedAmount;
    
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
        const stringValue = String(amountValue);
        parsedAmount = parseFloat(stringValue);
      } catch (error) {
        return res.status(400).json({
          code: 400,
          message: `Invalid amount format. Could not parse: ${amountValue}`
        });
      }
    }

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

    const transactionId = generateTransactionId();
    const txnRefId = generateTxnRefId();
    const merchantOrderId = `ORDER${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const mid = generateMid();
    const vendorRefId = generateVendorRefId();

    const upiId = "enpay1.skypal@fino";
    const paymentUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&am=${parsedAmount}&tn=${encodeURIComponent(txnNote)}&tr=${txnRefId}&cu=INR`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(paymentUrl)}`;

    const qrTransactionData = {
      transactionId,
      merchantId,
      merchantName,
      amount: parsedAmount,
      status: "GENERATED",
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
      "Settlement Status": "NA"
    };

    // Save to QR collection
    const qrTransaction = new QrTransaction(qrTransactionData);
    await qrTransaction.save();

    // 🔥 CRITICAL: Immediately sync to main Transaction collection
    await syncQrTransactionToMain(qrTransaction, {});

    res.json({
      code: 200,
      message: "QR generated successfully",
      transaction: {
        transactionId: qrTransaction.transactionId,
        amount: qrTransaction.amount,
        status: qrTransaction.status,
        upiId: qrTransaction.upiId,
        txnRefId: qrTransaction.txnRefId,
        qrCode: qrTransaction.qrCode,
        paymentUrl: qrTransaction.paymentUrl,
        txnNote: qrTransaction.txnNote,
        merchantName: qrTransaction.merchantName,
        createdAt: qrTransaction.createdAt,
        merchantOrderId: qrTransaction.merchantOrderId
      },
      qrCode: qrCodeUrl,
      upiUrl: paymentUrl,
      enpayInitiated: false
    });

  } catch (error) {
    console.error("QR Generation Error:", error);
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

    const transactionId = generateTransactionId();
    const txnRefId = generateTxnRefId();
    const merchantOrderId = `ORDER${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const upiId = "enpay1.skypal@fino";
    const paymentUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&tn=Default%20QR%20Payment&tr=${txnRefId}&cu=INR`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(paymentUrl)}`;

    const qrTransactionData = {
      transactionId: transactionId,
      merchantId: merchantId,
      merchantName: merchantName,
      amount: 0,
      status: "GENERATED",
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
      "Settlement Status": "NA"
    };

    const qrTransaction = new QrTransaction(qrTransactionData);
    await qrTransaction.save();

    // 🔥 CRITICAL: Sync to main Transaction collection
    await syncQrTransactionToMain(qrTransaction, {});

    res.json({
      code: 200,
      message: "Default QR generated successfully",
      transaction: {
        transactionId: qrTransaction.transactionId,
        amount: qrTransaction.amount,
        status: qrTransaction.status,
        upiId: qrTransaction.upiId,
        txnRefId: qrTransaction.txnRefId,
        qrCode: qrTransaction.qrCode,
        paymentUrl: qrTransaction.paymentUrl,
        txnNote: qrTransaction.txnNote,
        merchantName: qrTransaction.merchantName,
        createdAt: qrTransaction.createdAt,
        merchantOrderId: qrTransaction.merchantOrderId
      },
      qrCode: qrCodeUrl,
      upiUrl: paymentUrl,
      enpayInitiated: false
    });

  } catch (error) {
    console.error("Default QR Error:", error);
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

    let qrTransaction;

    // Find the transaction in the QR collection
    if (transactionId) {
      qrTransaction = await QrTransaction.findOne({ transactionId });
    }
    if (!qrTransaction && merchantOrderId) {
      qrTransaction = await QrTransaction.findOne({ merchantOrderId });
    }
    if (!qrTransaction && txnRefId) {
      qrTransaction = await QrTransaction.findOne({ txnRefId });
    }

    if (qrTransaction) {
      const oldStatus = qrTransaction.status;

      // Update QrTransaction fields
      if (status) qrTransaction.status = status;
      if (upiId) qrTransaction.upiId = upiId;
      if (amount) qrTransaction.amount = parseFloat(amount);
      if (customerName) qrTransaction.customerName = customerName;
      if (customerVpa) qrTransaction.customerVpa = customerVpa;
      if (customerContact) qrTransaction.customerContact = customerContact;
      if (settlementStatus) qrTransaction.settlementStatus = settlementStatus;
      if (enpayTxnId) qrTransaction.enpayTxnId = enpayTxnId;
      if (failureReason) qrTransaction.enpayError = failureReason;
      if (vendorTxnId) qrTransaction["Vendor Txn ID"] = vendorTxnId;

      await qrTransaction.save();

      // 🔥 CRITICAL: Always sync to main Transaction collection
      const mainTransaction = await syncQrTransactionToMain(qrTransaction, req.body);

      res.json({
        code: 200,
        message: "Webhook processed successfully",
        transactionId: qrTransaction.transactionId,
        oldStatus: oldStatus,
        newStatus: qrTransaction.status,
        amount: qrTransaction.amount
      });
    } else {
      // If no QR transaction found, create directly in main collection
      const mainTransaction = await syncQrTransactionToMain(null, req.body);
      if (mainTransaction) {
        res.json({
          code: 200,
          message: "Webhook processed successfully, new transaction created in main collection.",
          transactionId: mainTransaction.transactionId,
          status: mainTransaction.status
        });
      } else {
        res.status(404).json({
          code: 404,
          message: "Transaction not found"
        });
      }
    }

  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(500).json({
      code: 500,
      message: "Webhook processing failed",
      error: error.message
    });
  }
};

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
        res.json({
          code: 200,
          message: "Webhook simulation completed",
          simulation: data
        });
      },
      status: (code) => ({
        json: (data) => {
          res.status(code).json(data);
        }
      })
    };

    await handlePaymentWebhook(fakeReq, fakeRes);

  } catch (error) {
    console.error("Simulation error:", error);
    res.status(500).json({
      code: 500,
      message: "Simulation failed",
      error: error.message
    });
  }
};

export const checkTransactionStatus = async (req, res) => {
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
    console.error("Check Status Error:", error);
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

    const transaction = await Transaction.findOne({ 
      transactionId, 
      merchantId 
    });

    if (!transaction) {
      return res.status(404).json({ 
        code: 404,
        message: "Transaction not found" 
      });
    }

    res.json({
      code: 200,
      transaction
    });
  } catch (error) {
    console.error("Get Details Error:", error);
    res.status(500).json({ 
      code: 500,
      message: error.message 
    });
  }
};

export const downloadReceipt = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const merchantId = req.user.id;

    const transaction = await Transaction.findOne({ 
      transactionId, 
      merchantId 
    });

    if (!transaction) {
      return res.status(404).json({ 
        code: 404,
        message: "Transaction not found" 
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
    console.error("Download Receipt Error:", error);
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
      merchantId 
    });

    if (!transaction) {
      return res.status(404).json({ 
        code: 404,
        message: "Transaction not found" 
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

    // Update transaction status to Refunded
    transaction.status = "Refunded";
    await transaction.save();

    res.json({
      code: 200,
      message: "Refund initiated successfully",
      refundId: `REF${Date.now()}`,
      transactionId: transactionId,
      refundAmount: refundAmount,
      originalAmount: transaction.amount,
      status: "Refunded"
    });

  } catch (error) {
    console.error("Refund Error:", error);
    res.status(500).json({ 
      code: 500,
      message: "Failed to initiate refund",
      error: error.message 
    });
  }
};

// Manual sync endpoint for existing QR transactions
export const syncAllQRToMain = async (req, res) => {
  try {
    const merchantId = req.user.id;
    
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
        }
      } catch (error) {
        console.error(`Failed to sync: ${qrTxn.transactionId}`, error);
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
    console.error("Manual sync error:", error);
    res.status(500).json({
      code: 500,
      message: "Manual sync failed",
      error: error.message
    });
  }
};