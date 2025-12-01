// controllers/transactionController.js - FIXED VERSION
import Transaction from '../models/Transaction.js';
import mongoose from 'mongoose';
import axios from 'axios';

// Generate unique IDs
const generateTransactionId = () => `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateEnpayTransactionId = () => `ENPAY${Date.now()}${Math.floor(Math.random() * 1000)}`;

// ✅ 1. GET MERCHANT CONNECTOR ACCOUNT - FIXED
export const getMerchantConnectorAccount = async (merchantId) => {
  try {
    console.log('🟡 Fetching merchant connector account for:', merchantId);
    
    let merchantObjectId;
    try {
      merchantObjectId = new mongoose.Types.ObjectId(merchantId);
    } catch (error) {
      console.log('⚠️ Invalid merchantId, trying string:', merchantId);
      merchantObjectId = merchantId;
    }
    
    const connectorAccount = await mongoose.connection.db.collection('merchantconnectoraccounts')
      .findOne({ 
        userId: merchantObjectId,
        status: "Active"
      });

    if (connectorAccount) {
      console.log('✅ Merchant Connector Account Found:', {
        id: connectorAccount._id,
        name: connectorAccount.name,
        terminalId: connectorAccount.terminalId,
        status: connectorAccount.status
      });
      
      // Get integration keys
      const integrationKeys = connectorAccount.integrationKeys || connectorAccount.integratedonKeys;
      
      return {
        ...connectorAccount,
        integrationKeys: integrationKeys || {}
      };
    }
    
    console.log('❌ No active connector account found for merchant:', merchantId);
    return null;
    
  } catch (error) {
    console.error('❌ Error fetching merchant connector:', error);
    return null;
  }
};

// ✅ 2. ENPAY QR GENERATION - FIXED (CRITICAL)
const generateEnpayQR = async (transactionData, integrationKeys) => {
  try {
    console.log('🔍 ENPAY QR GENERATION STARTED');
    console.log('Transaction Data:', transactionData);

    // Validate credentials
    const requiredKeys = ['X-Merchant-Key', 'X-Merchant-Secret', 'merchantHashId'];
    const missingKeys = requiredKeys.filter(key => !integrationKeys[key]);
    
    if (missingKeys.length > 0) {
      console.error('❌ MISSING ENPAY CREDENTIALS:', missingKeys);
      throw new Error(`Missing Enpay credentials: ${missingKeys.join(', ')}`);
    }

    console.log('✅ Enpay credentials validated');

    // ✅ CRITICAL: Create EXACT payload as Enpay expects
    const payload = {
      merchantHashId: integrationKeys.merchantHashId,
      txnRefId: transactionData.transactionId,
      txnNote: transactionData.txnNote || 'Payment'
    };

    // Add amount only if provided (for dynamic QR)
    if (transactionData.amount && transactionData.amount > 0) {
      payload.txnAmount = parseFloat(transactionData.amount).toFixed(2);
      console.log('💰 Amount added to payload:', payload.txnAmount);
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

    console.log('✅ Enpay API Response Code:', response.data.code);
    console.log('✅ Enpay API Message:', response.data.message);

    // Check Enpay response
    if (response.data.code === 0) {
      // ✅ Transaction successfully created in Enpay
      const qrCodeData = response.data.details;
      
      console.log('✅ Enpay QR generated successfully');
      
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
      console.error('❌ Enpay returned error code:', response.data.code);
      throw new Error(`Enpay error: ${response.data.message || 'Unknown error'}`);
    }
    
  } catch (error) {
    console.error('❌ ENPAY API ERROR DETAILS:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      url: error.config?.url,
      headers: error.config?.headers
    });
    
    throw new Error(`Enpay QR generation failed: ${error.response?.data?.message || error.message}`);
  }
};

// ✅ 3. MAIN DYNAMIC QR FUNCTION - COMPLETELY FIXED
export const generateDynamicQR = async (req, res) => {
   console.log('🚀 ========== GENERATE DYNAMIC QR STARTED ==========');
  console.log('🔍 Request Body:', req.body);
  console.log('🔍 Request Headers:', req.headers['content-type']);
  
  let savedTransaction = null;
  
  try {
    // ✅ FIX 1: Check if body exists
    if (!req.body) {
      console.error('❌ ERROR: req.body is undefined');
      return res.status(400).json({
        success: false,
        message: 'Request body is required',
        error: 'req.body is undefined'
      });
    }
    
    const { amount, txnNote = 'Payment for Order' } = req.body;
    
    // ✅ FIX 2: Log the actual values
    console.log('🟡 Parsed values:', {
      amount: amount,
      txnNote: txnNote,
      bodyType: typeof req.body,
      bodyKeys: Object.keys(req.body)
    });
    
    const merchantId = req.user?.id || req.user?._id;
    const merchantName = req.user?.firstname + ' ' + (req.user?.lastname || '');
    
    if (!merchantId) {
      return res.status(400).json({
        success: false,
        message: 'Merchant ID not found'
      });
    }

    console.log('🟡 Generate Dynamic QR Request:', {
      merchantId,
      merchantName,
      amount,
      txnNote
    });

    // ✅ Step 1: Get Merchant Connector
    console.log('🟡 Step 1: Getting merchant connector...');
    const merchantConnectorAccount = await getMerchantConnectorAccount(merchantId);
    
    if (!merchantConnectorAccount) {
      console.log('❌ No connector account found for merchant');
      return res.status(400).json({
        success: false,
        message: 'No payment connector configured. Please set up a connector first.',
        needsSetup: true
      });
    }

    console.log('✅ Merchant connector found:', merchantConnectorAccount.name);

    // ✅ Step 2: Generate Transaction IDs
    console.log('🟡 Step 2: Generating transaction IDs...');
    const transactionId = generateEnpayTransactionId();
    const txnRefId = transactionId; // Use same as transactionId for Enpay
    const merchantOrderId = `ORDER${Date.now()}`;

    console.log('📝 Generated IDs:', { transactionId, txnRefId, merchantOrderId });

    // ✅ Step 3: Create Transaction Object
    console.log('🟡 Step 3: Creating transaction object...');
    const transactionData = {
      transactionId,
      merchantId: merchantId,
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

    console.log('📊 Transaction data prepared:', transactionData);

    // ✅ Step 4: Save to Database FIRST
    console.log('🟡 Step 4: Saving to database...');
    const transaction = new Transaction(transactionData);
    savedTransaction = await transaction.save();
    
    console.log('✅ Transaction saved in database:', {
      id: savedTransaction._id,
      transactionId: savedTransaction.transactionId,
      amount: savedTransaction.amount
    });

    // ✅ Step 5: Generate QR via Enpay
    console.log('🟡 Step 5: Calling Enpay API...');
    
    const qrResult = await generateEnpayQR({
      amount: amount ? parseFloat(amount) : null,
      txnNote,
      transactionId,
      merchantName,
      merchantHashId: merchantConnectorAccount.integrationKeys?.merchantHashId
    }, merchantConnectorAccount.integrationKeys);

    console.log('✅ QR Generation Result:', {
      success: qrResult.success,
      enpayTransactionCreated: qrResult.enpayTransactionCreated,
      connector: qrResult.connector,
      hasQR: !!qrResult.qrData
    });

    // ✅ Step 6: Update Transaction with QR Data
    console.log('🟡 Step 6: Updating transaction with QR data...');
    
    const updateData = {
      qrCode: qrResult.qrData,
      paymentUrl: qrResult.paymentUrl,
      enpayTxnId: qrResult.enpayTxnId,
      enpayResponse: qrResult.enpayResponse,
      enpayTransactionStatus: 'CREATED',
      enpayInitiationStatus: 'ENPAY_CREATED',
      updatedAt: new Date()
    };

    if (qrResult.enpayTransactionCreated) {
      updateData.status = 'INITIATED';
      updateData.gatewayTransactionId = qrResult.enpayTxnId;
    }

    await Transaction.findByIdAndUpdate(savedTransaction._id, updateData);
    
    // Fetch updated transaction
    const updatedTransaction = await Transaction.findById(savedTransaction._id);
    
    console.log('✅ Transaction updated successfully:', updatedTransaction.transactionId);

    // ✅ Step 7: Return Response
    console.log('🟡 Step 7: Returning response...');
    
    const responseData = {
      success: true,
      transactionId: updatedTransaction.transactionId,
      enpayTxnId: updatedTransaction.enpayTxnId,
      qrCode: updatedTransaction.qrCode,
      paymentUrl: updatedTransaction.paymentUrl,
      amount: updatedTransaction.amount,
      status: updatedTransaction.status,
      connector: 'enpay',
      enpayStatus: 'CREATED',
      merchantHashId: updatedTransaction.merchantHashId,
      upiId: updatedTransaction.upiId,
      message: 'QR generated successfully via Enpay',
      transaction: {
        _id: updatedTransaction._id,
        createdAt: updatedTransaction.createdAt,
        updatedAt: updatedTransaction.updatedAt
      }
    };

    console.log('✅ Response prepared:', responseData);
    console.log('🚀 ========== GENERATE DYNAMIC QR COMPLETED ==========');
    
    res.status(200).json(responseData);

  } catch (error) {
    console.error('❌ GENERATE QR ERROR:', error);
    
    // Update transaction status if it exists
    if (savedTransaction && savedTransaction._id) {
      try {
        await Transaction.findByIdAndUpdate(savedTransaction._id, {
          status: 'FAILED',
          enpayInitiationStatus: 'ATTEMPTED_FAILED',
          enpayError: error.message,
          updatedAt: new Date()
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

// ✅ 4. GET MERCHANT CONNECTOR - FIXED
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
          _id: connectorAccount._id,
          connectorId: connectorAccount.connectorId,
          connectorName: connectorAccount.name,
          connectorType: 'UPI',
          terminalId: connectorAccount.terminalId,
          status: connectorAccount.status,
          hasIntegrationKeys: Object.keys(integrationKeys).length > 0,
          availableKeys: Object.keys(integrationKeys),
          merchantHashId: integrationKeys.merchantHashId,
          // Include actual credentials (masked) for debugging
          X_Merchant_Key: integrationKeys['X-Merchant-Key'] ? '***' + integrationKeys['X-Merchant-Key'].slice(-4) : null,
          merchantHashId_full: integrationKeys.merchantHashId
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

// ✅ 5. GET TRANSACTIONS - FIXED
export const getTransactions = async (req, res) => {
  try {
    const merchantId = req.user.id;
    console.log("🟡 Fetching transactions for merchant:", merchantId);

    // Handle both string and ObjectId merchantId
    let query = { merchantId: merchantId };
    
    try {
      query.merchantId = new mongoose.Types.ObjectId(merchantId);
    } catch (error) {
      console.log('⚠️ Using string merchantId for query');
    }

    const transactions = await Transaction.find(query)
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
      merchantHashId: txn.merchantHashId,
      enpayInitiationStatus: txn.enpayInitiationStatus,
      isEnpayTransaction: txn.isEnpayTransaction
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

// ✅ 6. DEFAULT QR - FIXED
export const generateDefaultQR = async (req, res) => {
  console.log('🔵 ========== GENERATE DEFAULT QR STARTED ==========');
  
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

    console.log('✅ Merchant connector found for default QR');

    const transactionId = `DFT${Date.now()}`;
    const txnRefId = transactionId;

    // Create transaction
    const transactionData = {
      transactionId,
      merchantId: merchantId,
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
    const updateData = {
      qrCode: qrResult.qrData,
      paymentUrl: qrResult.paymentUrl,
      enpayTxnId: qrResult.enpayTxnId,
      enpayResponse: qrResult.enpayResponse,
      enpayTransactionStatus: 'CREATED',
      enpayInitiationStatus: 'ENPAY_CREATED',
      updatedAt: new Date()
    };

    await Transaction.findByIdAndUpdate(savedTransaction._id, updateData);
    
    const updatedTransaction = await Transaction.findById(savedTransaction._id);

    console.log('✅ Default QR generated successfully');

    res.status(200).json({
      success: true,
      transactionId: updatedTransaction.transactionId,
      qrCode: updatedTransaction.qrCode,
      paymentUrl: updatedTransaction.paymentUrl,
      status: updatedTransaction.status,
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

// ✅ 7. CREATE DEFAULT CONNECTOR - FIXED
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

    // Create connector account with REAL credentials
    const connectorAccountData = {
      userId: new mongoose.Types.ObjectId(merchantId),
      connectorId: connector._id,
      name: connector.name,
      currency: 'INR',
      status: 'Active',
      terminalId: `TERM${Date.now()}`,
      integrationKeys: {
        'X-Merchant-Key': '0851439b-03df-4983-88d6-32399b1e4514', // Your actual key
        'X-Merchant-Secret': 'bae97f533a594af9bf3dded47f09c34e15e053d1', // Your actual secret
        'merchantHashId': 'MERCDSH51Y7CD4YJLFIZR8NF', // Your actual hash ID
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

// ✅ 8. DEBUG ENDPOINT
export const debugEndpoint = async (req, res) => {
  try {
    const merchantId = req.user.id;
    
    const merchantConnector = await getMerchantConnectorAccount(merchantId);
    const transactionCount = await Transaction.countDocuments({ merchantId: merchantId });
    const latestTransaction = await Transaction.findOne({ merchantId: merchantId }).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      merchantId,
      merchantConnector: merchantConnector ? {
        name: merchantConnector.name,
        hasIntegrationKeys: !!merchantConnector.integrationKeys,
        integrationKeys: merchantConnector.integrationKeys ? Object.keys(merchantConnector.integrationKeys) : []
      } : null,
      transactionCount,
      latestTransaction: latestTransaction ? {
        transactionId: latestTransaction.transactionId,
        status: latestTransaction.status,
        amount: latestTransaction.amount,
        enpayInitiationStatus: latestTransaction.enpayInitiationStatus
      } : null,
      message: 'Debug information'
    });
    
  } catch (error) {
    console.error('❌ Debug Error:', error);
    res.status(500).json({
      success: false,
      message: 'Debug failed',
      error: error.message
    });
  }
};