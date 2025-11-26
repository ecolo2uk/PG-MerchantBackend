

// // controllers/transactionController.js
// import Transaction from '../models/Transaction.js';
// import mongoose from 'mongoose';
// import axios from 'axios';

// const generateTransactionId = () => `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
// const generateVendorRefId = () => `VENDOR${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;


// export const getMerchantConnectorAccount = async (merchantId) => {
//   try {
//     console.log('🟡 DIRECT DATABASE QUERY for merchantId:', merchantId);
    
//     // ✅ DIRECT DATABASE ACCESS
//     const connectorAccount = await mongoose.connection.db.collection('merchantconnectoraccounts')
//       .findOne({ 
//         merchantId: new mongoose.Types.ObjectId(merchantId),
//         status: "Active"
//       });

//     if (connectorAccount) {
//       console.log('✅ DIRECT QUERY SUCCESS - Connector found:', {
//         connectorId: connectorAccount.connectorId,
//         terminalId: connectorAccount.terminalId,
//         hasIntegrationKeys: !!connectorAccount.integrationKeys
//       });
      
//       // ✅ IF INTEGRATION KEYS MISSING, ADD THEM FROM CONNECTOR
//       if (!connectorAccount.integrationKeys) {
//         console.log('⚠️ Integration keys missing, fetching from connector...');
        
//         const connector = await mongoose.connection.db.collection('connectors')
//           .findOne({ _id: connectorAccount.connectorId });
          
//         if (connector && connector.integrationKeys) {
//           connectorAccount.integrationKeys = connector.integrationKeys;
//           console.log('✅ Added integration keys from connector');
//         }
//       }
      
//       return connectorAccount;
//     }
    
//     console.log('❌ DIRECT QUERY - No connector found');
//     return null;
    
//   } catch (error) {
//     console.error('❌ DIRECT QUERY ERROR:', error);
//     return null;
//   }
// };


// export const generateGenericDynamicQR = async (transactionData, merchantConnectorAccount) => {
//   try {
//     console.log('🟡 Generating QR with Generic Connector System');
    
//     if (!merchantConnectorAccount) {
//       console.log('⚠️ No connector account, using fallback');
//       return await generateFallbackQR(transactionData);
//     }

//     const connector = await mongoose.connection.db.collection('connectors')
//       .findOne({ _id: merchantConnectorAccount.connectorId });

//     if (!connector) {
//       console.log('❌ Connector not found, using fallback');
//       return await generateFallbackQR(transactionData);
//     }

//     const integrationKeys = merchantConnectorAccount.integrationKeys || {};
//     const connectorName = connector.name?.toLowerCase();
    
//     // ✅ SUPPORT MULTIPLE CONNECTORS
//     if (connectorName === 'enpay') {
//       return await generateEnpayQR(transactionData, integrationKeys);
//     } 
//     else if (connectorName === 'razorpay') {
//       return await generateRazorpayQR(transactionData, integrationKeys);
//     }
//     else if (connectorName === 'paytm') {
//       return await generatePaytmQR(transactionData, integrationKeys);
//     }
//     else if (connectorName === 'phonepe') {
//       return await generatePhonePeQR(transactionData, integrationKeys);
//     }
//     else {
//       // ✅ DEFAULT FALLBACK FOR ANY CONNECTOR
//       console.log(`⚠️ Using fallback for connector: ${connectorName}`);
//       return await generateFallbackQR(transactionData);
//     }
    
//   } catch (error) {
//     console.error('❌ Generic QR Generation Error:', error);
//     return await generateFallbackQR(transactionData);
//   }
// };


// const generatePhonePeQR = async (transactionData, integrationKeys) => {
//   try {
//     const { amount, txnNote, transactionId, merchantName } = transactionData;
    
//     const merchantId = integrationKeys.merchant_id;
//     const saltKey = integrationKeys.salt_key;
//     const saltIndex = integrationKeys.salt_index;

//     if (!merchantId || !saltKey || !saltIndex) {
//       throw new Error('PhonePe credentials not found');
//     }

//     const payload = {
//       merchantId: merchantId,
//       merchantTransactionId: transactionId,
//       amount: amount ? amount * 100 : 100, // in paise
//       merchantUserId: `MUID${Date.now()}`,
//       redirectUrl: `${integrationKeys.baseUrl}/callback`,
//       redirectMode: "REDIRECT",
//       callbackUrl: `${integrationKeys.baseUrl}/webhook`,
//       paymentInstrument: {
//         type: "UPI_INTENT"
//       }
//     };

//     // PhonePe requires specific encoding
//     const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
//     const stringToHash = base64Payload + '/pg/v1/pay' + saltKey;
//     const xVerify = sha256(stringToHash) + '###' + saltIndex;

//     const response = await axios.post(
//       integrationKeys.baseUrl || 'https://api.phonepe.com/apis/hermes/pg/v1/pay',
//       { request: base64Payload },
//       {
//         headers: {
//           'Content-Type': 'application/json',
//           'X-VERIFY': xVerify
//         },
//         timeout: 25000
//       }
//     );

//     if (response.data.success) {
//       return {
//         success: true,
//         qrData: response.data.data.instrumentResponse.intentUrl,
//         paymentUrl: response.data.data.instrumentResponse.intentUrl,
//         connector: 'phonepe',
//         message: 'QR generated via PhonePe'
//       };
//     } else {
//       throw new Error(response.data.message || 'PhonePe QR generation failed');
//     }
    
//   } catch (error) {
//     console.error('❌ PhonePe QR Error:', error);
//     throw error;
//   }
// };


// const generateGooglePayQR = async (transactionData, integrationKeys) => {
//   try {
//     const { amount, txnNote, transactionId, merchantName } = transactionData;
    
//     const merchantId = integrationKeys.merchant_id;
//     const merchantDisplayName = integrationKeys.merchant_name; // ✅ CHANGED VARIABLE NAME

//     if (!merchantId) {
//       throw new Error('Google Pay credentials not found');
//     }

//     // Google Pay UPI QR format
//     const upiUrl = `upi://pay?pa=${merchantId}&pn=${encodeURIComponent(merchantDisplayName || merchantName)}&am=${amount}&tn=${encodeURIComponent(txnNote)}&tr=${transactionId}`;
//     const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiUrl)}`;

//     return {
//       success: true,
//       qrData: qrCodeUrl,
//       paymentUrl: upiUrl,
//       connector: 'googlepay',
//       message: 'QR generated via Google Pay'
//     };
    
//   } catch (error) {
//     console.error('❌ Google Pay QR Error:', error);
//     throw error;
//   }
// };
// // ✅ ENPAY QR GENERATION (DYNAMIC CREDENTIALS)
// const generateEnpayQR = async (transactionData, integrationKeys) => {
//   try {
//     console.log('🔍 CHECKING ENPAY CREDENTIALS FROM DATABASE:');
//     console.log('Integration Keys Object:', integrationKeys);
    
//     // ✅ VALIDATE ALL REQUIRED KEYS
//     const requiredKeys = ['X-Merchant-Key', 'X-Merchant-Secret', 'merchantHashId'];
//     const missingKeys = requiredKeys.filter(key => !integrationKeys[key]);
    
//     if (missingKeys.length > 0) {
//       console.error('❌ MISSING CREDENTIALS IN DATABASE:', missingKeys);
//       throw new Error(`Missing credentials: ${missingKeys.join(', ')}`);
//     }

//     console.log('✅ All credentials present in database');

//     const payload = {
//       merchantHashId: integrationKeys.merchantHashId,
//       txnNote: transactionData.txnNote || 'Payment for Order',
//       txnRefId: transactionData.transactionId
//     };

//     if (transactionData.amount && transactionData.amount > 0) {
//       payload.txnAmount = transactionData.amount.toString();
//     }

//     console.log('🟡 Sending to Enpay API with database credentials...');

//     const response = await axios.post(
//       (integrationKeys.baseUrl || 'https://api.enpay.in/enpay-product-service/api/v1/merchant-gateway') + '/dynamicQR',
//       payload,
//       {
//         headers: {
//           'Content-Type': 'application/json',
//           'X-Merchant-Key': integrationKeys['X-Merchant-Key'],
//           'X-Merchant-Secret': integrationKeys['X-Merchant-Secret']
//         },
//         timeout: 25000
//       }
//     );

//     console.log('✅ ENPAY API SUCCESS with database credentials');
    
//     if (response.data.code === 0) {
//       return {
//         success: true,
//         qrData: response.data.details,
//         paymentUrl: `upi://pay?tr=${transactionData.transactionId}`,
//         connector: 'enpay',
//         message: 'QR generated via Enpay'
//       };
//     } else {
//       throw new Error(response.data.message || `Enpay API error: ${response.data.code}`);
//     }
    
//   } catch (error) {
//     console.error('❌ ENPAY API FAILED with database credentials:', {
//       message: error.message,
//       status: error.response?.status,
//       data: error.response?.data
//     });
//     throw error;
//   }
// };

// // ✅ RAZORPAY QR GENERATION (DYNAMIC CREDENTIALS)
// const generateRazorpayQR = async (transactionData, integrationKeys) => {
//   try {
//     const { amount, txnNote, transactionId } = transactionData;
    
//     // ✅ DYNAMIC CREDENTIALS
//     const keyId = integrationKeys.key_id;
//     const keySecret = integrationKeys.key_secret;

//     if (!keyId || !keySecret) {
//       throw new Error('Razorpay credentials not found in integration keys');
//     }

//     const payload = {
//       type: "upi_qr",
//       name: `Payment for ${txnNote}`,
//       usage: "single_use",
//       fixed_amount: amount ? true : false,
//       payment_amount: amount || null,
//       description: txnNote || "Payment",
//       customer_id: transactionId
//     };

//     console.log('🟡 Razorpay API Payload:', payload);

//     const response = await axios.post(
//       'https://api.razorpay.com/v1/qrcodes',
//       payload,
//       {
//         headers: {
//           'Content-Type': 'application/json',
//           'Authorization': `Basic ${Buffer.from(keyId + ':' + keySecret).toString('base64')}`
//         },
//         timeout: 25000
//       }
//     );

//     if (response.data.id) {
//       return {
//         success: true,
//         qrData: response.data.image_url,
//         paymentUrl: response.data.short_url,
//         connector: 'razorpay',
//         message: 'QR generated via Razorpay'
//       };
//     } else {
//       throw new Error('Razorpay QR generation failed');
//     }
    
//   } catch (error) {
//     console.error('❌ Razorpay QR Error:', error);
//     throw error;
//   }
// };

// // ✅ PAYTM QR GENERATION (DYNAMIC CREDENTIALS)
// const generatePaytmQR = async (transactionData, integrationKeys) => {
//   try {
//     const { amount, txnNote, transactionId } = transactionData;
    
//     // ✅ DYNAMIC CREDENTIALS
//     const merchantId = integrationKeys.merchant_id;
//     const accessToken = integrationKeys.access_token;

//     if (!merchantId || !accessToken) {
//       throw new Error('Paytm credentials not found in integration keys');
//     }

//     const payload = {
//       mid: merchantId,
//       orderId: transactionId,
//       amount: amount ? amount.toString() : undefined,
//       transactionNote: txnNote,
//       requestType: "Payment"
//     };

//     console.log('🟡 Paytm API Payload:', payload);

//     const response = await axios.post(
//       integrationKeys.baseUrl || 'https://merchant-upi-api.paytm.com/upi/generateQrCode',
//       payload,
//       {
//         headers: {
//           'Content-Type': 'application/json',
//           'Authorization': `Bearer ${accessToken}`
//         },
//         timeout: 25000
//       }
//     );

//     if (response.data.success) {
//       return {
//         success: true,
//         qrData: response.data.qrCode,
//         paymentUrl: response.data.paymentUrl,
//         connector: 'paytm',
//         message: 'QR generated via Paytm'
//       };
//     } else {
//       throw new Error(response.data.message || 'Paytm QR generation failed');
//     }
    
//   } catch (error) {
//     console.error('❌ Paytm QR Error:', error);
//     throw error;
//   }
// };

// // ✅ FALLBACK QR GENERATION (NO STATIC CREDENTIALS)
// const generateFallbackQR = async (transactionData) => {
//   const { amount, txnNote, transactionId, merchantName } = transactionData;
  
//   // Generate basic UPI QR with dynamic UPI ID from database if available
//   // For now using generic UPI
//   let upiUrl = `upi://pay?pa=merchant@upi&pn=${encodeURIComponent(merchantName)}&tn=${encodeURIComponent(txnNote)}&tr=${transactionId}`;
  
//   if (amount && amount > 0) {
//     upiUrl += `&am=${amount}`;
//   }
  
//   const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiUrl)}`;

//   return {
//     success: true,
//     qrData: qrCodeUrl,
//     paymentUrl: upiUrl,
//     connector: 'fallback',
//     message: 'QR generated via fallback method'
//   };
// };

// // ✅ MAIN DYNAMIC QR FUNCTION
// export const generateDynamicQR = async (req, res) => {
//   try {
//     const { amount, txnNote = 'Payment for Order' } = req.body;
//     const merchantId = req.user.id;
//     const merchantName = req.user.firstname + ' ' + (req.user.lastname || '');

//     console.log('🟡 Generate Dynamic QR - Start:', { merchantId, merchantName });

//     // ✅ STEP 1: GET MERCHANT CONNECTOR ACCOUNT
//     const merchantConnectorAccount = await getMerchantConnectorAccount(merchantId);
    
//     let connectorInfo = null;
//     let connectorName = 'fallback';

//     if (merchantConnectorAccount) {
//       // Get connector name for info
//       const connector = await mongoose.connection.db.collection('connectors')
//         .findOne({ _id: merchantConnectorAccount.connectorId });
      
//       connectorInfo = {
//         terminalId: merchantConnectorAccount.terminalId,
//         connectorId: merchantConnectorAccount.connectorId,
//         connectorName: connector?.name || 'Unknown'
//       };
//       connectorName = connector?.name?.toLowerCase() || 'fallback';
//     }

//     const parsedAmount = amount ? parseFloat(amount) : null;
//     const transactionId = generateTransactionId();
//     const vendorRefId = generateVendorRefId();

//     // ✅ TRANSACTION DATA
//     const transactionData = {
//       transactionId,
//       merchantId: merchantId,
//       merchantName,
//       amount: parsedAmount,
//       status: 'INITIATED',
//       createdAt: new Date().toISOString(),
//       "Commission Amount": 0,
//       mid: req.user.mid || 'DEFAULT_MID',
//       "Settlement Status": "UNSETTLED",
//       "Vendor Ref ID": vendorRefId,
//       txnNote,
//       merchantOrderId: `ORDER${Date.now()}`,
//       txnRefId: transactionId,
//       connectorUsed: connectorName
//     };

//     // Add connector info if available
//     if (connectorInfo) {
//       transactionData.terminalId = connectorInfo.terminalId;
//       transactionData.connectorAccountId = merchantConnectorAccount._id;
//       transactionData.connectorId = connectorInfo.connectorId;
//       transactionData.connectorName = connectorInfo.connectorName;
//     }

//     console.log('🟡 Creating transaction with connector:', connectorName);

//     // ✅ SAVE TRANSACTION FIRST
//     const transaction = new Transaction(transactionData);
//     const savedTransaction = await transaction.save();
    
//     console.log('✅ Transaction saved successfully:', savedTransaction.transactionId);

//     // ✅ GENERIC QR GENERATION - ALL CONNECTORS SUPPORT
//     console.log('🟡 Calling Generic QR Generation...');
//     const qrResult = await generateGenericDynamicQR({
//       amount: parsedAmount,
//       txnNote,
//       transactionId,
//       merchantName
//     }, merchantConnectorAccount);

//     console.log('🟡 QR Generation Result:', {
//       success: qrResult.success,
//       connector: qrResult.connector,
//       message: qrResult.message
//     });

//     // ✅ UPDATE TRANSACTION WITH QR DATA
//     savedTransaction.qrCode = qrResult.qrData;
//     savedTransaction.paymentUrl = qrResult.paymentUrl;
//     savedTransaction.connectorUsed = qrResult.connector;
//     savedTransaction.status = qrResult.success ? 'INITIATED' : 'FAILED';
    
//     await savedTransaction.save();

//     console.log('✅ QR Code generated successfully via:', qrResult.connector);

//     res.status(200).json({
//       success: true,
//       transactionId: savedTransaction.transactionId,
//       qrCode: qrResult.qrData,
//       paymentUrl: qrResult.paymentUrl,
//       amount: savedTransaction.amount,
//       status: savedTransaction.status,
//       connector: qrResult.connector,
//       connectorInfo: connectorInfo,
//       message: qrResult.message
//     });

//   } catch (error) {
//     console.error('❌ Generate QR Error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to generate QR',
//       error: error.message
//     });
//   }
// };

// // ✅ DEFAULT QR FUNCTION
// export const generateDefaultQR = async (req, res) => {
//   try {
//     console.log('🔵 Generate Default QR - Start');

//     if (!req.user || !req.user.id) {
//       return res.status(401).json({
//         success: false,
//         message: 'User authentication required'
//       });
//     }

//     const merchantId = req.user.id;
//     const merchantName = req.user.firstname + ' ' + (req.user.lastname || '');

//     const transactionId = `DFT${Date.now()}`;
//     const vendorRefId = generateVendorRefId();

//     const transactionData = {
//       transactionId,
//       merchantId: merchantId,
//       merchantName,
//       createdAt: new Date().toISOString(),
//       mid: req.user.mid || 'DEFAULT_MID',
//       "Settlement Status": "UNSETTLED",
//       status: 'INITIATED',
//       "Vendor Ref ID": vendorRefId,
//       txnNote: 'Default QR Code',
//       merchantOrderId: `ORDER${Date.now()}`,
//       txnRefId: transactionId,
//       isDefaultQR: true,
//       connectorUsed: 'fallback'
//     };

//     console.log('🔵 Creating default QR transaction');

//     const transaction = new Transaction(transactionData);
//     const savedTransaction = await transaction.save();
    
//     console.log('✅ Default QR transaction saved:', savedTransaction.transactionId);

//     // ✅ FALLBACK QR GENERATION FOR DEFAULT QR
//     console.log('🟡 Generating Fallback QR for Default QR...');
//     const qrResult = await generateFallbackQR({
//       amount: null, // No amount for default QR
//       txnNote: 'Default QR Code',
//       transactionId,
//       merchantName
//     });

//     // UPDATE TRANSACTION
//     savedTransaction.qrCode = qrResult.qrData;
//     savedTransaction.paymentUrl = qrResult.paymentUrl;
//     savedTransaction.connectorUsed = qrResult.connector;
//     await savedTransaction.save();

//     console.log('✅ Default QR generated successfully via fallback');

//     res.status(200).json({
//       success: true,
//       transactionId: savedTransaction.transactionId,
//       qrCode: qrResult.qrData,
//       paymentUrl: qrResult.paymentUrl,
//       status: savedTransaction.status,
//       isDefault: true,
//       connector: qrResult.connector,
//       message: qrResult.message
//     });

//   } catch (error) {
//     console.error('❌ Generate Default QR Error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to generate default QR',
//       error: error.message
//     });
//   }
// };


// // Other functions remain same (getTransactions, simpleDebug, etc.)
// export const getTransactions = async (req, res) => {
//   try {
//     const merchantId = req.user.id;
//     console.log("🟡 Fetching transactions for merchant:", merchantId);

//     const transactions = await Transaction.find({ 
//       merchantId: merchantId 
//     })
//     .sort({ createdAt: -1 })
//     .limit(50);

//     console.log(`✅ Found ${transactions.length} transactions for merchant ${merchantId}`);

//     res.json(transactions);

//   } catch (error) {
//     console.error("❌ Error fetching transactions:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch transactions",
//       error: error.message
//     });
//   }
// };

// export const simpleDebug = async (req, res) => {
//   try {
//     console.log('🔧 Simple Debug Endpoint Hit');
    
//     const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
    
//     const collections = await mongoose.connection.db.listCollections().toArray();
//     const hasTransactions = collections.some(col => col.name === 'transactions');
    
//     const sampleTransaction = await Transaction.findOne();
//     const transactionCount = await Transaction.countDocuments();
    
//     res.json({
//       success: true,
//       timestamp: new Date().toISOString(),
//       database: {
//         status: dbStatus,
//         hasTransactionsCollection: hasTransactions,
//         transactionCount: transactionCount,
//         sampleTransaction: sampleTransaction
//       },
//       merchant: req.user ? {
//         id: req.user.id,
//         name: req.user.firstname + ' ' + (req.user.lastname || '')
//       } : 'No merchant info',
//       message: 'Debug information collected'
//     });
    
//   } catch (error) {
//     console.error('❌ Simple Debug Error:', error);
//     res.status(500).json({
//       success: false,
//       error: error.message
//     });
//   }
// };

// controllers/transactionController.js
import Transaction from '../models/Transaction.js';
import mongoose from 'mongoose';
import axios from 'axios';

const generateTransactionId = () => `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateVendorRefId = () => `VENDOR${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

// ✅ SIMPLE DEBUG FUNCTION (ADD THIS)
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

// ✅ GET MERCHANT CONNECTOR ACCOUNT (FIXED - CORRECT FIELD NAMES)
export const getMerchantConnectorAccount = async (merchantId) => {
  try {
    console.log('🟡 Fetching merchant connector account for merchantId:', merchantId);
    
    // Convert to ObjectId if it's a string
    const merchantObjectId = typeof merchantId === 'string' ? new mongoose.Types.ObjectId(merchantId) : merchantId;
    
    const connectorAccount = await mongoose.connection.db.collection('merchantconnectoraccounts')
      .findOne({ 
        userId: merchantObjectId,
        status: "Active"
      });

    if (connectorAccount) {
      console.log('✅ Merchant Connector Account Found:', {
        _id: connectorAccount._id,
        connectorId: connectorAccount.connectorId,
        name: connectorAccount.name,
        terminalId: connectorAccount.terminalId,
        status: connectorAccount.status
      });
      
      // Get connector details from connectors collection
      const connector = await mongoose.connection.db.collection('connectors')
        .findOne({ _id: connectorAccount.connectorId });

      if (connector) {
        console.log('✅ Connector Details Found:', {
          connectorName: connector.name,
          connectorType: connector.connectorType,
          className: connector.className
        });
      }

      return {
        ...connectorAccount,
        connectorDetails: connector
      };
    }
    
    console.log('❌ No active connector account found for merchant');
    return null;
    
  } catch (error) {
    console.error('❌ Error fetching merchant connector:', error);
    return null;
  }
};

// ✅ GET INTEGRATION KEYS FROM CONNECTOR ACCOUNT
const getIntegrationKeys = (connectorAccount) => {
  try {
    // Check both possible field names for integration keys
    const integrationKeys = connectorAccount.integratedonKeys || connectorAccount.integrationKeys;
    
    if (!integrationKeys) {
      console.log('❌ No integration keys found in connector account');
      return null;
    }

    console.log('🔍 Integration Keys Found:', Object.keys(integrationKeys));
    return integrationKeys;
    
  } catch (error) {
    console.error('❌ Error getting integration keys:', error);
    return null;
  }
};

// ✅ CASHFREE QR GENERATION (DYNAMIC FROM DATABASE)
const generateCashfreeQR = async (transactionData, integrationKeys) => {
  try {
    const { amount, txnNote, transactionId, merchantName } = transactionData;
    
    console.log('🟡 Generating Cashfree QR with dynamic keys from DB');
    console.log('Available Keys:', Object.keys(integrationKeys));

    // Validate required credentials
    const requiredKeys = ['x-client-id', 'x-client-secret', 'x-api-version'];
    const missingKeys = requiredKeys.filter(key => !integrationKeys[key]);
    
    if (missingKeys.length > 0) {
      throw new Error(`Missing Cashfree credentials: ${missingKeys.join(', ')}`);
    }

    const payload = {
      order_amount: amount ? amount.toString() : "1.00",
      order_currency: "INR",
      order_id: `order_${transactionId}_${Date.now()}`,
      customer_details: {
        customer_id: `cust_${transactionId}`,
        customer_phone: "9999999999",
        customer_name: merchantName
      }
    };

    console.log('🟡 Cashfree API Payload:', payload);

    const response = await axios.post(
      'https://api.cashfree.com/pg/orders',
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': integrationKeys['x-client-id'],
          'x-client-secret': integrationKeys['x-client-secret'],
          'x-api-version': integrationKeys['x-api-version'] || '2023-08-01'
        },
        timeout: 30000
      }
    );

    console.log('✅ Cashfree API Response:', response.data);

    if (response.data.payment_session_id) {
      // Generate QR code URL for Cashfree
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`https://cfpayments.cashfree.com/pg/orders/${response.data.cf_order_id}`)}`;

      return {
        success: true,
        qrData: qrCodeUrl,
        paymentUrl: `https://cfpayments.cashfree.com/pg/orders/${response.data.cf_order_id}`,
        connector: 'cashfree',
        message: 'QR generated via Cashfree',
        cashfreeResponse: response.data
      };
    } else {
      throw new Error('Cashfree order creation failed');
    }
    
  } catch (error) {
    console.error('❌ Cashfree QR Error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    throw error;
  }
};

// ✅ ENPAY QR GENERATION (DYNAMIC FROM DATABASE)
const generateEnpayQR = async (transactionData, integrationKeys) => {
  try {
    console.log('🔍 CHECKING ENPAY CREDENTIALS FROM DATABASE:');
    console.log('Available Integration Keys:', Object.keys(integrationKeys));

    // Validate required credentials for Enpay
    const requiredKeys = ['X-Merchant-Key', 'X-Merchant-Secret', 'merchantHashId'];
    const missingKeys = requiredKeys.filter(key => !integrationKeys[key]);
    
    if (missingKeys.length > 0) {
      console.error('❌ MISSING ENPAY CREDENTIALS IN DATABASE:', missingKeys);
      throw new Error(`Missing Enpay credentials: ${missingKeys.join(', ')}`);
    }

    console.log('✅ All Enpay credentials present in database');

    const payload = {
      merchantHashId: integrationKeys.merchantHashId,
      txnNote: transactionData.txnNote || 'Payment for Order',
      txnRefId: transactionData.transactionId
    };

    if (transactionData.amount && transactionData.amount > 0) {
      payload.txnAmount = transactionData.amount.toString();
    }

    console.log('🟡 Sending to Enpay API with database credentials...');

    const response = await axios.post(
      (integrationKeys.baseUrl || 'https://api.enpay.in/enpay-product-service/api/v1/merchant-gateway') + '/dynamicQR',
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Merchant-Key': integrationKeys['X-Merchant-Key'],
          'X-Merchant-Secret': integrationKeys['X-Merchant-Secret']
        },
        timeout: 25000
      }
    );

    console.log('✅ ENPAY API SUCCESS with database credentials');
    
    if (response.data.code === 0) {
      return {
        success: true,
        qrData: response.data.details,
        paymentUrl: `upi://pay?tr=${transactionData.transactionId}`,
        connector: 'enpay',
        message: 'QR generated via Enpay',
        enpayResponse: response.data
      };
    } else {
      throw new Error(response.data.message || `Enpay API error: ${response.data.code}`);
    }
    
  } catch (error) {
    console.error('❌ ENPAY API FAILED with database credentials:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    throw error;
  }
};

// ✅ GENERIC QR GENERATION - SUPPORTS ALL CONNECTORS (FIXED)
export const generateGenericDynamicQR = async (transactionData, merchantConnectorAccount) => {
  try {
    console.log('🟡 Generating QR with Generic Connector System');
    
    if (!merchantConnectorAccount) {
      console.log('⚠️ No connector account, using fallback');
      return await generateFallbackQR(transactionData);
    }

    // Get integration keys from connector account
    const integrationKeys = getIntegrationKeys(merchantConnectorAccount);
    
    if (!integrationKeys) {
      console.log('⚠️ No integration keys found, using fallback');
      return await generateFallbackQR(transactionData);
    }

    const connectorName = merchantConnectorAccount.name?.toLowerCase() || 
                         merchantConnectorAccount.connectorDetails?.name?.toLowerCase();
    
    console.log('🔍 Connector Details:', {
      connectorName,
      hasIntegrationKeys: !!integrationKeys,
      availableKeys: Object.keys(integrationKeys)
    });

    // ✅ SUPPORT MULTIPLE CONNECTORS BASED ON DATABASE CONFIG
    if (connectorName === 'enpay' || connectorName === 'enpay1') {
      return await generateEnpayQR(transactionData, integrationKeys);
    } 
    else if (connectorName === 'cashfree' || connectorName === 'cash Free') {
      return await generateCashfreeQR(transactionData, integrationKeys);
    }
    else {
      // ✅ DEFAULT FALLBACK FOR ANY OTHER CONNECTOR
      console.log(`⚠️ Using fallback for connector: ${connectorName}`);
      return await generateFallbackQR(transactionData);
    }
    
  } catch (error) {
    console.error('❌ Generic QR Generation Error:', error);
    return await generateFallbackQR(transactionData);
  }
};

// ✅ FALLBACK QR GENERATION (NO STATIC DATA)
const generateFallbackQR = async (transactionData) => {
  const { amount, txnNote, transactionId, merchantName } = transactionData;
  
  // Generate basic UPI QR without any static credentials
  let upiUrl = `upi://pay?pa=dynamic@upi&pn=${encodeURIComponent(merchantName)}&tn=${encodeURIComponent(txnNote)}&tr=${transactionId}`;
  
  if (amount && amount > 0) {
    upiUrl += `&am=${amount}`;
  }
  
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiUrl)}`;

  return {
    success: true,
    qrData: qrCodeUrl,
    paymentUrl: upiUrl,
    connector: 'fallback',
    message: 'QR generated via fallback method'
  };
};

// ✅ DEBUG FUNCTION TO CHECK DATABASE DATA
export const debugConnectorData = async (req, res) => {
  try {
    const merchantId = req.user.id;
    console.log('🔧 Debugging connector data for merchant:', merchantId);

    // Get merchant connector account
    const connectorAccount = await getMerchantConnectorAccount(merchantId);
    
    let debugInfo = {
      merchantId: merchantId,
      hasConnectorAccount: !!connectorAccount,
      connectorAccount: null,
      integrationKeys: null
    };

    if (connectorAccount) {
      debugInfo.connectorAccount = {
        _id: connectorAccount._id,
        name: connectorAccount.name,
        connectorId: connectorAccount.connectorId,
        terminalId: connectorAccount.terminalId,
        status: connectorAccount.status,
        integratedonKeys: connectorAccount.integratedonKeys ? 'Present' : 'Missing',
        integrationKeys: connectorAccount.integrationKeys ? 'Present' : 'Missing'
      };

      // Get integration keys
      const integrationKeys = getIntegrationKeys(connectorAccount);
      if (integrationKeys) {
        debugInfo.integrationKeys = {
          keys: Object.keys(integrationKeys),
          sampleValues: Object.keys(integrationKeys).reduce((acc, key) => {
            acc[key] = integrationKeys[key] ? '***' + integrationKeys[key].slice(-4) : 'NULL';
            return acc;
          }, {})
        };
      }

      // Get connector details
      if (connectorAccount.connectorDetails) {
        debugInfo.connectorDetails = {
          name: connectorAccount.connectorDetails.name,
          className: connectorAccount.connectorDetails.className,
          connectorType: connectorAccount.connectorDetails.connectorType
        };
      }
    }

    res.json({
      success: true,
      debugInfo,
      message: 'Connector data debug information'
    });

  } catch (error) {
    console.error('❌ Debug Connector Data Error:', error);
    res.status(500).json({
      success: false,
      message: 'Debug failed',
      error: error.message
    });
  }
};

// ✅ MAIN DYNAMIC QR FUNCTION (FIXED)
export const generateDynamicQR = async (req, res) => {
  try {
    const { amount, txnNote = 'Payment for Order' } = req.body;
    const merchantId = req.user.id;
    const merchantName = req.user.firstname + ' ' + (req.user.lastname || '');

    console.log('🟡 Generate Dynamic QR - Start:', { merchantId, merchantName });

    // ✅ STEP 1: GET MERCHANT CONNECTOR ACCOUNT FROM DATABASE
    const merchantConnectorAccount = await getMerchantConnectorAccount(merchantId);
    
    let connectorInfo = null;
    let connectorName = 'fallback';

    if (merchantConnectorAccount) {
      connectorInfo = {
        terminalId: merchantConnectorAccount.terminalId,
        connectorId: merchantConnectorAccount.connectorId,
        connectorName: merchantConnectorAccount.name || merchantConnectorAccount.connectorDetails?.name || 'Unknown',
        connectorType: merchantConnectorAccount.connectorDetails?.connectorType || 'UPI'
      };
      connectorName = connectorInfo.connectorName.toLowerCase();
    }

    const parsedAmount = amount ? parseFloat(amount) : null;
    const transactionId = generateTransactionId();
    const vendorRefId = generateVendorRefId();

    // ✅ TRANSACTION DATA (ALL DYNAMIC)
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
      merchantOrderId: `ORDER${Date.now()}`,
      txnRefId: transactionId,
      connectorUsed: connectorName,
      terminalId: connectorInfo?.terminalId
    };

    // Add connector info if available
    if (connectorInfo) {
      transactionData.connectorAccountId = merchantConnectorAccount._id;
      transactionData.connectorId = connectorInfo.connectorId;
      transactionData.connectorName = connectorInfo.connectorName;
      transactionData.connectorType = connectorInfo.connectorType;
    }

    console.log('🟡 Creating transaction with connector:', connectorName);

    // ✅ SAVE TRANSACTION FIRST
    const transaction = new Transaction(transactionData);
    const savedTransaction = await transaction.save();
    
    console.log('✅ Transaction saved successfully:', savedTransaction.transactionId);

    // ✅ GENERIC QR GENERATION - ALL CONNECTORS SUPPORT (DYNAMIC FROM DB)
    console.log('🟡 Calling Generic QR Generation...');
    const qrResult = await generateGenericDynamicQR({
      amount: parsedAmount,
      txnNote,
      transactionId,
      merchantName
    }, merchantConnectorAccount);

    console.log('🟡 QR Generation Result:', {
      success: qrResult.success,
      connector: qrResult.connector,
      message: qrResult.message
    });

    // ✅ UPDATE TRANSACTION WITH QR DATA
    savedTransaction.qrCode = qrResult.qrData;
    savedTransaction.paymentUrl = qrResult.paymentUrl;
    savedTransaction.connectorUsed = qrResult.connector;
    savedTransaction.status = qrResult.success ? 'INITIATED' : 'FAILED';
    
    // Store connector response
    if (qrResult.connector === 'cashfree' && qrResult.cashfreeResponse) {
      savedTransaction.cashfreeResponse = qrResult.cashfreeResponse;
    } else if (qrResult.connector === 'enpay' && qrResult.enpayResponse) {
      savedTransaction.enpayResponse = qrResult.enpayResponse;
    }
    
    await savedTransaction.save();

    console.log('✅ QR Code generated successfully via:', qrResult.connector);

    res.status(200).json({
      success: true,
      transactionId: savedTransaction.transactionId,
      qrCode: qrResult.qrData,
      paymentUrl: qrResult.paymentUrl,
      amount: savedTransaction.amount,
      status: savedTransaction.status,
      connector: qrResult.connector,
      connectorInfo: connectorInfo,
      message: qrResult.message
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

// ✅ GET MERCHANT CONNECTOR ENDPOINT (FIXED)
export const getMerchantConnector = async (req, res) => {
  try {
    const merchantId = req.user.id;
    console.log('🟡 Fetching merchant connector for:', merchantId);

    const connectorAccount = await getMerchantConnectorAccount(merchantId);
    
    if (connectorAccount) {
      const integrationKeys = getIntegrationKeys(connectorAccount);
      const hasIntegrationKeys = !!integrationKeys;
      
      res.json({
        success: true,
        connectorAccount: {
          connectorId: connectorAccount.connectorId,
          connectorName: connectorAccount.name || connectorAccount.connectorDetails?.name,
          connectorType: connectorAccount.connectorDetails?.connectorType,
          terminalId: connectorAccount.terminalId,
          status: connectorAccount.status,
          hasIntegrationKeys: hasIntegrationKeys,
          integrationKeys: hasIntegrationKeys ? 'Present' : 'Missing',
          availableKeys: hasIntegrationKeys ? Object.keys(integrationKeys) : []
        },
        message: 'Connector found'
      });
    } else {
      res.json({
        success: false,
        message: 'No active connector account found'
      });
    }
    
  } catch (error) {
    console.error('❌ Get Merchant Connector Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch connector',
      error: error.message
    });
  }
};

// Other functions remain the same...
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

    // Get merchant connector for default QR as well
    const merchantConnectorAccount = await getMerchantConnectorAccount(merchantId);
    let connectorName = 'fallback';
    
    if (merchantConnectorAccount) {
      connectorName = merchantConnectorAccount.name?.toLowerCase() || 
                     merchantConnectorAccount.connectorDetails?.name?.toLowerCase() || 'fallback';
    }

    const transactionId = `DFT${Date.now()}`;
    const vendorRefId = generateVendorRefId();

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
      merchantOrderId: `ORDER${Date.now()}`,
      txnRefId: transactionId,
      isDefaultQR: true,
      connectorUsed: connectorName
    };

    console.log('🔵 Creating default QR transaction with connector:', connectorName);

    const transaction = new Transaction(transactionData);
    const savedTransaction = await transaction.save();
    
    console.log('✅ Default QR transaction saved:', savedTransaction.transactionId);

    // Use generic QR generation for default QR as well
    const qrResult = await generateGenericDynamicQR({
      amount: null,
      txnNote: 'Default QR Code',
      transactionId,
      merchantName
    }, merchantConnectorAccount);

    // UPDATE TRANSACTION
    savedTransaction.qrCode = qrResult.qrData;
    savedTransaction.paymentUrl = qrResult.paymentUrl;
    savedTransaction.connectorUsed = qrResult.connector;
    await savedTransaction.save();

    console.log('✅ Default QR generated successfully via:', qrResult.connector);

    res.status(200).json({
      success: true,
      transactionId: savedTransaction.transactionId,
      qrCode: qrResult.qrData,
      paymentUrl: qrResult.paymentUrl,
      status: savedTransaction.status,
      isDefault: true,
      connector: qrResult.connector,
      message: qrResult.message
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