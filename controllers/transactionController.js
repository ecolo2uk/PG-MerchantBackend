import Transaction from '../models/Transaction.js';
import mongoose from 'mongoose';
import axios from 'axios';

const generateTransactionId = () => `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateVendorRefId = () => `VENDOR${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

// ✅ ENPAY API FUNCTION - UPDATED WITH BETTER ERROR HANDLING
export const generateEnpayDynamicQR = async (transactionData) => {
  try {
    const { amount, txnNote, transactionId, merchantName } = transactionData;
    
    console.log('🟡 REAL: Generating QR with Enpay API');
    
    const payload = {
      merchantHashId: 'MERCOSHESYYCDAYOLFTZR8MF',
      txnNote: txnNote || 'Payment for Order',
      txnRefId: transactionId
    };

    // Add amount only if provided (for dynamic QR)
    if (amount && amount > 0) {
      payload.txnAmount = amount.toString();
    }

    console.log('🟡 Enpay API Payload:', JSON.stringify(payload, null, 2));

    const response = await axios.post(
      'https://api.enpay.in/enpay-product-service/api/v1/merchant-gateway/dynamicQR',
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Merchant-Key': '0851439b-03df-4983-88d6-32399b1e4514',
          'X-Merchant-Secret': 'bae97f533a594af9bf3dded47f09c34e15e053d1'
        },
        timeout: 30000
      }
    );

    console.log('✅ Enpay API Response:', response.data);

    if (response.data.code === 0) {
      return {
        success: true,
        enpayResponse: response.data,
        qrData: response.data.details,
        message: 'QR generated successfully via Enpay'
      };
    } else {
      console.error('❌ Enpay API Error Response:', response.data);
      throw new Error(response.data.message || `Enpay API error: ${response.data.code}`);
    }
    
  } catch (error) {
    console.error('❌ Enpay API Error Details:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
      config: {
        url: error.config?.url,
        data: error.config?.data
      }
    });
    
    return {
      success: false,
      message: `Enpay API failed: ${error.response?.data?.message || error.message}`,
      errorDetails: error.response?.data
    };
  }
};

// ✅ FIXED testEnpayConnection function
export const testEnpayConnection = async (req, res) => {
  try {
    console.log('🧪 Testing Enpay connection directly...');
    
    const testPayload = {
      merchantHashId: 'MERCOSHESYYCDAYOLFTZR8MF',
      txnAmount: '100',
      txnNote: 'Test Connection',
      txnRefId: `TEST${Date.now()}`
    };

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

export const getTransactions = async (req, res) => {
  try {
    const merchantId = req.user.id;
    console.log("🟡 Fetching transactions for merchant:", merchantId);

    const transactions = await Transaction.find({ 
      merchantId: merchantId 
    })
    .sort({ createdAt: -1 })
    .limit(50);

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

export const simpleDebug = async (req, res) => {
  try {
    console.log('🔧 Simple Debug Endpoint Hit');
    
    const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
    
    const collections = await mongoose.connection.db.listCollections().toArray();
    const hasTransactions = collections.some(col => col.name === 'transactions');
    
    const sampleTransaction = await Transaction.findOne();
    const transactionCount = await Transaction.countDocuments();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus,
        hasTransactionsCollection: hasTransactions,
        transactionCount: transactionCount,
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

export const generateDynamicQR = async (req, res) => {
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

    const MINIMUM_AMOUNT = 100;
    if (parsedAmount < MINIMUM_AMOUNT) {
      return res.status(400).json({
        success: false,
        message: `Amount must be at least ${MINIMUM_AMOUNT} INR`
      });
    }

    const transactionId = generateTransactionId();
    const vendorRefId = generateVendorRefId();

    // ✅ TRANSACTION DATA
    const transactionData = {
      transactionId,
      merchantId: merchantId,
      merchantName,
      amount: parsedAmount,
      status: 'INITIATED',
      createdAt: new Date().toISOString(),
      "Commission Amount": 0,
      mid: req.user.mid || 'DEFAULT_MID',
      "Settlement Status": "UNSETTLED",
      "Vendor Ref ID": vendorRefId,
      txnNote,
      upiId: 'enpay1.skypal@fino',
      merchantVpa: 'enpay1.skypal@fino',
      merchantOrderId: `ORDER${Date.now()}`,
      txnRefId: transactionId
    };

    console.log('🟡 Creating transaction:', transactionData);

    // ✅ SAVE TRANSACTION FIRST
    const transaction = new Transaction(transactionData);
    const savedTransaction = await transaction.save();
    
    console.log('✅ Transaction saved successfully:', savedTransaction.transactionId);

    // ✅ ENPAY API CALL - WITH BETTER ERROR HANDLING
    console.log('🟡 Calling Enpay API for QR generation...');
    const enpayResult = await generateEnpayDynamicQR({
      amount: parsedAmount,
      txnNote,
      transactionId,
      merchantName
    });

    // Check if Enpay API was successful
    if (!enpayResult.success) {
      console.log('❌ Enpay API failed, using fallback QR generation...');
      
      // ✅ FALLBACK: Generate QR without Enpay
      const paymentUrl = `upi://pay?pa=enpay1.skypal@fino&pn=${encodeURIComponent(merchantName)}&am=${parsedAmount}&tn=${encodeURIComponent(txnNote)}&tr=${transactionId}`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(paymentUrl)}`;

      // Update with fallback QR code
      savedTransaction.qrCode = qrCodeUrl;
      savedTransaction.paymentUrl = paymentUrl;
      savedTransaction.enpayResponse = { 
        fallback: true,
        message: 'Used fallback QR generation',
        error: enpayResult.message
      };
      await savedTransaction.save();

      console.log('✅ QR Code generated via fallback successfully');

      return res.status(200).json({
        success: true,
        transactionId: savedTransaction.transactionId,
        qrCode: qrCodeUrl,
        paymentUrl: paymentUrl,
        amount: savedTransaction.amount,
        status: savedTransaction.status,
        isFallback: true,
        enpayError: enpayResult.message,
        message: 'QR generated with fallback method'
      });
    }

    console.log('✅ Enpay API success, using Enpay QR data');

    // ✅ SUCCESS: Use Enpay QR data
    const qrCodeUrl = enpayResult.enpayResponse.details;
    const paymentUrl = `upi://pay?pa=enpay1.skypal@fino&pn=${encodeURIComponent(merchantName)}&am=${parsedAmount}&tn=${encodeURIComponent(txnNote)}&tr=${transactionId}`;

    // UPDATE TRANSACTION WITH ENPAY DATA
    savedTransaction.qrCode = qrCodeUrl;
    savedTransaction.paymentUrl = paymentUrl;
    savedTransaction.enpayResponse = enpayResult.enpayResponse;
    await savedTransaction.save();

    console.log('✅ QR Code generated via Enpay successfully');

    res.status(200).json({
      success: true,
      transactionId: savedTransaction.transactionId,
      qrCode: qrCodeUrl,
      paymentUrl: paymentUrl,
      amount: savedTransaction.amount,
      status: savedTransaction.status,
      enpayResponse: enpayResult.enpayResponse,
      message: 'QR generated successfully via Enpay'
    });

  } catch (error) {
    console.error('❌ Generate QR Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate QR',
      error: error.message
    });
  }
};


// ✅ TEST ENPAY API DIRECTLY
export const testEnpayDirectAPI = async (req, res) => {
  try {
    console.log('🧪 Testing Enpay API directly with sample data...');
    
    const testPayload = {
      merchantHashId: 'MERCOSHESYYCDAYOLFTZR8MF',
      txnAmount: '100',
      txnNote: 'Test Payment',
      txnRefId: `TEST${Date.now()}`
    };

    console.log('🟡 Test Payload:', testPayload);

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
      testPayload,
      enpayResponse: response.data,
      message: 'Enpay API test completed'
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



export const generateDefaultQR = async (req, res) => {
  try {
    console.log('🔵 Generate Default QR - Start');

    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const merchantId = req.user.id;
    const merchantName = req.user.firstname + ' ' + (req.user.lastname || '');

    const transactionId = `DFT${Date.now()}`;
    const vendorRefId = `VENDOR${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const transactionData = {
      transactionId,
      merchantId: merchantId,
      merchantName,
      createdAt: new Date().toISOString(),
      mid: req.user.mid || 'DEFAULT_MID',
      "Settlement Status": "UNSETTLED",
      status: 'INITIATED',
      "Vendor Ref ID": vendorRefId,
      txnNote: 'Default QR Code',
      upiId: 'enpay1.skypal@fino',
      merchantVpa: 'enpay1.skypal@fino',
      merchantOrderId: `ORDER${Date.now()}`,
      txnRefId: transactionId,
      isDefaultQR: true
    };

    console.log('🔵 Creating default QR transaction (no amount):', transactionData);

    const transaction = new Transaction(transactionData);
    const savedTransaction = await transaction.save();
    
    console.log('✅ Default QR transaction saved:', savedTransaction.transactionId);

    // ✅ ENPAY API CALL FOR DEFAULT QR
    console.log('🟡 Calling Enpay API for default QR...');
    
    const enpayResult = await generateEnpayDynamicQR({
      amount: null,
      txnNote: 'Default QR Code',
      transactionId,
      merchantName
    });

    if (!enpayResult.success) {
      console.log('🟡 Enpay API failed, using fallback QR generation');
      
      // Fallback: Generate QR without Enpay
      const paymentUrl = `upi://pay?pa=enpay1.skypal@fino&pn=${encodeURIComponent(merchantName)}&tn=Default%20QR%20Code`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(paymentUrl)}`;

      savedTransaction.qrCode = qrCodeUrl;
      savedTransaction.paymentUrl = paymentUrl;
      savedTransaction.enpayResponse = { 
        fallback: true,
        message: 'Used fallback QR generation' 
      };
      await savedTransaction.save();

      console.log('✅ Default QR (fallback) generated successfully');

      return res.status(200).json({
        success: true,
        transactionId: savedTransaction.transactionId,
        qrCode: qrCodeUrl,
        paymentUrl: paymentUrl,
        status: savedTransaction.status,
        isDefault: true,
        isFallback: true,
        message: 'Default QR generated with fallback method'
      });
    }

    // ✅ SUCCESS: Use Enpay QR data
    console.log('✅ Enpay API success, using Enpay QR data');
    
    const qrCodeUrl = enpayResult.qrData || enpayResult.enpayResponse?.details;
    const paymentUrl = `upi://pay?pa=enpay1.skypal@fino&pn=${encodeURIComponent(merchantName)}&tn=Default%20QR%20Code`;

    savedTransaction.qrCode = qrCodeUrl;
    savedTransaction.paymentUrl = paymentUrl;
    savedTransaction.enpayResponse = enpayResult.enpayResponse;
    await savedTransaction.save();

    console.log('✅ Default QR (via Enpay) generated successfully');

    res.status(200).json({
      success: true,
      transactionId: savedTransaction.transactionId,
      qrCode: qrCodeUrl,
      paymentUrl: paymentUrl,
      status: savedTransaction.status,
      isDefault: true,
      isFallback: false,
      enpayResponse: enpayResult.enpayResponse,
      message: 'Default QR generated successfully via Enpay'
    });

  } catch (error) {
    console.error('❌ Generate Default QR Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate default QR',
      error: error.message
    });
  }
};

// ... other functions remain the same

// ... other functions remain the same
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

export const testConnection = async (req, res) => {
  try {
    const merchantId = req.user.id;
    
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

export const getTransactionDetails = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const merchantId = req.user.id;

    console.log("🟡 Get transaction details:", { transactionId, merchantId });

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

// ... remove duplicate functions and imports that are causing conflicts

// Remove these duplicate imports and functions:
// import { generateEnpayDynamicQR, generateEnpayDefaultQR } from '../services/enpayService.js';
// Remove the duplicate generateEnpayDynamicQR function that was at line 225