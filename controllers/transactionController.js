import Transaction from '../models/Transaction.js';
import mongoose from 'mongoose';
import { generateEnpayDynamicQR, generateEnpayDefaultQR } from '../services/enpayService.js';

const generateTransactionId = () => `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateVendorRefId = () => `VENDOR${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

export const generateDynamicQR = async (req, res) => {
  try {
    const { amount, txnNote = 'Payment for Order' } = req.body;
    const merchantId = req.user.id;
    const merchantName = req.user.name || 'Merchant';

    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        code: 400,
        message: 'Valid amount is required and must be greater than 0'
      });
    }

    // ✅ ENFORCE ENPAY MINIMUM AMOUNT
    const MINIMUM_ENPAY_AMOUNT = 100;
    if (parsedAmount < MINIMUM_ENPAY_AMOUNT) {
      return res.status(400).json({
        code: 400,
        message: `Transaction amount must be at least ${MINIMUM_ENPAY_AMOUNT} INR`
      });
    }

    const transactionId = generateTransactionId();
    const vendorRefId = generateVendorRefId();

    const transactionData = {
      transactionId,
      merchantId: merchantId,
      merchantName,
      amount: parsedAmount,
      status: 'INITIATED',
      createdAt: new Date().toISOString(),
      "Commission Amount": 0,
      mid: req.user.mid || 'DEFAULT_MID',
      "Settlement Status": "NA",
      "Vendor Ref ID": vendorRefId,
      txnNote,
      upiId: 'enpay1.skypal@fino',
      merchantVpa: 'enpay1.skypal@fino',
      merchantOrderId: `ORDER${Date.now()}`,
      txnRefId: transactionId,
      merchantHashId: 'MERCDSH51Y7CD4YJLFIZR8NF'
    };

    console.log('🟡 Calling Enpay API with amount:', parsedAmount);

    // Call Enpay API
    const enpayResult = await generateEnpayDynamicQR(transactionData);

    if (!enpayResult.success) {
      // Save failed transaction attempt
      transactionData.status = 'FAILED';
      transactionData.enpayInitiationStatus = 'ATTEMPTED_FAILED';
      transactionData.enpayError = enpayResult.error;

      const transaction = new Transaction(transactionData);
      await transaction.save();

      return res.status(500).json({
        code: 500,
        success: false,
        message: 'Enpay API call failed',
        error: enpayResult.error
      });
    }

    // Save successful transaction
    transactionData.enpayInitiationStatus = 'ATTEMPTED_SUCCESS';
    transactionData.enpayQRCode = enpayResult.enpayQRCode;
    transactionData.enpayTxnId = enpayResult.enpayTxnId;
    transactionData.status = 'INITIATED';

    // Generate local QR as fallback
    const paymentUrl = `upi://pay?pa=enpay1.skypal@fino&pn=${encodeURIComponent(merchantName)}&am=${parsedAmount}&tn=${encodeURIComponent(txnNote)}&tr=${transactionId}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(paymentUrl)}`;

    transactionData.qrCode = qrCodeUrl;
    transactionData.paymentUrl = paymentUrl;

    const transaction = new Transaction(transactionData);
    const savedTransaction = await transaction.save();

    console.log('✅ QR Saved successfully with Enpay integration');

    res.status(200).json({
      success: true,
      transactionId: savedTransaction.transactionId,
      qrCode: savedTransaction.enpayQRCode ? `data:image/png;base64,${savedTransaction.enpayQRCode}` : savedTransaction.qrCode,
      paymentUrl: savedTransaction.paymentUrl,
      amount: parsedAmount,
      enpayTxnId: savedTransaction.enpayTxnId,
      message: 'QR generated successfully with Enpay integration'
    });

  } catch (error) {
    console.error('❌ Generate QR Error:', error);
    res.status(500).json({
      code: 500,
      message: 'Failed to generate QR',
      error: error.message
    });
  }
};

export const generateDefaultQR = async (req, res) => {
  try {
    console.log('🔵 generateDefaultQR - Start');

    if (!req.user || !req.user.id) {
      return res.status(401).json({
        code: 401,
        success: false,
        message: 'User authentication required'
      });
    }

    const merchantId = req.user.id;
    const merchantName = req.user.name || 'Default Merchant';

    const transactionId = `DFT${Date.now()}`;
    const vendorRefId = generateVendorRefId();

    // ✅ FIXED: Use minimum allowed amount for default QR
    const DEFAULT_ENPAY_AMOUNT = 100;

    const transactionData = {
      transactionId,
      merchantId: merchantId,
      merchantName,
      amount: DEFAULT_ENPAY_AMOUNT,
      "Commission Amount": 0,
      createdAt: new Date().toISOString(),
      mid: req.user.mid || 'DEFAULT_MID',
      "Settlement Status": "NA",
      status: 'INITIATED',
      "Vendor Ref ID": vendorRefId,
      txnNote: 'Default QR Code',
      upiId: 'enpay1.skypal@fino',
      merchantVpa: 'enpay1.skypal@fino',
      merchantOrderId: `ORDER${Date.now()}`,
      txnRefId: transactionId,
      merchantHashId: 'MERCDSH51Y7CD4YJLFIZR8NF'
    };

    console.log('🔵 Calling Enpay API for Default QR with amount:', DEFAULT_ENPAY_AMOUNT);

    const enpayResult = await generateEnpayDefaultQR(transactionData);

    if (!enpayResult.success) {
      transactionData.status = 'FAILED';
      transactionData.enpayInitiationStatus = 'ATTEMPTED_FAILED';
      transactionData.enpayError = enpayResult.error;

      const transaction = new Transaction(transactionData);
      await transaction.save();

      return res.status(500).json({
        code: 500,
        success: false,
        message: 'Enpay API call failed for default QR',
        error: enpayResult.error
      });
    }

    // Save successful default QR transaction
    transactionData.enpayInitiationStatus = 'ATTEMPTED_SUCCESS';
    transactionData.enpayQRCode = enpayResult.enpayQRCode;
    transactionData.enpayTxnId = enpayResult.enpayTxnId;
    transactionData.status = 'INITIATED';

    // Generate local QR
    const paymentUrl = `upi://pay?pa=enpay1.skypal@fino&pn=${encodeURIComponent(merchantName)}&am=${DEFAULT_ENPAY_AMOUNT}&tn=Default%20QR%20Code`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(paymentUrl)}`;

    transactionData.qrCode = qrCodeUrl;
    transactionData.paymentUrl = paymentUrl;

    const transaction = new Transaction(transactionData);
    const savedTransaction = await transaction.save();

    console.log('✅ Default QR saved successfully with Enpay integration');

    res.status(200).json({
      success: true,
      transactionId: savedTransaction.transactionId,
      qrCode: savedTransaction.enpayQRCode ? `data:image/png;base64,${savedTransaction.enpayQRCode}` : savedTransaction.qrCode,
      paymentUrl: savedTransaction.paymentUrl,
      amount: savedTransaction.amount,
      enpayTxnId: savedTransaction.enpayTxnId,
      isDefault: true,
      message: 'Default QR generated successfully with Enpay integration'
    });

  } catch (error) {
    console.error('❌ generateDefaultQR Error:', error);
    res.status(500).json({
      code: 500,
      success: false,
      message: 'Failed to generate default QR',
      error: error.message
    });
  }
};

// ✅ REMOVED: Duplicate generateEnpayDynamicQR function - it's already in enpayService.js

export const testEnpayConnection = async (req, res) => {
  try {
    console.log('🧪 Testing Enpay connection...');
    
    const testPayload = {
      merchantHashId: 'MERCDSH51Y7CD4YJLFIZR8NF',
      txnAmount: '100', // Minimum amount
      txnNote: 'Test Connection',
      txnRefId: `TEST${Date.now()}`
    };

    const response = await enpayApi.post('/dynamicQR', testPayload);
    
    console.log('🧪 Enpay Test Response:', response.data);

    res.json({
      success: true,
      enpayStatus: response.data.code === 0 ? 'Working' : 'Error',
      enpayResponse: response.data,
      message: 'Enpay API test completed'
    });

  } catch (error) {
    console.error('🧪 Enpay Test Failed:', error.response?.data || error.message);
    
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
      message: 'Enpay API test failed'
    });
  }
};

// ... rest of your controller functions remain the same
export const getTransactions = async (req, res) => {
  try {
    const merchantId = req.user.id;
    console.log("🟡 Fetching transactions for merchant:", merchantId);

    const transactions = await Transaction.find({ 
      $or: [
        { merchantId: merchantId },
        { merchantId: new mongoose.Types.ObjectId(merchantId) }
      ]
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

// ... other functions (checkTransactionStatus, testConnection, handlePaymentWebhook, etc.)
// Other functions remain the same...
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

// Test Connection
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

// Handle Payment Webhook
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

// Get Transaction Details
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
      collection: "transactions"
    });
  } catch (error) {
    console.error("❌ Get Details Error:", error);
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

// Initiate Refund
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

// Simulate Payment Webhook
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

// Add to your transactionController.js
export const debugSchema = async (req, res) => {
  try {
    const sampleDoc = await Transaction.findOne();
    // FIX 1: Use mongoose.connection.db for db commands
    const validationResult = await mongoose.connection.db.command({
      validate: "transactions",
      full: true
    });

    res.json({
      sampleDocument: sampleDoc,
      validation: validationResult,
      collectionStats: await Transaction.db.collection('transactions').stats()
    });
  } catch (error) {
    console.error("❌ Debug Schema Error:", error); // Added error logging
    res.status(500).json({ error: error.message });
  }
};

export const fixSchema = async (req, res) => {
  try {
    // FIX 1: Use mongoose.connection.db for db commands
    await mongoose.connection.db.command({
      collMod: "transactions",
      validator: {}
    });

    res.json({ message: "Schema validation disabled", success: true });
  } catch (error) {
    console.error("❌ Fix Schema Error:", error); // Added error logging
    res.status(500).json({ error: error.message });
  }
};