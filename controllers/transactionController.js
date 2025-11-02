// controllers/transactionController.js - COMPLETE VERSION
import Transaction from "../models/Transaction.js";

// Helper functions for ID generation
const generateTransactionId = () => `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateVendorRefId = () => `VENDORREF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
const generateMerchantOrderId = () => `ORDER${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateTxnRefId = () => `REF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
const generateMid = () => `MID${Date.now()}${Math.floor(Math.random() * 1000)}`;

// Get transactions for logged-in merchant
export const getTransactions = async (req, res) => {
  try {
    const merchantId = req.user.id;
    console.log("🟡 Fetching transactions for merchant:", merchantId);

    const transactions = await Transaction.find({ merchantId })
      .sort({ createdAt: -1 })
      .select('-__v');

    console.log(`✅ Found ${transactions.length} transactions for merchant ${merchantId}`);
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

// Generate QR with amount - EXACT SCHEMA COMPLIANT
export const generateDynamicQR = async (req, res) => {
  try {
    const { amount, txnNote = "Payment for Order", merchantOrderId } = req.body;
    const merchantId = req.user.id;
    const merchantName = `${req.user.firstname || ''} ${req.user.lastname || ''}`.trim() || "SKYPAL SYSTEM PRIVATE LIMITED";

    console.log("🟡 Dynamic QR Request:", { merchantId, merchantName, amount, txnNote });

    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({
        code: 400,
        message: "Valid amount is required and must be greater than 0"
      });
    }

    // Generate unique IDs for ALL required fields
    const transactionId = generateTransactionId();
    const vendorRefId = generateVendorRefId();
    const mid = generateMid();
    const orderId = merchantOrderId || generateMerchantOrderId();
    const txnRefId = generateTxnRefId();

    // Create UPI URL
    const upiUrl = `upi://pay?pa=enpay1.skypal@fino&pn=${encodeURIComponent(merchantName)}&am=${amount}&tn=${encodeURIComponent(txnNote)}&tr=${txnRefId}&cu=INR`;
    
    // QR Code image URL
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiUrl)}`;

    // Create transaction data - EXACTLY matching required schema
    const transactionData = {
      // REQUIRED FIELDS from schema validation
      transactionId: transactionId,
      amount: parseFloat(amount),
      "Commission Amount": 0, // Required field with space
      createdAt: new Date().toISOString(), // Required field as string
      merchantId: merchantId,
      merchantName: merchantName,
      mid: mid, // Required field
      "Settlement Status": "Unsettled", // Required field with space
      status: "INITIATED", // Required field
      "Vendor Ref ID": vendorRefId, // Required field with space

      // QR-specific fields
      merchantOrderId: orderId,
      merchantHashId: process.env.MERCHANT_HASH_ID || "MERCDSH51Y7CD4YJLFIZR8NF",
      currency: "INR",
      upiId: "enpay1.skypal@fino",
      qrCode: qrCodeUrl,
      paymentUrl: upiUrl,
      txnNote: txnNote,
      txnRefId: txnRefId,
      merchantVpa: "enpay1.skypal@fino",

      // Optional fields with null defaults
      "Customer Contact No": null,
      "Customer Name": null,
      "Customer VPA": null,
      "Failure Reasons": null,
      "Vendor Txn ID": null
    };

    console.log("🟡 Creating transaction with EXACT schema:", transactionData);

    // Create and save transaction
    const transaction = new Transaction(transactionData);
    
    // Validate before saving
    const validationError = transaction.validateSync();
    if (validationError) {
      console.error("❌ Validation Errors:", validationError.errors);
      return res.status(400).json({
        code: 400,
        message: "Validation failed",
        errors: Object.keys(validationError.errors).map(key => ({
          field: key,
          message: validationError.errors[key].message
        }))
      });
    }

    await transaction.save();
    console.log("✅ Transaction saved successfully:", transaction.transactionId);

    // Return response
    res.json({
      code: 200,
      message: "QR generated successfully",
      transaction: {
        transactionId: transaction.transactionId,
        merchantOrderId: transaction.merchantOrderId,
        amount: transaction.amount,
        status: transaction.status,
        upiId: transaction.upiId,
        txnRefId: transaction.txnRefId,
        qrCode: transaction.qrCode,
        paymentUrl: transaction.paymentUrl,
        txnNote: transaction.txnNote,
        merchantName: transaction.merchantName,
        createdAt: transaction.createdAt
      },
      qrCode: qrCodeUrl,
      upiUrl: upiUrl
    });

  } catch (error) {
    console.error("❌ QR Generation Error:", error);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        code: 400,
        message: "Validation failed",
        errors: validationErrors
      });
    }
    
    res.status(500).json({
      code: 500,
      message: "QR generation failed",
      error: error.message
    });
  }
};

// Generate default QR (without amount) - EXACT SCHEMA COMPLIANT
export const generateDefaultQR = async (req, res) => {
  try {
    const merchantId = req.user.id;
    const merchantName = `${req.user.firstname || ''} ${req.user.lastname || ''}`.trim() || "SKYPAL SYSTEM PRIVATE LIMITED";

    console.log("🟡 Default QR Request from:", merchantName);

    // Generate unique IDs for ALL required fields
    const transactionId = generateTransactionId();
    const vendorRefId = generateVendorRefId();
    const mid = generateMid();
    const orderId = generateMerchantOrderId();
    const txnRefId = generateTxnRefId();

    // Create UPI URL without amount
    const upiUrl = `upi://pay?pa=enpay1.skypal@fino&pn=${encodeURIComponent(merchantName)}&tn=Default%20QR%20Payment&tr=${txnRefId}&cu=INR`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiUrl)}`;

    // Create transaction data - EXACTLY matching required schema
    const transactionData = {
      // REQUIRED FIELDS from schema validation
      transactionId: transactionId,
      amount: 0, // Default QR has 0 amount
      "Commission Amount": 0, // Required field with space
      createdAt: new Date().toISOString(), // Required field as string
      merchantId: merchantId,
      merchantName: merchantName,
      mid: mid, // Required field
      "Settlement Status": "Unsettled", // Required field with space
      status: "INITIATED", // Required field
      "Vendor Ref ID": vendorRefId, // Required field with space

      // QR-specific fields
      merchantOrderId: orderId,
      merchantHashId: process.env.MERCHANT_HASH_ID || "MERCDSH51Y7CD4YJLFIZR8NF",
      currency: "INR",
      upiId: "enpay1.skypal@fino",
      qrCode: qrCodeUrl,
      paymentUrl: upiUrl,
      txnNote: "Default QR Payment",
      txnRefId: txnRefId,
      merchantVpa: "enpay1.skypal@fino",

      // Optional fields with null defaults
      "Customer Contact No": null,
      "Customer Name": null,
      "Customer VPA": null,
      "Failure Reasons": null,
      "Vendor Txn ID": null
    };

    console.log("🟡 Creating default QR transaction:", transactionData);

    // Validate before saving
    const testTransaction = new Transaction(transactionData);
    const validationError = testTransaction.validateSync();
    if (validationError) {
      console.error("❌ Validation Errors:", validationError.errors);
      return res.status(400).json({
        code: 400,
        message: "Validation failed",
        errors: Object.keys(validationError.errors).map(key => ({
          field: key,
          message: validationError.errors[key].message
        }))
      });
    }

    // Create and save transaction
    const transaction = new Transaction(transactionData);
    await transaction.save();

    console.log("✅ Default QR transaction saved:", transaction.transactionId);

    res.json({
      code: 200,
      message: "Default QR generated successfully",
      transaction: {
        transactionId: transaction.transactionId,
        merchantOrderId: transaction.merchantOrderId,
        amount: transaction.amount,
        status: transaction.status,
        upiId: transaction.upiId,
        txnRefId: transaction.txnRefId,
        qrCode: transaction.qrCode,
        paymentUrl: transaction.paymentUrl,
        txnNote: transaction.txnNote,
        merchantName: transaction.merchantName,
        createdAt: transaction.createdAt
      },
      qrCode: qrCodeUrl,
      upiUrl: upiUrl
    });

  } catch (error) {
    console.error("❌ Default QR Error:", error);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        code: 400,
        message: "Validation failed",
        errors: validationErrors
      });
    }
    
    res.status(500).json({
      code: 500,
      message: "Default QR generation failed",
      error: error.message
    });
  }
};

// Check Transaction Status
export const checkTransactionStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const merchantId = req.user.id;

    console.log("🟡 Checking transaction status:", { transactionId, merchantId });

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

// Get Transaction Details
export const getTransactionDetails = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const merchantId = req.user.id;

    console.log("🟡 Get transaction details:", { transactionId, merchantId });

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
    console.error("❌ Get Details Error:", error);
    res.status(500).json({ 
      code: 500,
      message: error.message 
    });
  }
};

// Download Receipt
export const downloadReceipt = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const merchantId = req.user.id;

    console.log("🟡 Download receipt request:", { transactionId, merchantId });

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

    // Generate receipt data
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

// Initiate Refund
export const initiateRefund = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { refundAmount, reason } = req.body;
    const merchantId = req.user.id;

    console.log("🟡 Refund request:", { transactionId, merchantId, refundAmount, reason });

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

    // Implement refund logic here
    console.log(`🟡 Refund initiated for: ${transactionId}, Amount: ${refundAmount}, Reason: ${reason}`);

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
    console.error("❌ Refund Error:", error);
    res.status(500).json({ 
      code: 500,
      message: "Failed to initiate refund",
      error: error.message 
    });
  }
};

// Webhook to update transaction status
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
      settlementStatus 
    } = req.body;

    console.log("🟡 Webhook Received:", req.body);

    let transaction;

    // Find transaction by transactionId or txnRefId
    if (transactionId) {
      transaction = await Transaction.findOne({ transactionId });
    } 
    if (!transaction && txnRefId) {
      transaction = await Transaction.findOne({ txnRefId });
    }

    if (transaction) {
      // Update transaction fields
      if (status) transaction.status = status;
      if (upiId) transaction.upiId = upiId;
      if (amount) transaction.amount = parseFloat(amount);
      if (customerName) transaction["Customer Name"] = customerName;
      if (customerVpa) transaction["Customer VPA"] = customerVpa;
      if (customerContact) transaction["Customer Contact No"] = customerContact;
      if (settlementStatus) transaction["Settlement Status"] = settlementStatus;
      
      await transaction.save();
      
      console.log(`✅ Transaction ${transaction.transactionId} updated to: ${status}`);
      
      res.json({ 
        code: 200, 
        message: "Webhook processed successfully",
        transactionId: transaction.transactionId,
        status: transaction.status
      });
    } else {
      console.log("❌ Transaction not found for webhook");
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

// Debug endpoint to check current transactions
export const debugTransactions = async (req, res) => {
  try {
    const merchantId = req.user.id;
    const transactions = await Transaction.find({ merchantId }).limit(5);
    const sample = await Transaction.findOne({ merchantId });
    
    // Check schema requirements
    const testData = {
      transactionId: "TEST123",
      amount: 100,
      "Commission Amount": 0,
      createdAt: new Date().toISOString(),
      merchantId: merchantId,
      merchantName: "Test Merchant",
      mid: "MIDTEST123",
      "Settlement Status": "Unsettled",
      status: "INITIATED",
      "Vendor Ref ID": "VENDORREFTEST123"
    };
    
    const testTransaction = new Transaction(testData);
    const validationError = testTransaction.validateSync();
    
    res.json({
      code: 200,
      merchantId,
      totalCount: await Transaction.countDocuments({ merchantId }),
      sampleTransaction: sample,
      recentTransactions: transactions,
      schemaTest: validationError ? {
        valid: false,
        errors: validationError.errors
      } : {
        valid: true,
        message: "Schema validation passed"
      },
      requiredFields: [
        "transactionId",
        "amount", 
        "Commission Amount",
        "createdAt",
        "merchantId",
        "merchantName", 
        "mid",
        "Settlement Status",
        "status",
        "Vendor Ref ID"
      ]
    });
  } catch (error) {
    res.status(500).json({ 
      code: 500,
      error: error.message 
    });
  }
};

// Schema check endpoint
export const checkSchema = async (req, res) => {
  try {
    const sampleDoc = {
      transactionId: "TEST123",
      merchantOrderId: "ORDER123", 
      merchantId: req.user.id,
      merchantName: "Test Merchant",
      amount: 100,
      status: "INITIATED"
    };
    
    const testTransaction = new Transaction(sampleDoc);
    const validationError = testTransaction.validateSync();
    
    res.json({
      code: 200,
      schemaPaths: Object.keys(Transaction.schema.paths),
      requiredFields: Object.keys(Transaction.schema.paths).filter(path => Transaction.schema.paths[path].isRequired),
      validationTest: validationError ? {
        valid: false,
        errors: validationError.errors
      } : {
        valid: true,
        message: "Schema validation passed"
      }
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      error: error.message
    });
  }
};