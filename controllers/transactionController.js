// controllers/transactionController.js - COMPLETE UPDATED
import Transaction from '../models/Transaction.js';
import mongoose from 'mongoose';
import axios from 'axios';

// Generate unique IDs
const generateTransactionId = () => `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateEnpayTransactionId = () => `ENPAY${Date.now()}${Math.floor(Math.random() * 1000)}`;

// ✅ 1. GET MERCHANT CONNECTOR ACCOUNT
export const getMerchantConnectorAccount = async (merchantId) => {
  try {
    console.log('🟡 Fetching merchant connector account for:', merchantId);
    
    const merchantObjectId = new mongoose.Types.ObjectId(merchantId);
    
    const connectorAccount = await mongoose.connection.db.collection('merchantconnectoraccounts')
      .findOne({ 
        userId: merchantObjectId,
        status: "Active"
      });

    if (connectorAccount) {
      console.log('✅ Merchant Connector Account Found:', {
        id: connectorAccount._id,
        name: connectorAccount.name,
        terminalId: connectorAccount.terminalId
      });
      
      // Get integration keys
      const integrationKeys = connectorAccount.integrationKeys || connectorAccount.integratedonKeys;
      
      return {
        ...connectorAccount,
        integrationKeys: integrationKeys || {}
      };
    }
    
    console.log('❌ No active connector account found');
    return null;
    
  } catch (error) {
    console.error('❌ Error fetching merchant connector:', error);
    return null;
  }
};

// ✅ 2. ENPAY QR GENERATION (FIXED)
const generateEnpayQR = async (transactionData, integrationKeys) => {
  try {
    console.log('🔍 ENPAY QR GENERATION STARTED');
    console.log('Transaction Data:', transactionData);
    console.log('Integration Keys:', Object.keys(integrationKeys));

    // Validate credentials
    const requiredKeys = ['X-Merchant-Key', 'X-Merchant-Secret', 'merchantHashId'];
    const missingKeys = requiredKeys.filter(key => !integrationKeys[key]);
    
    if (missingKeys.length > 0) {
      throw new Error(`Missing Enpay credentials: ${missingKeys.join(', ')}`);
    }

    // ✅ CRITICAL: Create EXACT payload as Enpay expects
    const payload = {
      merchantHashId: integrationKeys.merchantHashId,
      txnRefId: transactionData.transactionId,
      txnNote: transactionData.txnNote || 'Payment'
    };

    // Add amount only if provided (for dynamic QR)
    if (transactionData.amount && transactionData.amount > 0) {
      payload.txnAmount = parseFloat(transactionData.amount).toFixed(2);
    }

    console.log('🟡 Enpay API Payload:', payload);

    // Use base URL from integration keys or default
    const baseUrl = integrationKeys.baseUrl || 'https://api.enpay.in/enpay-product-service/api/v1/merchant-gateway';
    const apiUrl = `${baseUrl}/dynamicQR`;
    
    console.log('🟡 Calling Enpay API:', apiUrl);

    const response = await axios.post(apiUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Merchant-Key': integrationKeys['X-Merchant-Key'],
        'X-Merchant-Secret': integrationKeys['X-Merchant-Secret'],
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    console.log('✅ Enpay API Response:', {
      code: response.data.code,
      message: response.data.message,
      hasQR: !!response.data.details
    });

    // Check Enpay response
    if (response.data.code === 0) {
      // ✅ Transaction successfully created in Enpay
      const qrCodeData = response.data.details;
      
      return {
        success: true,
        enpayTransactionCreated: true,
        enpayTxnId: transactionData.transactionId,
        enpayResponse: response.data,
        qrData: `data:image/png;base64,${qrCodeData}`,
        paymentUrl: `upi://pay?pa=${integrationKeys.merchantHashId}@enpay&pn=${encodeURIComponent(transactionData.merchantName)}&tn=${encodeURIComponent(transactionData.txnNote)}&tr=${transactionData.transactionId}`,
        connector: 'enpay',
        message: 'QR generated via Enpay'
      };
    } else {
      throw new Error(`Enpay error: ${response.data.message}`);
    }
    
  } catch (error) {
    console.error('❌ Enpay API Error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      url: error.config?.url
    });
    
    throw new Error(`Enpay QR generation failed: ${error.response?.data?.message || error.message}`);
  }
};

// ✅ 3. MAIN DYNAMIC QR FUNCTION (COMPLETELY FIXED)
export const generateDynamicQR = async (req, res) => {
  let transaction;
  
  try {
    const { amount, txnNote = 'Payment for Order' } = req.body;
    const merchantId = req.user.id;
    const merchantName = req.user.firstname + ' ' + (req.user.lastname || '');

    console.log('🟡 Generate Dynamic QR Request:', {
      merchantId,
      merchantName,
      amount,
      txnNote
    });

    // ✅ Step 1: Get Merchant Connector
    const merchantConnectorAccount = await getMerchantConnectorAccount(merchantId);
    
    if (!merchantConnectorAccount) {
      console.log('❌ No connector account found');
      return res.status(400).json({
        success: false,
        message: 'No payment connector configured. Please set up a connector first.',
        needsSetup: true
      });
    }

    // Check if it's Enpay connector
    const connectorName = merchantConnectorAccount.name?.toLowerCase();
    if (connectorName !== 'enpay') {
      console.log('❌ Not an Enpay connector:', connectorName);
      return res.status(400).json({
        success: false,
        message: 'Please use Enpay connector for QR generation'
      });
    }

    // ✅ Step 2: Generate Transaction IDs
    const transactionId = generateEnpayTransactionId();
    const txnRefId = `ENPAYREF${Date.now()}`;
    const merchantOrderId = `ORDER${Date.now()}`;

    // ✅ Step 3: Create Transaction Object (WITH PROPER FIELD NAMES)
    const transactionData = {
      transactionId,
      merchantId: new mongoose.Types.ObjectId(merchantId),
      merchantName,
      amount: amount ? parseFloat(amount) : null,
      status: 'INITIATED',
      txnNote,
      
      // Enpay Specific
      enpayInitiationStatus: 'ATTEMPTED_SUCCESS',
      isEnpayTransaction: true,
      
      // Connector Info
      connectorUsed: 'enpay',
      connectorAccountId: merchantConnectorAccount._id,
      connectorId: merchantConnectorAccount.connectorId,
      terminalId: merchantConnectorAccount.terminalId,
      merchantHashId: merchantConnectorAccount.integrationKeys?.merchantHashId,
      
      // Payment Info
      paymentGateway: 'Enpay',
      gatewayTransactionId: transactionId,
      paymentMethod: 'UPI',
      merchantOrderId,
      txnRefId,
      
      // UPI Info
      upiId: `${merchantConnectorAccount.integrationKeys?.merchantHashId}@enpay`,
      merchantVpa: `${merchantConnectorAccount.integrationKeys?.merchantHashId}@enpay`,
      
      // Settlement Info
      commissionAmount: 0,
      netAmount: amount ? parseFloat(amount) : 0,
      mid: req.user.mid || 'ENPAY_MID',
      settlementStatus: 'UNSETTLED',
      vendorRefId: `VENDOR${Date.now()}`
    };

    console.log('🟡 Creating transaction in database...');
    
    // ✅ Step 4: Save to Database FIRST
    transaction = new Transaction(transactionData);
    const savedTransaction = await transaction.save();
    
    console.log('✅ Transaction saved in database:', savedTransaction.transactionId);

    // ✅ Step 5: Generate QR via Enpay
    console.log('🟡 Calling Enpay API to generate QR...');
    
    const qrResult = await generateEnpayQR({
      amount: amount ? parseFloat(amount) : null,
      txnNote,
      transactionId,
      merchantName,
      merchantHashId: merchantConnectorAccount.integrationKeys?.merchantHashId
    }, merchantConnectorAccount.integrationKeys);

    console.log('🟡 QR Generation Result:', {
      success: qrResult.success,
      enpayTransactionCreated: qrResult.enpayTransactionCreated,
      connector: qrResult.connector
    });

    // ✅ Step 6: Update Transaction with QR Data
    savedTransaction.qrCode = qrResult.qrData;
    savedTransaction.paymentUrl = qrResult.paymentUrl;
    savedTransaction.enpayTxnId = qrResult.enpayTxnId;
    savedTransaction.enpayResponse = qrResult.enpayResponse;
    savedTransaction.enpayTransactionStatus = 'CREATED';
    savedTransaction.enpayInitiationStatus = 'ENPAY_CREATED';
    
    if (qrResult.enpayTransactionCreated) {
      savedTransaction.status = 'INITIATED';
      savedTransaction.gatewayTransactionId = qrResult.enpayTxnId;
    }
    
    await savedTransaction.save();

    console.log('✅ Transaction updated with QR data:', savedTransaction.transactionId);

    // ✅ Step 7: Return Response
    res.status(200).json({
      success: true,
      transactionId: savedTransaction.transactionId,
      enpayTxnId: savedTransaction.enpayTxnId,
      qrCode: savedTransaction.qrCode,
      paymentUrl: savedTransaction.paymentUrl,
      amount: savedTransaction.amount,
      status: savedTransaction.status,
      connector: 'enpay',
      enpayStatus: 'CREATED',
      merchantHashId: savedTransaction.merchantHashId,
      upiId: savedTransaction.upiId,
      message: 'QR generated successfully via Enpay',
      transaction: {
        _id: savedTransaction._id,
        createdAt: savedTransaction.createdAt,
        updatedAt: savedTransaction.updatedAt
      }
    });

  } catch (error) {
    console.error('❌ Generate QR Error:', error);
    
    // Update transaction status if it exists
    if (transaction && transaction._id) {
      try {
        await Transaction.findByIdAndUpdate(transaction._id, {
          status: 'FAILED',
          enpayInitiationStatus: 'ATTEMPTED_FAILED',
          enpayError: error.message
        });
        console.log('✅ Updated transaction as FAILED');
      } catch (updateError) {
        console.error('❌ Failed to update transaction status:', updateError);
      }
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to generate QR',
      error: error.message,
      details: error.response?.data || null,
      connector: 'enpay'
    });
  }
};

// ✅ 4. GET MERCHANT CONNECTOR (FIXED)
export const getMerchantConnector = async (req, res) => {
  try {
    const merchantId = req.user.id;
    console.log('🟡 Fetching connector for merchant:', merchantId);

    const connectorAccount = await getMerchantConnectorAccount(merchantId);
    
    if (connectorAccount) {
      const integrationKeys = connectorAccount.integrationKeys || {};
      
      res.json({
        success: true,
        connectorAccount: {
          connectorId: connectorAccount.connectorId,
          connectorName: connectorAccount.name,
          connectorType: 'UPI',
          terminalId: connectorAccount.terminalId,
          status: connectorAccount.status,
          hasIntegrationKeys: Object.keys(integrationKeys).length > 0,
          availableKeys: Object.keys(integrationKeys),
          merchantHashId: integrationKeys.merchantHashId
        },
        message: 'Enpay connector found'
      });
    } else {
      res.json({
        success: false,
        message: 'No active Enpay connector found',
        needsSetup: true
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

// ✅ 5. GET TRANSACTIONS (FIXED)
export const getTransactions = async (req, res) => {
  try {
    const merchantId = req.user.id;
    console.log("🟡 Fetching transactions for merchant:", merchantId);

    const transactions = await Transaction.find({ 
      merchantId: new mongoose.Types.ObjectId(merchantId) 
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

    console.log(`✅ Found ${transactions.length} transactions`);

    // Format response
    const formattedTransactions = transactions.map(txn => ({
      _id: txn._id,
      transactionId: txn.transactionId,
      transactionRefId: txn.txnRefId || txn.transactionId,
      amount: txn.amount,
      status: txn.status,
      settlementStatus: txn.settlementStatus || 'UNSETTLED',
      createdAt: txn.createdAt,
      updatedAt: txn.updatedAt,
      merchantName: txn.merchantName,
      customerName: txn.customerName,
      customerVPA: txn.customerVPA,
      customerContact: txn.customerContact,
      commission: txn.commissionAmount || 0,
      netAmount: txn.netAmount || txn.amount || 0,
      paymentMethod: txn.paymentMethod || 'UPI',
      qrCode: txn.qrCode,
      paymentUrl: txn.paymentUrl,
      connectorUsed: txn.connectorUsed,
      enpayTxnId: txn.enpayTxnId,
      merchantHashId: txn.merchantHashId
    }));

    res.json(formattedTransactions);

  } catch (error) {
    console.error("❌ Error fetching transactions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transactions",
      error: error.message
    });
  }
};

// ✅ 6. DEFAULT QR (FIXED)
export const generateDefaultQR = async (req, res) => {
  try {
    const merchantId = req.user.id;
    const merchantName = req.user.firstname + ' ' + (req.user.lastname || '');

    console.log('🔵 Generate Default QR for:', merchantId);

    // Get merchant connector
    const merchantConnectorAccount = await getMerchantConnectorAccount(merchantId);
    
    if (!merchantConnectorAccount) {
      return res.status(400).json({
        success: false,
        message: 'No payment connector configured'
      });
    }

    const transactionId = `DFT${Date.now()}`;
    const txnRefId = `DFTREF${Date.now()}`;

    // Create transaction
    const transactionData = {
      transactionId,
      merchantId: new mongoose.Types.ObjectId(merchantId),
      merchantName,
      amount: null,
      status: 'INITIATED',
      txnNote: 'Default QR Payment',
      isDefaultQR: true,
      
      // Enpay info
      connectorUsed: 'enpay',
      connectorAccountId: merchantConnectorAccount._id,
      connectorId: merchantConnectorAccount.connectorId,
      merchantHashId: merchantConnectorAccount.integrationKeys?.merchantHashId,
      
      // Payment info
      paymentGateway: 'Enpay',
      gatewayTransactionId: transactionId,
      paymentMethod: 'UPI',
      txnRefId,
      merchantOrderId: `ORDER${Date.now()}`,
      
      // UPI info
      upiId: `${merchantConnectorAccount.integrationKeys?.merchantHashId}@enpay`,
      merchantVpa: `${merchantConnectorAccount.integrationKeys?.merchantHashId}@enpay`,
      
      // Settlement
      commissionAmount: 0,
      netAmount: 0,
      mid: req.user.mid || 'ENPAY_MID',
      settlementStatus: 'UNSETTLED'
    };

    const transaction = new Transaction(transactionData);
    const savedTransaction = await transaction.save();
    
    console.log('✅ Default QR transaction saved:', savedTransaction.transactionId);

    // Generate Enpay QR (without amount)
    const qrResult = await generateEnpayQR({
      amount: null,
      txnNote: 'Default QR Payment',
      transactionId,
      merchantName,
      merchantHashId: merchantConnectorAccount.integrationKeys?.merchantHashId
    }, merchantConnectorAccount.integrationKeys);

    // Update transaction
    savedTransaction.qrCode = qrResult.qrData;
    savedTransaction.paymentUrl = qrResult.paymentUrl;
    savedTransaction.enpayTxnId = qrResult.enpayTxnId;
    savedTransaction.enpayResponse = qrResult.enpayResponse;
    savedTransaction.enpayTransactionStatus = 'CREATED';
    savedTransaction.enpayInitiationStatus = 'ENPAY_CREATED';
    await savedTransaction.save();

    console.log('✅ Default QR generated successfully');

    res.status(200).json({
      success: true,
      transactionId: savedTransaction.transactionId,
      qrCode: savedTransaction.qrCode,
      paymentUrl: savedTransaction.paymentUrl,
      status: savedTransaction.status,
      isDefault: true,
      connector: 'enpay',
      message: 'Default QR generated successfully'
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

// ✅ 7. CREATE DEFAULT CONNECTOR (FIXED)
export const createDefaultConnectorAccount = async (req, res) => {
  try {
    const merchantId = req.user.id;
    console.log('🟡 Creating default Enpay connector for merchant:', merchantId);

    // Get merchant
    const merchant = await mongoose.connection.db.collection('merchants')
      .findOne({ _id: new mongoose.Types.ObjectId(merchantId) });

    if (!merchant) {
      return res.status(404).json({
        success: false,
        message: 'Merchant not found'
      });
    }

    // Get Enpay connector
    const connector = await mongoose.connection.db.collection('connectors')
      .findOne({ name: 'enpay', status: 'Active' });

    if (!connector) {
      return res.status(404).json({
        success: false,
        message: 'Enpay connector not available'
      });
    }

    // Create connector account
    const connectorAccountData = {
      userId: new mongoose.Types.ObjectId(merchantId),
      connectorId: connector._id,
      name: connector.name,
      currency: 'INR',
      status: 'Active',
      terminalId: `TERM${Date.now()}`,
      integrationKeys: {
        'X-Merchant-Key': 'YOUR_MERCHANT_KEY',
        'X-Merchant-Secret': 'YOUR_MERCHANT_SECRET',
        'merchantHashId': 'YOUR_MERCHANT_HASH_ID',
        'baseUrl': 'https://api.enpay.in/enpay-product-service/api/v1/merchant-gateway'
      },
      limits: {
        defaultCurrency: 'INR',
        minTransactionAmount: 100,
        maxTransactionAmount: 10000
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await mongoose.connection.db.collection('merchantconnectoraccounts')
      .insertOne(connectorAccountData);

    console.log('✅ Default Enpay connector created:', result.insertedId);

    res.json({
      success: true,
      message: 'Enpay connector created successfully',
      connectorAccount: {
        connectorId: connector._id,
        connectorName: connector.name,
        terminalId: connectorAccountData.terminalId
      }
    });

  } catch (error) {
    console.error('❌ Create Connector Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create connector',
      error: error.message
    });
  }
};