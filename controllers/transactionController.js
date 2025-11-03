import  Transaction  from '../models/Transaction.js';
import QrTransaction from '../models/QrTransaction.js';
import mongoose from 'mongoose';

const generateTransactionId = () => `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateTxnRefId = () => `REF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
const generateVendorRefId = () => `VENDOR${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

// Generate Dynamic QR
// Generate Dynamic QR - FIXED VERSION
export const generateDynamicQR = async (req, res) => {
  try {
    const { amount, txnNote = 'Payment for Order' } = req.body;
    const merchantId = req.user.id;
    const merchantName = req.user.name || 'Merchant';

    // Generate unique IDs
    const transactionId = `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const vendorRefId = `VENDOR${Date.now()}`;

    // ✅ COMPLETE data that matches schema
    const transactionData = {
      transactionId,
      merchantId: new mongoose.Types.ObjectId(merchantId),
      merchantName,
      amount: Number(amount),
      "Commission Amount": 0,
      createdAt: new Date().toISOString(), // ✅ REQUIRED FIELD
      mid: req.user.mid || 'DEFAULT_MID',
      "Settlement Status": "NA",
      status: 'GENERATED',
      "Vendor Ref ID": vendorRefId,
      // Optional fields but include them
      txnNote,
      upiId: 'enpay1.skypal@fino',
      merchantVpa: 'enpay1.skypal@fino'
    };

    console.log('🟡 Transaction Data:', transactionData);

    // Generate QR code URL
    const paymentUrl = `upi://pay?pa=enpay1.skypal@fino&pn=${encodeURIComponent(merchantName)}&am=${amount}&tn=${txnNote}&tr=${transactionId}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(paymentUrl)}`;

    // Add QR data
    transactionData.qrCode = qrCodeUrl;
    transactionData.paymentUrl = paymentUrl;

    const transaction = new Transaction(transactionData);
    await transaction.save();

    console.log('✅ QR Saved successfully in transactions collection');

    res.status(200).json({
      success: true,
      transactionId: transaction.transactionId,
      qrCode: qrCodeUrl,
      paymentUrl: paymentUrl,
      amount: amount,
      message: 'QR generated successfully'
    });

  } catch (error) {
    console.error('❌ Generate QR Error:', error);
    
    // Detailed error log
    console.error('❌ Validation Error Details:', {
      name: error.name,
      message: error.message,
      errors: error.errors
    });

    res.status(500).json({
      code: 500,
      message: 'Failed to generate QR',
      error: error.message,
      errorType: error.name
    });
  }
};

// Generate Default QR - FIXED VERSION
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

    // Generate IDs
    const transactionId = `DFT${Date.now()}`;
    const vendorRefId = `VENDOR${Date.now()}`;

    // ✅ COMPLETE data matching schema
    const transactionData = {
      transactionId: transactionId,
      merchantId: new mongoose.Types.ObjectId(merchantId),
      merchantName: merchantName,
      amount: 0,
      "Commission Amount": 0,
      createdAt: new Date().toISOString(), // ✅ REQUIRED
      mid: req.user.mid || 'DEFAULT_MID',
      "Settlement Status": "NA",
      status: 'GENERATED',
      "Vendor Ref ID": vendorRefId,
      txnNote: 'Default QR Code',
      upiId: 'enpay1.skypal@fino',
      merchantVpa: 'enpay1.skypal@fino'
    };

    console.log('🔵 Transaction Data prepared:', transactionData);

    // Generate QR URLs
    const paymentUrl = `upi://pay?pa=enpay1.skypal@fino&pn=${encodeURIComponent(merchantName)}&am=0&tn=Default%20QR`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(paymentUrl)}`;

    // Add QR data
    transactionData.qrCode = qrCodeUrl;
    transactionData.paymentUrl = paymentUrl;

    console.log('🔵 Final data with QR:', transactionData);

    // Save to database
    const transaction = new Transaction(transactionData);
    const savedTransaction = await transaction.save();
    
    console.log('✅ Default QR saved successfully');

    // Success response
    res.status(200).json({
      success: true,
      transactionId: savedTransaction.transactionId,
      qrCode: savedTransaction.qrCode,
      paymentUrl: savedTransaction.paymentUrl,
      amount: savedTransaction.amount,
      isDefault: true,
      message: 'Default QR generated successfully'
    });

  } catch (error) {
    console.error('❌ generateDefaultQR Error:', error);
    
    // Detailed error information
    console.error('❌ ERROR DETAILS:', {
      name: error.name,
      message: error.message,
      code: error.code,
      keyPattern: error.keyPattern,
      keyValue: error.keyValue,
      errors: error.errors
    });

    res.status(500).json({
      code: 500,
      success: false,
      message: 'Failed to generate default QR',
      error: error.message,
      errorType: error.name
    });
  }
};

// Debug endpoints
export const testSchemaValidation = async (req, res) => {
  try {
    console.log('🔍 Testing schema validation...');
    
    const testData = {
      transactionId: `TEST${Date.now()}`,
      merchantId: req.user.id,
      merchantName: 'Test Merchant',
      amount: 0,
      status: 'GENERATED',
      mid: 'TEST_MID',
      "Vendor Ref ID": `VENDOR${Date.now()}`,
      "Commission Amount": 0,
      "Settlement Status": "NA",
      upiId: 'enpay1.skypal@fino',
      merchantVpa: 'enpay1.skypal@fino',
      txnNote: 'Test QR'
    };

    console.log('🔍 Test data:', testData);

    // Test model creation
    const testDoc = new QrTransaction(testData);
    
    // Test validation
    const validationError = testDoc.validateSync();
    if (validationError) {
      console.log('❌ Validation errors found:');
      Object.keys(validationError.errors).forEach(key => {
        console.log(`  - ${key}: ${validationError.errors[key].message}`);
      });
      
      return res.json({
        success: false,
        message: 'Schema validation failed',
        errors: validationError.errors
      });
    }

    console.log('✅ Schema validation passed');
    
    res.json({
      success: true,
      message: 'Schema validation successful',
      testData: testData
    });

  } catch (error) {
    console.error('❌ Schema test error:', error);
    res.status(500).json({
      success: false,
      message: 'Schema test failed',
      error: error.message
    });
  }
};

export const testDatabaseConnection = async (req, res) => {
  try {
    console.log('🔍 Testing database connection...');
    
    // Test count
    const count = await QrTransaction.countDocuments();
    
    // Test simple save
    const testDoc = new QrTransaction({
      transactionId: `DBTEST${Date.now()}`,
      merchantId: req.user.id,
      merchantName: 'DB Test',
      amount: 0,
      status: 'GENERATED'
    });
    
    await testDoc.save();
    
    // Clean up
    await QrTransaction.deleteOne({ transactionId: testDoc.transactionId });
    
    res.json({
      success: true,
      message: 'Database connection working',
      count: count
    });
    
  } catch (error) {
    console.error('❌ Database test error:', error);
    res.status(500).json({
      success: false,
      message: 'Database test failed',
      error: error.message
    });
  }
};

// Debug Simple Endpoint
export const debugDefaultQRSimple = async (req, res) => {
  try {
    console.log('🔍 DEBUG SIMPLE: Testing basic functionality');
    
    if (!req.user) {
      return res.status(401).json({
        code: 401,
        message: 'No user object'
      });
    }

    console.log('🔍 User:', {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email
    });

    // Test basic response
    res.json({
      success: true,
      message: 'Debug endpoint working',
      user: {
        id: req.user.id,
        name: req.user.name
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('🔍 Debug error:', error);
    res.status(500).json({
      code: 500,
      message: 'Debug failed',
      error: error.message,
      stack: error.stack
    });
  }
};

// Get Transactions
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

// Check Transaction Status
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

// Download Receipt
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