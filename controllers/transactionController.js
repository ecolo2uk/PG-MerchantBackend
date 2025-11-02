import Transaction from "../models/Transaction.js";
import QrTransaction from "../models/QrTransaction.js";
import EnpayService from "../services/enpayService.js";

const generateTransactionId = () => `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateTxnRefId = () => `REF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;


export const getTransactions = async (req, res) => {
  try {
    const merchantId = req.user.id;
    console.log("🟡 Fetching transactions for merchant:", merchantId);

    // Get from QR collection only (no validation issues)
    const qrTransactions = await QrTransaction.find({ merchantId })
      .sort({ createdAt: -1 })
      .select('-__v');

    console.log(`✅ Found ${qrTransactions.length} transactions in QR collection`);
    
    res.json(qrTransactions);

  } catch (error) {
    console.error("❌ Error fetching transactions:", error);
    res.status(500).json({ 
      code: 500,
      message: "Failed to fetch transactions",
      error: error.message 
    });
  }
};

// UPDATED generateDynamicQR - Use ONLY QrTransaction
// transactionController.js

// ... (other imports and helper functions)

// UPDATED generateDynamicQR - Use ONLY QrTransaction and integrate Enpay
export const generateDynamicQR = async (req, res) => {
  try {
    const { amount, txnNote = "Payment for Order" } = req.body;
    const merchantId = req.user.id;
    const merchantName = `${req.user.firstname || ''} ${req.user.lastname || ''}`.trim() || "SKYPAL SYSTEM PRIVATE LIMITED";

    console.log("🟡 Dynamic QR Request:", { merchantId, merchantName, amount, txnNote });

    if (!amount || amount <= 0) {
      return res.status(400).json({
        code: 400,
        message: "Valid amount is required and must be greater than 0"
      });
    }

    // Generate unique IDs
    const transactionId = generateTransactionId(); // Your internal transaction ID
    const txnRefId = generateTxnRefId(); // Your internal transaction reference ID
    const merchantOrderId = `ORDER${Date.now()}${Math.floor(Math.random() * 1000)}`; // Enpay requires a unique merchantOrderId

    // Create UPI URL (for the QR image)
    const upiId = "enpay1.skypal@fino"; // Using your default UPI ID
    const paymentUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&am=${amount}&tn=${encodeURIComponent(txnNote)}&tr=${txnRefId}&cu=INR`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(paymentUrl)}`;

    // Data for QrTransaction collection
    const qrTransactionData = {
      transactionId: transactionId,
      merchantId: merchantId,
      merchantName: merchantName,
      amount: parseFloat(amount),
      status: "INITIATED",
      qrCode: qrCodeUrl,
      paymentUrl: paymentUrl, // This is the upi:// link
      txnNote: txnNote,
      txnRefId: txnRefId,
      upiId: upiId,
      merchantVpa: upiId, // Assuming merchantVpa is the same as upiId for now
      merchantOrderId: merchantOrderId, // Store this for Enpay
      merchantHashId: "MERCDSH51Y7CD4YJLFIZR8NF" // Your Enpay Hash ID
    };

    // Attempt to initiate collect request with Enpay
    let enpayInitiated = false;
    let enpayResponse = null;
    try {
      enpayResponse = await EnpayService.initiateCollectRequest({
        amount: parseFloat(amount),
        merchantOrderId: merchantOrderId, // Use the generated merchantOrderId
        transactionId: transactionId, // Use your internal transaction ID as merchantTrnId
        txnNote: txnNote
      });

      if (enpayResponse.success) {
        enpayInitiated = true;
        // Optionally store Enpay's transaction ID if they return one
        // qrTransactionData.enpayTxnId = enpayResponse.data.enpayTxnId;
        console.log("✅ Enpay collect request initiated successfully.");
      } else {
        console.warn("⚠️ Enpay collect request failed but QR generated locally:", enpayResponse.error);
        // You might want to update status to FAILED_ENPAY_INITIATION or similar
      }
    } catch (enpayError) {
      console.error("❌ Error calling EnpayService:", enpayError.message);
      // Continue without Enpay initiation if there's an error
    }

    console.log("🟡 Saving to QR transactions collection...");
    const qrTransaction = new QrTransaction(qrTransactionData);
    await qrTransaction.save();
    console.log("✅ Successfully saved to QR transactions collection");

    res.json({
      code: 200,
      message: "QR generated successfully",
      transaction: {
        transactionId: qrTransaction.transactionId,
        amount: qrTransaction.amount,
        status: qrTransaction.status,
        upiId: qrTransaction.upiId,
        txnRefId: qrTransaction.txnRefId,
        qrCode: qrTransaction.qrCode,
        paymentUrl: qrTransaction.paymentUrl,
        txnNote: qrTransaction.txnNote,
        merchantName: qrTransaction.merchantName,
        createdAt: qrTransaction.createdAt,
        merchantOrderId: qrTransaction.merchantOrderId // Include this
      },
      qrCode: qrCodeUrl,
      upiUrl: paymentUrl,
      enpayInitiated: enpayInitiated // Inform the frontend if Enpay was called
    });

  } catch (error) {
    console.error("❌ QR Generation Error:", error);
    res.status(500).json({
      code: 500,
      message: "QR generation failed",
      error: error.message
    });
  }
};

// Generate default QR (without amount) - USING NEW COLLECTION
export const generateDefaultQR = async (req, res) => {
  try {
    const merchantId = req.user.id;
    const merchantName = `${req.user.firstname || ''} ${req.user.lastname || ''}`.trim() || "SKYPAL SYSTEM PRIVATE LIMITED";

    console.log("🟡 Default QR Request from:", merchantName);

    // Generate unique IDs
    const transactionId = generateTransactionId();
    const txnRefId = generateTxnRefId();
    const merchantOrderId = `ORDER${Date.now()}${Math.floor(Math.random() * 1000)}`; // Enpay requires a unique merchantOrderId

    // Create UPI URL without amount
    const upiId = "enpay1.skypal@fino";
    const paymentUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&tn=Default%20QR%20Payment&tr=${txnRefId}&cu=INR`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(paymentUrl)}`;

    // Create transaction data for QrTransaction collection
    const transactionData = {
      transactionId: transactionId,
      merchantId: merchantId,
      merchantName: merchantName,
      amount: 0, // Default QR has 0 amount
      status: "INITIATED",
      qrCode: qrCodeUrl,
      paymentUrl: paymentUrl,
      txnNote: "Default QR Payment",
      txnRefId: txnRefId,
      upiId: upiId,
      merchantVpa: upiId,
      merchantOrderId: merchantOrderId // Store this for Enpay
    };

    // Attempt to initiate collect request with Enpay (even for default QR, if you want it tracked by Enpay)
    let enpayInitiated = false;
    let enpayResponse = null;
    if (transactionData.amount > 0) { // Only call Enpay if there's an amount
       try {
        enpayResponse = await EnpayService.initiateCollectRequest({
          amount: parseFloat(transactionData.amount),
          merchantOrderId: merchantOrderId,
          transactionId: transactionId,
          txnNote: transactionData.txnNote
        });

        if (enpayResponse.success) {
          enpayInitiated = true;
          console.log("✅ Enpay collect request initiated successfully for default QR.");
        } else {
          console.warn("⚠️ Enpay collect request failed for default QR but QR generated locally:", enpayResponse.error);
        }
      } catch (enpayError) {
        console.error("❌ Error calling EnpayService for default QR:", enpayError.message);
      }
    }


    console.log("🟡 Saving default QR to new collection:", transactionData);
    const transaction = new QrTransaction(transactionData);
    await transaction.save();
    console.log("✅ Default QR transaction saved:", transaction.transactionId);

    res.json({
      code: 200,
      message: "Default QR generated successfully",
      transaction: {
        transactionId: transaction.transactionId,
        amount: transaction.amount,
        status: transaction.status,
        upiId: transaction.upiId,
        txnRefId: transaction.txnRefId,
        qrCode: transaction.qrCode,
        paymentUrl: transaction.paymentUrl,
        txnNote: transaction.txnNote,
        merchantName: transaction.merchantName,
        createdAt: transaction.createdAt,
        merchantOrderId: transaction.merchantOrderId
      },
      qrCode: qrCodeUrl,
      upiUrl: paymentUrl,
      enpayInitiated: enpayInitiated
    });

  } catch (error) {
    console.error("❌ Default QR Error:", error);
    res.status(500).json({
      code: 500,
      message: "Default QR generation failed",
      error: error.message
    });
  }
};

// ... (rest of your transactionController.js)

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

    console.log("🟡 Webhook Received for QrTransaction:", req.body);

    let transaction;

    // Find in QrTransaction collection
    if (transactionId) {
      transaction = await QrTransaction.findOne({ transactionId });
    } 
    if (!transaction && merchantOrderId) {
      transaction = await QrTransaction.findOne({ merchantOrderId });
    }
    if (!transaction && txnRefId) {
      transaction = await QrTransaction.findOne({ txnRefId });
    }

    if (transaction) {
      console.log(`✅ Found QrTransaction: ${transaction.transactionId}, Current status: ${transaction.status}`);

      const oldStatus = transaction.status;
      
      // Update transaction fields
      if (status) transaction.status = status;
      if (upiId) transaction.upiId = upiId;
      if (amount) transaction.amount = parseFloat(amount);
      if (customerName) transaction.customerName = customerName;
      if (customerVpa) transaction.customerVpa = customerVpa;
      if (customerContact) transaction.customerContact = customerContact;
      if (settlementStatus) transaction.settlementStatus = settlementStatus;
      
      await transaction.save();
      
      console.log(`✅ QrTransaction ${transaction.transactionId} updated from ${oldStatus} to: ${transaction.status}`);
      
      res.json({ 
        code: 200, 
        message: "Webhook processed successfully",
        transactionId: transaction.transactionId,
        oldStatus: oldStatus,
        newStatus: transaction.status,
        amount: transaction.amount
      });
    } else {
      console.log("❌ Transaction not found in QrTransaction collection");
      res.status(404).json({ 
        code: 404,
        message: "Transaction not found in QrTransaction collection" 
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

// Helper function to create transaction in main collection from QR transaction
const createMainTransactionFromQR = async (qrTransaction, webhookData) => {
  const mainTransactionData = {
    transactionId: qrTransaction.transactionId,
    merchantId: qrTransaction.merchantId.toString(),
    merchantName: qrTransaction.merchantName,
    amount: qrTransaction.amount,
    status: webhookData.status || qrTransaction.status,
    qrCode: qrTransaction.qrCode,
    paymentUrl: qrTransaction.paymentUrl,
    txnNote: qrTransaction.txnNote,
    txnRefId: qrTransaction.txnRefId,
    upiId: qrTransaction.upiId,
    merchantVpa: qrTransaction.merchantVpa,
    // Required schema fields
    "Commission Amount": 0,
    createdAt: qrTransaction.createdAt || new Date().toISOString(),
    mid: `MID${Date.now()}`,
    "Settlement Status": webhookData.settlementStatus || "Unsettled",
    "Vendor Ref ID": qrTransaction.txnRefId || `VENDORREF${Date.now()}`,
    // Webhook data
    "Customer Name": webhookData.customerName || null,
    "Customer VPA": webhookData.customerVpa || null,
    "Customer Contact No": webhookData.customerContact || null,
    merchantOrderId: `ORDER${Date.now()}`
  };

  const mainTransaction = new Transaction(mainTransactionData);
  await mainTransaction.save();
  console.log("✅ Successfully synced QR transaction to main collection");
  return mainTransaction;
};

// Helper function to create transaction from webhook data
const createTransactionFromWebhook = async (webhookData) => {
  const transactionData = {
    transactionId: webhookData.transactionId || `TXN${Date.now()}`,
    merchantId: "webhook_created", // You might need to determine merchant ID
    merchantName: "SKYPAL SYSTEM PRIVATE LIMITED",
    amount: parseFloat(webhookData.amount) || 0,
    status: webhookData.status || "SUCCESS",
    upiId: webhookData.upiId || "enpay1.skypal@fino",
    txnRefId: webhookData.txnRefId,
    // Required schema fields
    "Commission Amount": 0,
    createdAt: new Date().toISOString(),
    mid: `MID${Date.now()}`,
    "Settlement Status": webhookData.settlementStatus || "Unsettled",
    "Vendor Ref ID": webhookData.txnRefId || `VENDORREF${Date.now()}`,
    // Webhook data
    "Customer Name": webhookData.customerName || null,
    "Customer VPA": webhookData.customerVpa || null,
    "Customer Contact No": webhookData.customerContact || null,
    merchantOrderId: `ORDER${Date.now()}`
  };

  const transaction = new Transaction(transactionData);
  await transaction.save();
  console.log("✅ Created new transaction from webhook data");
  return transaction;
};

// Test endpoint to simulate payment webhook
export const simulatePaymentWebhook = async (req, res) => {
  try {
    const { transactionId, amount = 100 } = req.body;
    
    const webhookData = {
      transactionId: transactionId,
      status: "SUCCESS",
      upiId: "customer@upi",
      amount: amount,
      txnRefId: `REF${Date.now()}`,
      customerName: "Test Customer",
      customerVpa: "customer@okicici",
      customerContact: "9876543210",
      settlementStatus: "Unsettled"
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
// export const handlePaymentWebhook = async (req, res) => {
//   try {
//     const { 
//       transactionId, 
//       status, 
//       upiId, 
//       amount, 
//       txnRefId, 
//       customerName, 
//       customerVpa, 
//       customerContact,
//       settlementStatus 
//     } = req.body;

//     console.log("🟡 Webhook Received:", req.body);

//     let transaction;

//     // Find transaction by transactionId or txnRefId
//     if (transactionId) {
//       transaction = await Transaction.findOne({ transactionId });
//     } 
//     if (!transaction && txnRefId) {
//       transaction = await Transaction.findOne({ txnRefId });
//     }

//     if (transaction) {
//       // Update transaction fields
//       if (status) transaction.status = status;
//       if (upiId) transaction.upiId = upiId;
//       if (amount) transaction.amount = parseFloat(amount);
//       if (customerName) transaction["Customer Name"] = customerName;
//       if (customerVpa) transaction["Customer VPA"] = customerVpa;
//       if (customerContact) transaction["Customer Contact No"] = customerContact;
//       if (settlementStatus) transaction["Settlement Status"] = settlementStatus;
      
//       await transaction.save();
      
//       console.log(`✅ Transaction ${transaction.transactionId} updated to: ${status}`);
      
//       res.json({ 
//         code: 200, 
//         message: "Webhook processed successfully",
//         transactionId: transaction.transactionId,
//         status: transaction.status
//       });
//     } else {
//       console.log("❌ Transaction not found for webhook");
//       res.status(404).json({ 
//         code: 404,
//         message: "Transaction not found" 
//       });
//     }

//   } catch (error) {
//     console.error("❌ Webhook Error:", error);
//     res.status(500).json({ 
//       code: 500,
//       message: "Webhook processing failed",
//       error: error.message
//     });
//   }
// };

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


export const debugQRGeneration = async (req, res) => {
  try {
    const { amount, txnNote = "Payment for Order" } = req.body;
    const merchantId = req.user.id;
    const merchantName = `${req.user.firstname || ''} ${req.user.lastname || ''}`.trim() || "SKYPAL SYSTEM PRIVATE LIMITED";

    console.log("🔍 DEBUG QR Request:", { merchantId, merchantName, amount, txnNote });

    // Use QrTransaction to avoid validation issues
    const testData = {
      transactionId: `DEBUG${Date.now()}`,
      merchantId: merchantId,
      merchantName: merchantName,
      amount: parseFloat(amount) || 100,
      status: "INITIATED",
      txnNote: txnNote,
      upiId: "enpay1.skypal@fino",
      merchantVpa: "enpay1.skypal@fino",
      merchantOrderId: `DEBUGORDER${Date.now()}`,
      merchantHashId: "MERCDSH51Y7CD4YJLFIZR8NF"
    };

    console.log("🔍 Test Data for QrTransaction:", testData);

    // Test with QrTransaction (no validation)
    const testTransaction = new QrTransaction(testData);
    await testTransaction.save();
    
    res.json({
      code: 200,
      message: "Debug transaction saved successfully to QrTransaction",
      transactionId: testData.transactionId,
      testData: testData,
      collection: "qr_transactions"
    });

  } catch (error) {
    console.error("❌ DEBUG Error:", error);
    res.status(500).json({
      code: 500,
      message: "Debug failed",
      error: error.message,
      stack: error.stack
    });
  }
};


// Add this to your transactionController.js
export const analyzeSchema = async (req, res) => {
  try {
    const db = Transaction.db;
    
    // Get collection validation rules
    const collections = await db.listCollections({ name: 'transactions' }).toArray();
    
    if (collections.length === 0) {
      return res.status(404).json({
        code: 404,
        message: "Transactions collection not found"
      });
    }

    const collectionInfo = collections[0];
    const validationRules = collectionInfo.options.validator || {};
    
    // Get a sample successful document
    const sampleDoc = await db.collection('transactions').findOne({});
    
    // Get all field names from existing documents
    const allDocs = await db.collection('transactions').find({}).limit(10).toArray();
    const allFields = new Set();
    allDocs.forEach(doc => {
      Object.keys(doc).forEach(field => allFields.add(field));
    });

    res.json({
      code: 200,
      collectionName: collectionInfo.name,
      validationRules: validationRules,
      sampleDocument: sampleDoc,
      allFields: Array.from(allFields),
      analysis: {
        hasStrictValidation: !!validationRules.$jsonSchema,
        requiredFields: validationRules.$jsonSchema?.required || [],
        fieldProperties: validationRules.$jsonSchema?.properties || {}
      }
    });
    
  } catch (error) {
    res.status(500).json({
      code: 500,
      error: error.message
    });
  }
};