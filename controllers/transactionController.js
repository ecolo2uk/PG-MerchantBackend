import Transaction from '../models/Transaction.js';
import mongoose from 'mongoose';
import { generateEnpayDynamicQR, generateEnpayDefaultQR } from '../services/enpayService.js';

const generateTransactionId = () => `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateVendorRefId = () => `VENDOR${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

export const generateDynamicQR = async (req, res) => {
  let transaction;
  try {
    const { amount, txnNote = 'Payment for Order' } = req.body;
    const merchantId = req.user.id;
    const merchantName = req.user.firstname + ' ' + (req.user.lastname || '');

    console.log('🟡 Generate Dynamic QR - Start:', { amount, merchantId, merchantName });

    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required and must be greater than 0'
      });
    }

    // ✅ ENFORCE ENPAY MINIMUM AMOUNT
    const MINIMUM_ENPAY_AMOUNT = 100;
    if (parsedAmount < MINIMUM_ENPAY_AMOUNT) {
      return res.status(400).json({
        success: false,
        message: `Transaction amount must be at least ${MINIMUM_ENPAY_AMOUNT} INR`
      });
    }

    const transactionId = generateTransactionId();
    const vendorRefId = generateVendorRefId();

    // Create transaction data - SIMPLIFIED
    const transactionData = {
      transactionId,
      merchantId: merchantId,
      merchantName,
      amount: parsedAmount,
      status: 'INITIATED', // ✅ FIXED: Use INITIATED instead of WAITING FOR PAYMENT
      createdAt: new Date().toISOString(),
      "Commission Amount": 0,
      mid: req.user.mid || 'DEFAULT_MID',
      "Settlement Status": "UNSETTLED",
      "Vendor Ref ID": vendorRefId,
      txnNote,
      upiId: 'enpay1.skypal@fino',
      merchantVpa: 'enpay1.skypal@fino',
      merchantOrderId: `ORDER${Date.now()}`,
      txnRefId: transactionId,
      merchantHashId: 'MERCOSHESYYCDAYOLFTZR8MF'
    };

    console.log('🟡 Transaction Data Before Save:', transactionData);

    // ✅ FIRST SAVE TRANSACTION TO DATABASE
    transaction = new Transaction(transactionData);
    let savedTransaction = await transaction.save();
    console.log('✅ Transaction saved to database:', savedTransaction.transactionId);

    // ✅ THEN CALL ENPAY API
    console.log('🟡 Calling Enpay API...');
    const enpayResult = await generateEnpayDynamicQR(transactionData);

    if (enpayResult.success) {
      // ✅ UPDATE TRANSACTION WITH ENPAY DATA
      savedTransaction.enpayInitiationStatus = 'ATTEMPTED_SUCCESS';
      savedTransaction.enpayQRCode = enpayResult.enpayQRCode;
      savedTransaction.enpayTxnId = enpayResult.enpayTxnId;
      
      // Generate local QR as well
      const paymentUrl = `upi://pay?pa=enpay1.skypal@fino&pn=${encodeURIComponent(merchantName)}&am=${parsedAmount}&tn=${encodeURIComponent(txnNote)}&tr=${transactionId}`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(paymentUrl)}`;

      savedTransaction.qrCode = qrCodeUrl;
      savedTransaction.paymentUrl = paymentUrl;

      await savedTransaction.save();
      console.log('✅ Transaction updated with Enpay data');

    } else {
      // ✅ UPDATE TRANSACTION WITH ENPAY FAILURE
      savedTransaction.enpayInitiationStatus = 'ATTEMPTED_FAILED';
      savedTransaction.enpayError = enpayResult.error;
      
      // Generate local QR as fallback
      const paymentUrl = `upi://pay?pa=enpay1.skypal@fino&pn=${encodeURIComponent(merchantName)}&am=${parsedAmount}&tn=${encodeURIComponent(txnNote)}&tr=${transactionId}`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(paymentUrl)}`;

      savedTransaction.qrCode = qrCodeUrl;
      savedTransaction.paymentUrl = paymentUrl;

      await savedTransaction.save();
      console.log('✅ Transaction updated with fallback QR');
    }

    // ✅ RELOAD THE SAVED TRANSACTION
    savedTransaction = await Transaction.findById(savedTransaction._id);

    res.status(200).json({
      success: true,
      transactionId: savedTransaction.transactionId,
      qrCode: savedTransaction.qrCode,
      paymentUrl: savedTransaction.paymentUrl,
      amount: savedTransaction.amount,
      enpayTxnId: savedTransaction.enpayTxnId,
      status: savedTransaction.status, // ✅ IMPORTANT: Send status back
      message: enpayResult.success ? 'QR generated with Enpay' : 'QR generated with fallback method',
      fallback: !enpayResult.success
    });

  } catch (error) {
    console.error('❌ Generate QR Error:', error);
    
    // If transaction was created but something else failed, update it
    if (transaction && transaction._id) {
      try {
        await Transaction.findByIdAndUpdate(transaction._id, {
          status: 'FAILED',
          enpayInitiationStatus: 'ATTEMPTED_FAILED',
          enpayError: error.message
        });
      } catch (updateError) {
        console.error('❌ Failed to update transaction status:', updateError);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Failed to generate QR',
      error: error.message
    });
  }
};

export const generateDefaultQR = async (req, res) => {
  let transaction;
  try {
    console.log('🔵 generateDefaultQR - Start');

    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const merchantId = req.user.id;
    const merchantName = req.user.firstname + ' ' + (req.user.lastname || '');

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
      "Settlement Status": "UNSETTLED",
      status: 'INITIATED', // ✅ FIXED: Use INITIATED
      "Vendor Ref ID": vendorRefId,
      txnNote: 'Default QR Code',
      upiId: 'enpay1.skypal@fino',
      merchantVpa: 'enpay1.skypal@fino',
      merchantOrderId: `ORDER${Date.now()}`,
      txnRefId: transactionId,
      merchantHashId: 'MERCOSHESYYCDAYOLFTZR8MF'
    };

    console.log('🔵 Default QR Transaction Data:', transactionData);

    // ✅ FIRST SAVE TRANSACTION
    transaction = new Transaction(transactionData);
    let savedTransaction = await transaction.save();
    console.log('✅ Default QR Transaction saved:', savedTransaction.transactionId);

    // ✅ CALL ENPAY API
    const enpayResult = await generateEnpayDefaultQR(transactionData);

    if (enpayResult.success) {
      savedTransaction.enpayInitiationStatus = 'ATTEMPTED_SUCCESS';
      savedTransaction.enpayQRCode = enpayResult.enpayQRCode;
      savedTransaction.enpayTxnId = enpayResult.enpayTxnId;
    } else {
      savedTransaction.enpayInitiationStatus = 'ATTEMPTED_FAILED';
      savedTransaction.enpayError = enpayResult.error;
    }

    // Generate local QR
    const paymentUrl = `upi://pay?pa=enpay1.skypal@fino&pn=${encodeURIComponent(merchantName)}&am=${DEFAULT_ENPAY_AMOUNT}&tn=Default%20QR%20Code`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(paymentUrl)}`;

    savedTransaction.qrCode = qrCodeUrl;
    savedTransaction.paymentUrl = paymentUrl;

    await savedTransaction.save();

    // ✅ RELOAD THE SAVED TRANSACTION
    savedTransaction = await Transaction.findById(savedTransaction._id);

    console.log('✅ Default QR completed successfully');

    res.status(200).json({
      success: true,
      transactionId: savedTransaction.transactionId,
      qrCode: savedTransaction.qrCode,
      paymentUrl: savedTransaction.paymentUrl,
      amount: savedTransaction.amount,
      enpayTxnId: savedTransaction.enpayTxnId,
      status: savedTransaction.status, // ✅ IMPORTANT
      isDefault: true,
      message: 'Default QR generated successfully'
    });

  } catch (error) {
    console.error('❌ generateDefaultQR Error:', error);
    
    if (transaction && transaction._id) {
      try {
        await Transaction.findByIdAndUpdate(transaction._id, {
          status: 'FAILED',
          enpayInitiationStatus: 'ATTEMPTED_FAILED',
          enpayError: error.message
        });
      } catch (updateError) {
        console.error('❌ Failed to update default transaction status:', updateError);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Failed to generate default QR',
      error: error.message
    });
  }
};

export const getTransactions = async (req, res) => {
  try {
    const merchantId = req.user.id;
    console.log("🟡 Fetching transactions for merchant:", merchantId);

    // ✅ IMPROVED QUERY - Handle both string and ObjectId
    const transactions = await Transaction.find({ 
      $or: [
        { merchantId: merchantId },
        { merchantId: { $toString: merchantId } }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(100);

    console.log(`✅ Found ${transactions.length} transactions for merchant ${merchantId}`);

    res.json(transactions);

  } catch (error) {
    console.error("❌ Error fetching transactions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transactions",
      error: error.message
    });
  }
};

// transactionController.js मध्ये add करा
export const testEnpayConnection = async (req, res) => {
  try {
    console.log('🧪 Testing Enpay connection directly...');
    
    const testPayload = {
      merchantHashId: 'MERCOSHESYYCDAYOLFTZR8MF',
      txnAmount: '100',
      txnNote: 'Test Connection',
      txnRefId: `TEST${Date.now()}`
    };

    const axios = require('axios');
    
    console.log('🟡 Sending request to Enpay API...');
    const response = await axios.post(
      'https://api.enpay.in/enpay-product-service/api/v1/merchant-gateway/dynamicQR',
      testPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Merchant-Key': '0851439b-03df-4983-88d6-32399b1e4514',
          'X-Merchant-Secret': 'bae97f533a594af9bf3dded47f09c34e15e053d1'
        },
        timeout: 30000
      }
    );

    console.log('✅ Enpay Direct Test Response:', response.data);

    res.json({
      success: true,
      enpayStatus: response.data.code === 0 ? 'Working' : 'Error',
      enpayResponse: response.data,
      message: 'Enpay API test completed successfully'
    });

  } catch (error) {
    console.error('❌ Enpay Direct Test Failed:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
      message: 'Enpay API test failed'
    });
  }
};

// ... rest of your controller functions remain the same
// export const getTransactions = async (req, res) => {
//   try {
//     const merchantId = req.user.id;
//     console.log("🟡 Fetching transactions for merchant:", merchantId);

//     const transactions = await Transaction.find({ 
//       $or: [
//         { merchantId: merchantId },
//         { merchantId: new mongoose.Types.ObjectId(merchantId) }
//       ]
//     })
//     .sort({ createdAt: -1 })
//     .select('-__v');

//     console.log(`✅ Found ${transactions.length} transactions`);

//     res.json(transactions);

//   } catch (error) {
//     console.error("❌ Error fetching transactions:", error);
//     res.status(500).json({
//       code: 500,
//       message: "Failed to fetch transactions",
//       error: error.message
//     });
//   }
// };

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


// controllers/transactionController.js मध्ये add करा
export const testEnpayDirect = async (req, res) => {
  try {
    const request = require('request');
    
    const options = {
      'method': 'POST',
      'url': 'https://api.enpay.in/enpay-product-service/api/v1/merchant-gateway/dynamicQR',
      'headers': {
        'Content-Type': 'application/json',
        'X-Merchant-Key': '0851439b-03df-4983-88d6-32399b1e4514',
        'X-Merchant-Secret': 'bae97f533a594af9bf3dded47f09c34e15e053d1'
      },
      body: JSON.stringify({
        "merchantHashId": "MERCDSH51Y7CD4YJLFIZR8NF",
        "txnAmount": "100",
        "txnNote": "Test Payment",
        "txnRefId": "TEST123456"
      })
    };

    request(options, function (error, response) {
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      res.json(JSON.parse(response.body));
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


// Test different API structures
export const testEnpayEndpoints = async (req, res) => {
  try {
    const endpointsToTest = [
      '/dynamicQR',
      'dynamicQR', 
      '/generate-dynamic-qr',
      '/qr/generate',
      '/generateQR',
      '/v1/dynamicQR',
      '/merchant-gateway/dynamicQR'
    ];

    const testResults = [];

    for (const endpoint of endpointsToTest) {
      try {
        const payload = {
          merchantHashId: 'MERCDSH51Y7CD4YJLFIZR8NF',
          txnAmount: '100',
          txnNote: 'Test Payment',
          txnRefId: `TEST${Date.now()}`
        };

        console.log(`🧪 Testing endpoint: ${endpoint}`);
        
        const response = await enpayApi.post(endpoint, payload);
        testResults.push({
          endpoint,
          status: 'SUCCESS',
          data: response.data
        });
        break; // Stop at first success
        
      } catch (error) {
        testResults.push({
          endpoint, 
          status: 'FAILED',
          error: error.response?.data || error.message
        });
      }
    }

    res.json({
      success: true,
      testResults,
      workingEndpoint: testResults.find(r => r.status === 'SUCCESS')?.endpoint
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
// Create a test script to share with Enpay support
export const enpayDebugScript = async (req, res) => {
  const debugInfo = {
    timestamp: new Date().toISOString(),
    baseURL: ENPAY_CONFIG.baseURL,
    endpointsTested: [
      'POST /dynamicQR',
      'POST /generate-dynamic-qr', 
      'POST /qr/generate'
    ],
    headers: {
      'X-Merchant-Key': '***' + ENPAY_CONFIG.merchantKey.slice(-4),
      'X-Merchant-Secret': '***' + ENPAY_CONFIG.merchantSecret.slice(-4),
      'Content-Type': 'application/json'
    },
    samplePayload: {
      merchantHashId: ENPAY_CONFIG.merchantHashId,
      txnAmount: "100",
      txnNote: "Test Payment",
      txnRefId: "TEST123456"
    },
    error: '405 Method Not Allowed - Please verify the correct API endpoint'
  };

  res.json(debugInfo);
};

export const simpleDebug = async (req, res) => {
  try {
    console.log('🔧 Simple Debug Endpoint Hit');
    
    // Check database connection
    const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
    
    // Check if transactions collection exists
    const collections = await mongoose.connection.db.listCollections().toArray();
    const hasTransactions = collections.some(col => col.name === 'transactions');
    
    // Get sample transaction
    const sampleTransaction = await Transaction.findOne();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus,
        hasTransactionsCollection: hasTransactions,
        sampleTransaction: sampleTransaction
      },
      merchant: req.user ? {
        id: req.user.id,
        name: req.user.firstname + ' ' + (req.user.lastname || '')
      } : 'No merchant info',
      message: 'Debug information collected'
    });
    
  } catch (error) {
    console.error('❌ Simple Debug Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};