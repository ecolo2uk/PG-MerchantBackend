import Transaction from '../models/Transaction.js';
import mongoose from 'mongoose';
import axios from 'axios';

const generateTransactionId = () => `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateVendorRefId = () => `VENDOR${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;



export const getMerchantConnectorAccount = async (merchantId) => {
  try {
    console.log('🟡 Fetching merchant connector account for:', merchantId);
    
    const connectorAccount = await mongoose.connection.db.collection('merchantconnectoraccounts')
      .findOne({ 
        merchantId: new mongoose.Types.ObjectId(merchantId),
        status: "Active"
      });

    console.log('✅ Merchant Connector Account:', connectorAccount);
    return connectorAccount;
    
  } catch (error) {
    console.error('❌ Error fetching merchant connector account:', error);
    return null;
  }
};

// ✅ UPDATED ENPAY API FUNCTION WITH DYNAMIC MERCHANT DATA
export const generateEnpayDynamicQR = async (transactionData, merchantConnectorAccount) => {
  try {
    const { amount, txnNote, transactionId, merchantName } = transactionData;
    
    console.log('🟡 REAL: Generating QR with Dynamic Merchant Data');
    
    if (!merchantConnectorAccount) {
      throw new Error('Merchant connector account not found');
    }

    // ✅ DYNAMIC DATA FROM CONNECTOR ACCOUNT
    const payload = {
      merchantHashId: merchantConnectorAccount.merchantHashId || 'MERCDSH51Y7CD4YJLFIZR8NF',
      txnNote: txnNote || 'Payment for Order',
      txnRefId: transactionId
    };

    // Add amount only if provided and valid
    if (amount && amount > 0) {
      const MINIMUM_ENPAY_AMOUNT = 600;
      if (amount < MINIMUM_ENPAY_AMOUNT) {
        throw new Error(`Enpay requires minimum amount of ${MINIMUM_ENPAY_AMOUNT} INR`);
      }
      payload.txnAmount = amount.toString();
    }

    console.log('🟡 Dynamic Enpay API Payload:', JSON.stringify(payload, null, 2));

    // ✅ DYNAMIC API KEYS FROM CONNECTOR ACCOUNT
    const response = await axios.post(
      merchantConnectorAccount.baseUrl || 'https://api.enpay.in/enpay-product-service/api/v1/merchant-gateway/dynamicQR',
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Merchant-Key': merchantConnectorAccount.xMerchantKey || '0851439b-03df-4983-88d6-32399b1e4514',
          'X-Merchant-Secret': merchantConnectorAccount.xMerchantSecret || 'bae97f533a594af9bf3dded47f09c34e15e053d1'
        },
        timeout: 30000
      }
    );

    console.log('✅ Dynamic Enpay API Response:', response.data);

    if (response.data.code === 0) {
      return {
        success: true,
        enpayResponse: response.data,
        qrData: response.data.details,
        message: 'QR generated successfully via Enpay with dynamic merchant data'
      };
    } else {
      console.error('❌ Enpay API Error Response:', response.data);
      throw new Error(response.data.message || `Enpay API error: ${response.data.code}`);
    }
    
  } catch (error) {
    console.error('❌ Dynamic Enpay API Error:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    
    return {
      success: false,
      message: `Enpay API failed: ${error.response?.data?.message || error.message}`,
      errorDetails: error.response?.data
    };
  }
};

// ✅ TEST ALL POSSIBLE MERCHANT IDs
export const testAllMerchantIDs = async (req, res) => {
  try {
    console.log('🧪 Testing all possible Merchant IDs...');
    
    const merchantIDs = [
      'MERCOSH51Y7CDAYJLFIZR8M',      // From your first screenshot
      'MERCOSH51Y7CDAYJLF12R6MF',     // From your second screenshot  
      'MERCDSH51Y7CD4YJLFIZR8NF',     // From your working Postman
      'MERCOSHESYYCDAYOLFTZR8MF'      // From your previous code
    ];

    const testResults = [];

    for (const merchantId of merchantIDs) {
      try {
        const testPayload = {
          merchantHashId: merchantId,
          txnAmount: '100.00',
          txnNote: 'Test Merchant ID',
          txnRefId: `TEST${Date.now()}${Math.random().toString(36).substr(2, 5)}`
        };

        console.log(`🟡 Testing Merchant ID: ${merchantId}`);
        
        const response = await axios.post(
          'https://api.enpay.in/enpay-product-service/api/v1/merchant-gateway/dynamicQR',
          testPayload,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Merchant-Key': '0851439b-03df-4983-88d6-32399b1e4514',
              'X-Merchant-Secret': 'bae97f533a594af9bf3dded47f09c34e15e053d1'
            },
            timeout: 15000
          }
        );

        testResults.push({
          merchantId,
          status: 'SUCCESS',
          response: response.data
        });

        console.log(`✅ Merchant ID ${merchantId} WORKING:`, response.data);

        // Stop at first success
        if (response.data.code === 0) {
          console.log(`🎯 WORKING MERCHANT ID FOUND: ${merchantId}`);
          break;
        }

      } catch (error) {
        console.log(`❌ Merchant ID ${merchantId} FAILED:`, error.response?.data || error.message);
        testResults.push({
          merchantId,
          status: 'FAILED',
          error: error.response?.data || error.message
        });
      }
    }

    const workingMerchant = testResults.find(r => r.status === 'SUCCESS' && r.response?.code === 0);

    res.json({
      success: !!workingMerchant,
      testResults,
      workingMerchantId: workingMerchant?.merchantId,
      message: workingMerchant ? 'Working Merchant ID found!' : 'No working Merchant ID found'
    });

  } catch (error) {
    console.error('❌ Merchant ID Test Failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
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

    // ✅ STEP 1: GET MERCHANT CONNECTOR ACCOUNT
    const merchantConnectorAccount = await getMerchantConnectorAccount(merchantId);
    
    if (!merchantConnectorAccount) {
      return res.status(400).json({
        success: false,
        message: 'No active connector account found for this merchant. Please contact admin.'
      });
    }

    console.log('✅ Merchant Connector Account Found:', {
      terminalId: merchantConnectorAccount.terminalId,
      merchantHashId: merchantConnectorAccount.merchantHashId,
      connector: merchantConnectorAccount.connectorId
    });

    const parsedAmount = parseFloat(amount);
    const transactionId = generateTransactionId();
    const vendorRefId = generateVendorRefId();

    // ✅ TRANSACTION DATA WITH CONNECTOR INFO
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
      txnRefId: transactionId,
      // ✅ ADD CONNECTOR ACCOUNT INFO
      terminalId: merchantConnectorAccount.terminalId,
      connectorAccountId: merchantConnectorAccount._id,
      connectorId: merchantConnectorAccount.connectorId
    };

    console.log('🟡 Creating transaction with connector data:', transactionData);

    // ✅ SAVE TRANSACTION FIRST
    const transaction = new Transaction(transactionData);
    const savedTransaction = await transaction.save();
    
    console.log('✅ Transaction saved successfully:', savedTransaction.transactionId);

    // ✅ ENPAY API CALL - WITH DYNAMIC MERCHANT DATA
    console.log('🟡 Calling Enpay API with dynamic merchant data...');
    const enpayResult = await generateEnpayDynamicQR({
      amount: parsedAmount,
      txnNote,
      transactionId,
      merchantName
    }, merchantConnectorAccount);

    console.log('🟡 Enpay API Result:', enpayResult);

    // Handle success/fallback logic...
    // (rest of the code remains same as before)

  } catch (error) {
    console.error('❌ Generate QR Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate QR',
      error: error.message
    });
  }
};

// ✅ TEST ENPAY API DIRECTLY - WITH CORRECT MERCHANT ID
// ✅ UPDATED TEST FUNCTION WITH HIGHER AMOUNT
export const testEnpayDirectAPI = async (req, res) => {
  try {
    console.log('🧪 Testing Enpay API directly with correct amount...');
    
    const testPayload = {
      merchantHashId: 'MERCDSH51Y7CD4YJLFIZR8NF', // ✅ WORKING MERCHANT ID
      txnAmount: '600.00', // ✅ MINIMUM AMOUNT FOR ENPAY
      txnNote: 'Test Payment from Backend API',
      txnRefId: `TEST${Date.now()}`
    };

    console.log('🟡 Test Payload:', JSON.stringify(testPayload, null, 2));

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

    console.log('✅ Enpay Direct Test Success:', response.data);

    res.json({
      success: true,
      testPayload,
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

// ✅ FIND EXACT MINIMUM AMOUNT
export const testAmountThreshold = async (req, res) => {
  try {
    console.log('🧪 Testing different amounts to find minimum threshold...');
    
    const amountsToTest = [1000, 2000, 5000, 10000, 20000, 50000];
    const testResults = [];

    for (const amount of amountsToTest) {
      try {
        const testPayload = {
          merchantHashId: 'MERCDSH51Y7CD4YJLFIZR8NF',
          txnAmount: amount.toString(),
          txnNote: 'Test Amount Threshold',
          txnRefId: `AMTTEST${Date.now()}${amount}`
        };

        console.log(`🟡 Testing amount: ${amount}`);
        
        const response = await axios.post(
          'https://api.enpay.in/enpay-product-service/api/v1/merchant-gateway/dynamicQR',
          testPayload,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Merchant-Key': '0851439b-03df-4983-88d6-32399b1e4514',
              'X-Merchant-Secret': 'bae97f533a594af9bf3dded47f09c34e15e053d1'
            },
            timeout: 15000
          }
        );

        testResults.push({
          amount,
          status: 'SUCCESS',
          response: response.data
        });

        console.log(`✅ Amount ${amount} WORKING:`, response.data.code === 0 ? 'QR Generated' : 'API Error');

        if (response.data.code === 0) {
          console.log(`🎯 MINIMUM AMOUNT FOUND: ${amount}`);
          break;
        }

      } catch (error) {
        console.log(`❌ Amount ${amount} FAILED:`, error.response?.data?.message || error.message);
        testResults.push({
          amount,
          status: 'FAILED',
          error: error.response?.data || error.message
        });
      }
    }

    const workingAmount = testResults.find(r => r.status === 'SUCCESS' && r.response?.code === 0);

    res.json({
      success: !!workingAmount,
      testResults,
      workingAmount: workingAmount?.amount,
      message: workingAmount ? `Minimum amount found: ${workingAmount.amount}` : 'No working amount found'
    });

  } catch (error) {
    console.error('❌ Amount Test Failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
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