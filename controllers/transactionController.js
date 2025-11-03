import Transaction from "../models/Transaction.js";
import QrTransaction from "../models/QrTransaction.js";
import mongoose from 'mongoose';

const generateTransactionId = () => `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateTxnRefId = () => `REF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
const generateMid = () => `MID${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateVendorRefId = () => `VENDOR${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

// 🔥 FIXED: Proper field generation and validation
export const generateDynamicQR = async (req, res) => {
  try {
    console.log("🟡 generateDynamicQR - Processing request...");
    console.log("Full req.body:", req.body);
    
    // Handle amount parsing
    let amountValue = req.body.amount;
    let parsedAmount;

    // Handle [object Object] case
    if (amountValue && typeof amountValue === 'object') {
      console.log("🚨 EMERGENCY: Amount is object, attempting recovery...");
      amountValue = amountValue.value || amountValue.amount || 
                   amountValue.data || Object.values(amountValue).find(val => 
                     typeof val === 'number' || (typeof val === 'string' && !isNaN(parseFloat(val)))
                   );
      console.log("Recovered amount value:", amountValue);
    }

    // Parse the amount
    if (typeof amountValue === 'number') {
      parsedAmount = amountValue;
    } else if (typeof amountValue === 'string') {
      parsedAmount = parseFloat(amountValue);
    } else if (amountValue === undefined || amountValue === null) {
      return res.status(400).json({
        code: 400,
        message: "Amount is required"
      });
    } else {
      try {
        const stringValue = String(amountValue).replace('[object Object]', '').trim();
        parsedAmount = parseFloat(stringValue);
      } catch (error) {
        return res.status(400).json({
          code: 400,
          message: `Invalid amount format: ${amountValue}`
        });
      }
    }

    console.log("🟡 Final parsed amount:", parsedAmount);

    // Validation
    if (isNaN(parsedAmount)) {
      return res.status(400).json({
        code: 400,
        message: `Amount must be a valid number. Received: ${amountValue}`
      });
    }

    if (parsedAmount <= 0) {
      return res.status(400).json({
        code: 400,
        message: "Amount must be greater than 0"
      });
    }

    const { txnNote = "Payment for Order" } = req.body;
    const merchantId = req.user.id;
    const merchantName = `${req.user.firstname || ''} ${req.user.lastname || ''}`.trim() || "SKYPAL SYSTEM PRIVATE LIMITED";

    console.log("✅ Amount validation passed:", parsedAmount);

    // Generate unique IDs with proper format
    const transactionId = generateTransactionId();
    const txnRefId = generateTxnRefId();
    const merchantOrderId = `ORDER${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const mid = generateMid();
    const vendorRefId = generateVendorRefId();

    // Create UPI URL and QR Code
    const upiId = "enpay1.skypal@fino";
    const paymentUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&am=${parsedAmount}&tn=${encodeURIComponent(txnNote)}&tr=${txnRefId}&cu=INR`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(paymentUrl)}`;

    // 🔥 CRITICAL FIX: Ensure all required fields are present
    const transactionData = {
      transactionId,
      merchantId: new mongoose.Types.ObjectId(merchantId),
      merchantName,
      amount: parsedAmount,
      status: "INITIATED",
      qrCode: qrCodeUrl,
      paymentUrl,
      txnNote,
      txnRefId,
      upiId,
      merchantVpa: upiId,
      merchantOrderId,
      mid, // ✅ Now properly generated
      "Vendor Ref ID": vendorRefId, // ✅ Now properly generated
      "Commission Amount": 0,
      "Settlement Status": "Unsettled",
      createdAt: new Date()
    };

    console.log("🟡 Saving to MAIN Transaction collection:", transactionData);

    // 🔥 VALIDATION: Create instance and validate
    let mainTransaction;
    try {
      mainTransaction = new Transaction(transactionData);
      
      // Validate before saving
      const validationError = mainTransaction.validateSync();
      if (validationError) {
        console.error("❌ Transaction Validation Error:", validationError.errors);
        return res.status(400).json({
          code: 400,
          message: `Transaction validation failed: ${Object.keys(validationError.errors).join(', ')}`
        });
      }
      
      await mainTransaction.save();
      console.log("✅ SUCCESS: Saved to MAIN Transaction collection:", mainTransaction.transactionId);

    } catch (saveError) {
      console.error("❌ Error saving to MAIN Transaction:", saveError);
      return res.status(500).json({
        code: 500,
        message: "Failed to save transaction to main collection",
        error: saveError.message,
        details: saveError.errors || 'No additional details'
      });
    }

    // Optional: Also save to QR collection if needed for tracking
    try {
      const qrTransaction = new QrTransaction(transactionData);
      await qrTransaction.save();
      console.log("✅ Also saved to QR collection for reference:", qrTransaction.transactionId);
    } catch (qrError) {
      console.log("⚠️ QR collection save failed, but main transaction saved:", qrError.message);
    }

    // Response with data from MAIN collection
    res.json({
      code: 200,
      message: "QR generated successfully",
      transaction: {
        transactionId: mainTransaction.transactionId,
        amount: mainTransaction.amount,
        status: mainTransaction.status,
        upiId: mainTransaction.upiId,
        txnRefId: mainTransaction.txnRefId,
        qrCode: mainTransaction.qrCode,
        paymentUrl: mainTransaction.paymentUrl,
        txnNote: mainTransaction.txnNote,
        merchantName: mainTransaction.merchantName,
        createdAt: mainTransaction.createdAt,
        merchantOrderId: mainTransaction.merchantOrderId
      },
      qrCode: qrCodeUrl,
      upiUrl: paymentUrl,
      enpayInitiated: false,
      savedTo: "transactions"
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

export const generateDefaultQR = async (req, res) => {
  try {
    const merchantId = req.user.id;
    const merchantName = `${req.user.firstname || ''} ${req.user.lastname || ''}`.trim() || "SKYPAL SYSTEM PRIVATE LIMITED";

    console.log("🟡 Default QR Request from:", merchantName);

    // Generate unique IDs with proper format
    const transactionId = `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const txnRefId = `REF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    const merchantOrderId = `ORDER${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const mid = `MID${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const vendorRefId = `VENDOR${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // Create UPI URL without amount
    const upiId = "enpay1.skypal@fino";
    const paymentUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&tn=Default%20QR%20Payment&tr=${txnRefId}&cu=INR`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(paymentUrl)}`;

    // 🔥 COMPLETE data with all required fields
    const transactionData = {
      transactionId: transactionId,
      merchantId: new mongoose.Types.ObjectId(merchantId),
      merchantName: merchantName,
      amount: 0,
      status: "INITIATED",
      qrCode: qrCodeUrl,
      paymentUrl: paymentUrl,
      txnNote: "Default QR Payment",
      txnRefId: txnRefId,
      upiId: upiId,
      merchantVpa: upiId,
      merchantOrderId: merchantOrderId,
      mid: mid,
      "Vendor Ref ID": vendorRefId,
      "Commission Amount": 0,
      "Settlement Status": "Unsettled",
      createdAt: new Date()
    };

    console.log("🟡 Complete transaction data:", JSON.stringify(transactionData, null, 2));

    // 🔥 STEP-BY-STEP VALIDATION
    console.log("🟡 Creating Transaction instance...");
    const mainTransaction = new Transaction(transactionData);

    console.log("🟡 Validating schema...");
    const validationError = mainTransaction.validateSync();
    if (validationError) {
      console.error("❌ DETAILED Validation Errors:");
      Object.keys(validationError.errors).forEach(field => {
        console.error(`  - ${field}: ${validationError.errors[field].message}`);
      });
      
      return res.status(400).json({
        code: 400,
        message: "Transaction validation failed",
        detailedErrors: Object.keys(validationError.errors).map(field => ({
          field: field,
          message: validationError.errors[field].message
        })),
        providedData: transactionData
      });
    }

    console.log("🟡 Validation passed. Saving to database...");
    await mainTransaction.save();
    console.log("✅ SUCCESS: Default QR saved to MAIN Transaction collection:", mainTransaction.transactionId);

    // Optional: Also save to QR collection
    try {
      const qrTransaction = new QrTransaction(transactionData);
      await qrTransaction.save();
      console.log("✅ Also saved to QR collection for reference:", qrTransaction.transactionId);
    } catch (qrError) {
      console.log("⚠️ QR collection save failed, but main transaction saved:", qrError.message);
    }

    res.json({
      code: 200,
      message: "Default QR generated successfully",
      transaction: {
        transactionId: mainTransaction.transactionId,
        amount: mainTransaction.amount,
        status: mainTransaction.status,
        upiId: mainTransaction.upiId,
        txnRefId: mainTransaction.txnRefId,
        qrCode: mainTransaction.qrCode,
        paymentUrl: mainTransaction.paymentUrl,
        txnNote: mainTransaction.txnNote,
        merchantName: mainTransaction.merchantName,
        createdAt: mainTransaction.createdAt,
        merchantOrderId: mainTransaction.merchantOrderId
      },
      qrCode: qrCodeUrl,
      upiUrl: paymentUrl,
      savedTo: "transactions"
    });

  } catch (error) {
    console.error("❌ Default QR Error:", error);
    
    // More detailed error information
    let errorDetails = {
      message: error.message,
      name: error.name
    };
    
    if (error.name === 'ValidationError') {
      errorDetails.validationErrors = Object.keys(error.errors).map(field => ({
        field: field,
        message: error.errors[field].message
      }));
    }
    
    if (error.code) {
      errorDetails.mongoErrorCode = error.code;
    }

    res.status(500).json({
      code: 500,
      message: "Default QR generation failed",
      error: errorDetails
    });
  }
};

// Add this debug endpoint to check schema validation
export const debugSchema = async (req, res) => {
  try {
    const sampleData = {
      transactionId: generateTransactionId(),
      merchantId: new mongoose.Types.ObjectId(req.user.id),
      merchantName: "Test Merchant",
      amount: 100,
      status: "INITIATED",
      mid: generateMid(),
      "Vendor Ref ID": generateVendorRefId(),
      "Commission Amount": 0,
      "Settlement Status": "Unsettled",
      createdAt: new Date()
    };

    console.log("🧪 Testing schema with:", sampleData);

    const testTransaction = new Transaction(sampleData);
    const validationError = testTransaction.validateSync();
    
    if (validationError) {
      return res.json({
        code: 400,
        message: "Schema validation failed",
        errors: validationError.errors
      });
    }

    res.json({
      code: 200,
      message: "Schema validation passed",
      sampleData: sampleData
    });

  } catch (error) {
    console.error("❌ Debug error:", error);
    res.status(500).json({
      code: 500,
      error: error.message
    });
  }
};

// Keep all other functions the same...
export const getTransactions = async (req, res) => {
  try {
    const merchantId = req.user.id;
    console.log("🟡 Fetching transactions from MAIN collection for merchant:", merchantId);

    const transactions = await Transaction.find({ 
      merchantId: new mongoose.Types.ObjectId(merchantId) 
    })
    .sort({ createdAt: -1 })
    .select('-__v');

    console.log(`✅ Found ${transactions.length} transactions in MAIN collection`);

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

// Add this to your transactionController.js
export const debugSchemaDetails = async (req, res) => {
  try {
    const Transaction = require("../models/Transaction.js");
    
    // Get the schema paths
    const schemaPaths = Transaction.schema.paths;
    const requiredFields = [];
    const optionalFields = [];
    
    Object.keys(schemaPaths).forEach(path => {
      const schemaType = schemaPaths[path];
      if (schemaType.isRequired) {
        requiredFields.push({
          path: path,
          type: schemaType.instance,
          isRequired: schemaType.isRequired
        });
      } else {
        optionalFields.push({
          path: path,
          type: schemaType.instance
        });
      }
    });
    
    res.json({
      code: 200,
      schemaInfo: {
        collectionName: Transaction.collection.name,
        requiredFields: requiredFields,
        optionalFields: optionalFields,
        totalPaths: Object.keys(schemaPaths).length
      }
    });
    
  } catch (error) {
    console.error("❌ Schema debug error:", error);
    res.status(500).json({
      code: 500,
      error: error.message
    });
  }
};

// ... keep all other existing functions (handlePaymentWebhook, checkTransactionStatus, etc.)

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
      merchantOrderId,
      enpayTxnId,
      failureReason,
      vendorTxnId
    } = req.body;

    console.log("🟡 Webhook Received - Updating MAIN collection:", req.body);

    let mainTransaction;

    // Find in MAIN Transaction collection
    if (transactionId) {
      mainTransaction = await Transaction.findOne({ transactionId });
    }
    if (!mainTransaction && merchantOrderId) {
      mainTransaction = await Transaction.findOne({ merchantOrderId });
    }
    if (!mainTransaction && txnRefId) {
      mainTransaction = await Transaction.findOne({ txnRefId });
    }

    if (mainTransaction) {
      console.log(`✅ Found in MAIN Transaction: ${mainTransaction.transactionId}, Current status: ${mainTransaction.status}`);

      const oldStatus = mainTransaction.status;

      // Update MAIN Transaction fields
      if (status) mainTransaction.status = status;
      if (upiId) mainTransaction.upiId = upiId;
      if (amount) mainTransaction.amount = parseFloat(amount);
      if (customerName) mainTransaction["Customer Name"] = customerName;
      if (customerVpa) mainTransaction["Customer VPA"] = customerVpa;
      if (customerContact) mainTransaction["Customer Contact No"] = customerContact;
      if (settlementStatus) mainTransaction["Settlement Status"] = settlementStatus;
      if (enpayTxnId) mainTransaction.enpayTxnId = enpayTxnId;
      if (failureReason) mainTransaction["Failure Reasons"] = failureReason;
      if (vendorTxnId) mainTransaction["Vendor Txn ID"] = vendorTxnId;

      await mainTransaction.save();
      console.log(`✅ MAIN Transaction ${mainTransaction.transactionId} updated from ${oldStatus} to: ${mainTransaction.status}`);

      res.json({
        code: 200,
        message: "Webhook processed successfully",
        transactionId: mainTransaction.transactionId,
        oldStatus: oldStatus,
        newStatus: mainTransaction.status,
        amount: mainTransaction.amount,
        updatedIn: "transactions" // 🔥 Confirm update in main collection
      });

    } else {
      console.log("❌ Transaction not found in MAIN collection. Creating new...");

      // Create new transaction in MAIN collection from webhook data
      const newTransactionData = {
        transactionId: transactionId || generateTransactionId(),
        merchantId: new mongoose.Types.ObjectId("60a7e6b0c2e3a4001c8c4f9f"), // Default merchant ID
        merchantName: "SKYPAL SYSTEM PRIVATE LIMITED",
        amount: parseFloat(amount) || 0,
        status: status || "SUCCESS",
        upiId: upiId || "customer@upi",
        txnRefId: txnRefId || generateTxnRefId(),
        merchantOrderId: merchantOrderId || `ORDER${Date.now()}`,
        "Commission Amount": 0,
        mid: generateMid(),
        "Settlement Status": settlementStatus || "Unsettled",
        "Vendor Ref ID": generateVendorRefId(),
        "Customer Name": customerName || null,
        "Customer VPA": customerVpa || null,
        "Customer Contact No": customerContact || null,
        "Failure Reasons": failureReason || null,
        "Vendor Txn ID": vendorTxnId || null,
        enpayTxnId: enpayTxnId || null,
        createdAt: new Date()
      };

      mainTransaction = new Transaction(newTransactionData);
      await mainTransaction.save();
      console.log(`✅ Created new MAIN transaction from webhook: ${mainTransaction.transactionId}`);

      res.json({
        code: 200,
        message: "Webhook processed successfully, new transaction created in MAIN collection",
        transactionId: mainTransaction.transactionId,
        status: mainTransaction.status,
        createdIn: "transactions" // 🔥 Confirm creation in main collection
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

// Other functions that work with MAIN collection only
export const checkTransactionStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const merchantId = req.user.id;

    console.log("🟡 Checking transaction status in MAIN collection:", { transactionId, merchantId });

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
      transaction: {
        transactionId: transaction.transactionId,
        status: transaction.status,
        amount: transaction.amount,
        upiId: transaction.upiId,
        txnRefId: transaction.txnRefId,
        createdAt: transaction.createdAt,
        settlementStatus: transaction["Settlement Status"]
      },
      collection: "transactions" // 🔥 Confirm from main collection
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
      collection: "transactions" // 🔥 Confirm from main collection
    });
  } catch (error) {
    console.error("❌ Get Details Error:", error);
    res.status(500).json({ 
      code: 500,
      message: error.message 
    });
  }
};

// Test endpoint to verify main collection is working
export const testMainCollection = async (req, res) => {
  try {
    const merchantId = req.user.id;
    
    // Count documents in both collections
    const mainCount = await Transaction.countDocuments({ merchantId });
    const qrCount = await QrTransaction.countDocuments({ merchantId });
    
    // Get recent transactions from both
    const mainTransactions = await Transaction.find({ merchantId }).limit(3).sort({ createdAt: -1 });
    const qrTransactions = await QrTransaction.find({ merchantId }).limit(3).sort({ createdAt: -1 });

    res.json({
      code: 200,
      message: "Collection status check",
      counts: {
        transactions: mainCount,
        qr_transactions: qrCount
      },
      recent: {
        transactions: mainTransactions.map(t => ({
          transactionId: t.transactionId,
          amount: t.amount,
          status: t.status,
          createdAt: t.createdAt
        })),
        qr_transactions: qrTransactions.map(t => ({
          transactionId: t.transactionId,
          amount: t.amount,
          status: t.status,
          createdAt: t.createdAt
        }))
      }
    });
    
  } catch (error) {
    console.error("❌ Test error:", error);
    res.status(500).json({
      code: 500,
      error: error.message
    });
  }
};

// Manual sync from QR to Main (if needed)
export const syncQRToMain = async (req, res) => {
  try {
    const merchantId = req.user.id;
    
    console.log("🔄 Manual sync: QR to Main for merchant:", merchantId);
    
    const qrTransactions = await QrTransaction.find({ merchantId });
    let syncedCount = 0;
    
    for (const qrTxn of qrTransactions) {
      try {
        const existing = await Transaction.findOne({ transactionId: qrTxn.transactionId });
        
        if (!existing) {
          const mainTxn = new Transaction({
            transactionId: qrTxn.transactionId,
            merchantId: qrTxn.merchantId,
            merchantName: qrTxn.merchantName,
            amount: qrTxn.amount,
            status: qrTxn.status,
            qrCode: qrTxn.qrCode,
            paymentUrl: qrTxn.paymentUrl,
            txnNote: qrTxn.txnNote,
            txnRefId: qrTxn.txnRefId,
            upiId: qrTxn.upiId,
            merchantVpa: qrTxn.merchantVpa,
            merchantOrderId: qrTxn.merchantOrderId,
            mid: qrTxn.mid,
            "Vendor Ref ID": qrTxn["Vendor Ref ID"],
            "Commission Amount": qrTxn["Commission Amount"],
            "Settlement Status": qrTxn["Settlement Status"],
            createdAt: qrTxn.createdAt
          });
          
          await mainTxn.save();
          syncedCount++;
          console.log(`✅ Synced: ${qrTxn.transactionId}`);
        }
      } catch (error) {
        console.error(`❌ Failed to sync: ${qrTxn.transactionId}`, error);
      }
    }
    
    res.json({
      code: 200,
      message: "Manual sync completed",
      synced: syncedCount,
      total: qrTransactions.length
    });
    
  } catch (error) {
    console.error("❌ Manual sync error:", error);
    res.status(500).json({
      code: 500,
      message: "Manual sync failed",
      error: error.message
    });
  }
};

// Keep other functions as needed...
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

// export const initiateRefund = async (req, res) => {
//   try {
//     const { transactionId } = req.params;
//     const { refundAmount, reason } = req.body;
//     const merchantId = req.user.id;

//     const transaction = await Transaction.findOne({ 
//       transactionId, 
//       merchantId: new mongoose.Types.ObjectId(merchantId)
//     });

//     if (!transaction) {
//       return res.status(404).json({ 
//         code: 404,
//         message: "Transaction not found in MAIN collection" 
//       });
//     }

//     if (transaction.status !== "SUCCESS") {
//       return res.status(400).json({ 
//         code: 400,
//         message: "Refund only available for successful transactions" 
//       });
//     }

//     if (refundAmount > transaction.amount) {
//       return res.status(400).json({ 
//         code: 400,
//         message: "Refund amount cannot exceed original transaction amount" 
//       });
//     }

//     transaction.status = "REFUNDED";
//     await transaction.save();

//     res.json({
//       code: 200,
//       message: "Refund initiated successfully",
//       refundId: `REF${Date.now()}`,
//       transactionId: transactionId,
//       refundAmount: refundAmount,
//       originalAmount: transaction.amount,
//       status: "REFUNDED"
//     });

//   } catch (error) {
//     console.error("❌ Refund Error:", error);
//     res.status(500).json({ 
//       code: 500,
//       message: "Failed to initiate refund",
//       error: error.message 
//     });
//   }
// };

// Manual sync endpoint for existing QR transactions to MAIN
export const syncAllQRToMain = async (req, res) => {
  try {
    const merchantId = req.user.id;
    
    console.log("🔄 Manual sync: QR to MAIN for merchant:", merchantId);
    
    // Find all QR transactions for this merchant
    const qrTransactions = await QrTransaction.find({ merchantId });
    
    let syncedCount = 0;
    let errorCount = 0;
    
    for (const qrTxn of qrTransactions) {
      try {
        // Check if already exists in main collection
        const existing = await Transaction.findOne({ transactionId: qrTxn.transactionId });
        
        if (!existing) {
          await syncQrTransactionToMain(qrTxn, {});
          syncedCount++;
          console.log(`✅ Synced: ${qrTxn.transactionId}`);
        }
      } catch (error) {
        console.error(`❌ Failed to sync: ${qrTxn.transactionId}`, error);
        errorCount++;
      }
    }
    
    res.json({
      code: 200,
      message: "Manual sync completed",
      results: {
        totalQRTransactions: qrTransactions.length,
        syncedToMain: syncedCount,
        alreadyExists: qrTransactions.length - syncedCount - errorCount,
        errors: errorCount
      }
    });
    
  } catch (error) {
    console.error("❌ Manual sync error:", error);
    res.status(500).json({
      code: 500,
      message: "Manual sync failed",
      error: error.message
    });
  }
};

// Check sync status between collections
export const checkSyncStatus = async (req, res) => {
  try {
    const merchantId = req.user.id;
    
    // QR Transactions
    const qrTransactions = await QrTransaction.find({ merchantId })
      .sort({ createdAt: -1 })
      .limit(10);
    
    // Main Transactions  
    const mainTransactions = await Transaction.find({ merchantId })
      .sort({ createdAt: -1 })
      .limit(10);
    
    // Sync status check
    const syncStatus = await Promise.all(
      qrTransactions.map(async (qrTxn) => {
        const mainTxn = await Transaction.findOne({ 
          transactionId: qrTxn.transactionId 
        });
        return {
          transactionId: qrTxn.transactionId,
          qrExists: true,
          mainExists: !!mainTxn,
          status: qrTxn.status,
          amount: qrTxn.amount,
          createdAt: qrTxn.createdAt
        };
      })
    );
    
    res.json({
      code: 200,
      syncStatus: {
        totalQR: qrTransactions.length,
        totalMain: mainTransactions.length,
        transactions: syncStatus
      }
    });
    
  } catch (error) {
    console.error("❌ Sync check error:", error);
    res.status(500).json({
      code: 500,
      message: "Sync check failed",
      error: error.message
    });
  }
};

// Test endpoint to verify data is going to MAIN collection
// export const testMainCollection = async (req, res) => {
//   try {
//     const merchantId = req.user.id;
    
//     const testTransaction = {
//       transactionId: `TEST${Date.now()}`,
//       merchantId: new mongoose.Types.ObjectId(merchantId),
//       merchantName: "Test Merchant",
//       amount: 100,
//       status: "INITIATED",
//       mid: "TESTMID",
//       "Vendor Ref ID": "TESTVENDOR",
//       "Commission Amount": 0,
//       "Settlement Status": "Unsettled"
//     };

//     console.log("🧪 Testing MAIN collection save...");
    
//     const mainTxn = new Transaction(testTransaction);
//     await mainTxn.save();
    
//     // Verify it's saved
//     const verified = await Transaction.findOne({ transactionId: testTransaction.transactionId });
    
//     res.json({
//       code: 200,
//       message: "Test completed",
//       testData: testTransaction,
//       saved: !!verified,
//       verified: verified ? {
//         transactionId: verified.transactionId,
//         collection: "transactions"
//       } : null
//     });
    
//   } catch (error) {
//     console.error("❌ Test error:", error);
//     res.status(500).json({
//       code: 500,
//       error: error.message
//     });
//   }
// };

// Keep other existing functions (downloadReceipt, initiateRefund, etc.) as they are
// but ensure they only work with Transaction model (MAIN collection)

// export const downloadReceipt = async (req, res) => {
//   try {
//     const { transactionId } = req.params;
//     const merchantId = req.user.id;

//     console.log("🟡 Download receipt from MAIN collection:", { transactionId, merchantId });

//     const transaction = await Transaction.findOne({ 
//       transactionId, 
//       merchantId: new mongoose.Types.ObjectId(merchantId)
//     });

//     if (!transaction) {
//       return res.status(404).json({ 
//         code: 404,
//         message: "Transaction not found in MAIN collection" 
//       });
//     }

//     if (transaction.status !== "SUCCESS") {
//       return res.status(400).json({ 
//         code: 400,
//         message: "Receipt only available for successful transactions" 
//       });
//     }

//     const receiptData = {
//       transactionId: transaction.transactionId,
//       merchantOrderId: transaction.merchantOrderId,
//       amount: transaction.amount,
//       date: transaction.createdAt,
//       merchantName: transaction.merchantName,
//       status: transaction.status,
//       upiId: transaction.upiId,
//       customerName: transaction["Customer Name"] || 'N/A',
//       customerVpa: transaction["Customer VPA"] || 'N/A',
//       commissionAmount: transaction["Commission Amount"],
//       settlementStatus: transaction["Settlement Status"],
//       collection: "main"
//     };

//     res.json({
//       code: 200,
//       message: "Receipt generated successfully",
//       receipt: receiptData
//     });

//   } catch (error) {
//     console.error("❌ Download Receipt Error:", error);
//     res.status(500).json({ 
//       code: 500,
//       message: "Failed to download receipt",
//       error: error.message 
//     });
//   }
// };

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

// Add to routes
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