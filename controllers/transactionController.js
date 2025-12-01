

// controllers/transactionController.js
import Transaction from '../models/Transaction.js';
import mongoose from 'mongoose';
import axios from 'axios';

const generateTransactionId = () => `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateVendorRefId = () => `VENDOR${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;


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


const getIntegrationKeys = (connectorAccount) => {
  try {
    
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

    // ✅ CRITICAL: Make sure merchantHashId is correct
    const merchantHashId = integrationKeys.merchantHashId;
    console.log('🔍 Merchant Hash ID:', merchantHashId);
    
    if (!merchantHashId || merchantHashId === 'MERCDSH51Y7CD4YJLFIZR8NF') {
      console.log('⚠️ WARNING: Using test merchantHashId, check if valid');
    }

    // ✅ Create payload EXACTLY as Enpay expects
    const payload = {
      merchantHashId: merchantHashId,
      txnRefId: transactionData.transactionId, // MUST be unique
      txnNote: transactionData.txnNote || 'Payment for Order'
    };

    // ✅ Add amount ONLY if provided
    if (transactionData.amount && transactionData.amount > 0) {
      payload.txnAmount = transactionData.amount.toFixed(2); // Format to 2 decimal places
    }

    console.log('🟡 Sending to Enpay API with payload:', payload);

    // ✅ Use the exact URL from your database
    const baseUrl = integrationKeys.baseUrl || 'https://api.enpay.in/enpay-product-service/api/v1/merchant-gateway';
    const apiUrl = `${baseUrl}/dynamicQR`;
    
    console.log('🟡 Enpay API URL:', apiUrl);

    const response = await axios.post(
      apiUrl,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Merchant-Key': integrationKeys['X-Merchant-Key'],
          'X-Merchant-Secret': integrationKeys['X-Merchant-Secret'],
          'Accept': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('✅ ENPAY API RESPONSE:', {
      code: response.data.code,
      message: response.data.message,
      hasQR: !!response.data.details
    });

    // ✅ Check if Enpay successfully created the transaction
    if (response.data.code === 0) {
      // Enpay QR is BASE64 encoded
      const qrCodeData = response.data.details;
      
      return {
        success: true,
        qrData: `data:image/png;base64,${qrCodeData}`, // Convert to data URL
        paymentUrl: `upi://pay?pa=${merchantHashId}@enpay&pn=Merchant&tr=${transactionData.transactionId}`,
        connector: 'enpay',
        message: 'QR generated via Enpay',
        enpayResponse: response.data,
        enpayTransactionCreated: true,
        enpayTxnId: transactionData.transactionId
      };
    } else {
      console.error('❌ Enpay returned error:', response.data);
      throw new Error(`Enpay API error: ${response.data.message || response.data.code}`);
    }
    
  } catch (error) {
    console.error('❌ ENPAY API FAILED:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      url: error.config?.url
    });
    
    // Provide detailed error
    const errorMsg = error.response?.data?.message || error.message;
    throw new Error(`Enpay QR generation failed: ${errorMsg}`);
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
// controllers/transactionController.js - UPDATE generateDynamicQR function

export const generateDynamicQR = async (req, res) => {
  try {
    const { amount, txnNote = 'Payment for Order' } = req.body;
    const merchantId = req.user.id;
    const merchantName = req.user.firstname + ' ' + (req.user.lastname || '');

    console.log('🟡 Generate Dynamic QR - Start:', { merchantId, merchantName });

    // ✅ Get merchant connector
    const merchantConnectorAccount = await getMerchantConnectorAccount(merchantId);
    
    if (!merchantConnectorAccount) {
      console.log('❌ No connector account found for merchant');
      return res.status(400).json({
        success: false,
        message: 'No payment connector configured. Please set up Enpay connector first.'
      });
    }

    const connectorName = merchantConnectorAccount.name?.toLowerCase();
    
    if (connectorName !== 'enpay') {
      console.log('❌ Connector is not Enpay:', connectorName);
      return res.status(400).json({
        success: false,
        message: 'Please use Enpay connector for QR generation'
      });
    }

    // ✅ Generate transaction IDs
    const transactionId = `ENPAY${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const vendorRefId = `ENPAYVENDOR${Date.now()}`;

    // ✅ CRITICAL: Create transaction with Enpay-specific fields
    const transactionData = {
      transactionId,
      merchantId: merchantId,
      merchantName,
      amount: amount ? parseFloat(amount) : null,
      status: 'INITIATED',
      createdAt: new Date().toISOString(),
      "Commission Amount": 0,
      mid: req.user.mid || 'ENPAY_MID',
      "Settlement Status": "UNSETTLED",
      "Vendor Ref ID": vendorRefId,
      txnNote,
      merchantOrderId: `ENPAYORDER${Date.now()}`,
      txnRefId: transactionId,
      
      // ✅ ENPAY SPECIFIC FIELDS
      connectorUsed: 'enpay',
      connectorAccountId: merchantConnectorAccount._id,
      connectorId: merchantConnectorAccount.connectorId,
      terminalId: merchantConnectorAccount.terminalId,
      merchantHashId: merchantConnectorAccount.integrationKeys?.merchantHashId,
      
      // Payment method details
      paymentMethod: 'UPI',
      paymentGateway: 'Enpay',
      gatewayTransactionId: transactionId,
      
      // UPI Details
      upiId: `${merchantConnectorAccount.integrationKeys?.merchantHashId}@enpay`,
      merchantVpa: `${merchantConnectorAccount.integrationKeys?.merchantHashId}@enpay`,
      
      // Enpay status
      enpayInitiationStatus: 'ATTEMPTED_SUCCESS',
      isEnpayTransaction: true
    };

    console.log('🟡 Creating Enpay transaction:', transactionId);

    // ✅ Save transaction first
    const transaction = new Transaction(transactionData);
    const savedTransaction = await transaction.save();
    
    console.log('✅ Transaction saved successfully:', savedTransaction.transactionId);

    // ✅ Generate QR through Enpay
    console.log('🟡 Calling Enpay API...');
    const qrResult = await generateEnpayQR({
      amount: amount ? parseFloat(amount) : null,
      txnNote,
      transactionId,
      merchantName,
      merchantHashId: merchantConnectorAccount.integrationKeys?.merchantHashId
    }, merchantConnectorAccount.integrationKeys);

    console.log('🟡 Enpay QR Result:', {
      success: qrResult.success,
      hasQR: !!qrResult.qrData,
      enpayTransactionCreated: qrResult.enpayTransactionCreated
    });

    // ✅ Update transaction with Enpay response
    savedTransaction.qrCode = qrResult.qrData;
    savedTransaction.paymentUrl = qrResult.paymentUrl;
    savedTransaction.status = 'INITIATED';
    savedTransaction.enpayTxnId = qrResult.enpayTxnId;
    savedTransaction.enpayResponse = qrResult.enpayResponse;
    savedTransaction.enpayInitiationStatus = 'ATTEMPTED_SUCCESS';
    
    if (qrResult.enpayTransactionCreated) {
      savedTransaction.enpayTransactionStatus = 'CREATED';
      savedTransaction.gatewayTransactionId = qrResult.enpayTxnId;
    }
    
    await savedTransaction.save();

    console.log('✅ Enpay QR generated successfully');

    // ✅ Return proper response
    res.status(200).json({
      success: true,
      transactionId: savedTransaction.transactionId,
      qrCode: qrResult.qrData,
      paymentUrl: qrResult.paymentUrl,
      amount: savedTransaction.amount,
      status: savedTransaction.status,
      connector: 'enpay',
      message: 'QR generated via Enpay',
      enpayTransactionId: qrResult.enpayTxnId,
      enpayStatus: 'CREATED',
      upiId: savedTransaction.upiId,
      merchantHashId: savedTransaction.merchantHashId
    });

  } catch (error) {
    console.error('❌ Generate QR Error:', error);
    
    // Try to save failed transaction
    try {
      if (transaction) {
        transaction.status = 'FAILED';
        transaction.enpayInitiationStatus = 'ATTEMPTED_FAILED';
        transaction.enpayError = error.message;
        await transaction.save();
      }
    } catch (saveError) {
      console.error('❌ Failed to save error transaction:', saveError);
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to generate QR via Enpay',
      error: error.message,
      connector: 'enpay'
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

// Add to controllers/transactionController.js

// ✅ DEBUG MERCHANT CONNECTOR SETUP
export const debugMerchantSetup = async (req, res) => {
  try {
    const merchantId = req.user.id;
    console.log('🔧 Debugging merchant setup for:', merchantId);

    // Check if merchant exists
    const merchant = await mongoose.connection.db.collection('merchants')
      .findOne({ _id: new mongoose.Types.ObjectId(merchantId) });
    
    // Check all merchant connector accounts
    const connectorAccounts = await mongoose.connection.db.collection('merchantconnectoraccounts')
      .find({ userId: new mongoose.Types.ObjectId(merchantId) })
      .toArray();

    // Check available connectors
    const connectors = await mongoose.connection.db.collection('connectors')
      .find({ status: "Active" })
      .toArray();

    res.json({
      success: true,
      merchant: merchant ? {
        _id: merchant._id,
        firstname: merchant.firstname,
        lastname: merchant.lastname,
        email: merchant.email,
        mid: merchant.mid
      } : 'Merchant not found',
      connectorAccounts: connectorAccounts.map(acc => ({
        _id: acc._id,
        name: acc.name,
        connectorId: acc.connectorId,
        status: acc.status,
        terminalId: acc.terminalId
      })),
      availableConnectors: connectors.map(conn => ({
        _id: conn._id,
        name: conn.name,
        connectorType: conn.connectorType,
        status: conn.status
      })),
      message: 'Merchant setup debug information'
    });

  } catch (error) {
    console.error('❌ Debug Merchant Setup Error:', error);
    res.status(500).json({
      success: false,
      message: 'Debug failed',
      error: error.message
    });
  }
};

// Add to controllers/transactionController.js

// ✅ CREATE DEFAULT CONNECTOR ACCOUNT
export const createDefaultConnectorAccount = async (req, res) => {
  try {
    const merchantId = req.user.id;
    console.log('🟡 Creating default connector account for merchant:', merchantId);

    // Get merchant details
    const merchant = await mongoose.connection.db.collection('merchants')
      .findOne({ _id: new mongoose.Types.ObjectId(merchantId) });

    if (!merchant) {
      return res.status(404).json({
        success: false,
        message: 'Merchant not found'
      });
    }

    // Find an active connector (Cashfree or Enpay)
    const connector = await mongoose.connection.db.collection('connectors')
      .findOne({ status: "Active" });

    if (!connector) {
      return res.status(404).json({
        success: false,
        message: 'No active connectors available'
      });
    }

    // Create connector account
    const connectorAccountData = {
      userId: new mongoose.Types.ObjectId(merchantId),
      connectorId: connector._id,
      name: connector.name,
      currency: "INR",
      status: "Active",
      terminalId: `TERM${Date.now()}`,
      integratedonKeys: connector.credentials ? {
        // Add default keys structure based on connector type
        'x-client-id': 'YOUR_CLIENT_ID',
        'x-client-secret': 'YOUR_CLIENT_SECRET', 
        'x-api-version': '2023-08-01'
      } : {},
      limits: {
        defaultCurrency: "INR",
        minTransactionAmount: 100,
        maxTransactionAmount: 10000
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await mongoose.connection.db.collection('merchantconnectoraccounts')
      .insertOne(connectorAccountData);

    console.log('✅ Default connector account created:', result.insertedId);

    res.json({
      success: true,
      message: 'Default connector account created successfully',
      connectorAccount: {
        connectorId: connector._id,
        connectorName: connector.name,
        terminalId: connectorAccountData.terminalId
      }
    });

  } catch (error) {
    console.error('❌ Create Default Connector Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create connector account',
      error: error.message
    });
  }
};