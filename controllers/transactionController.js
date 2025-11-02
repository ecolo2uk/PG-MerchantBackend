import Transaction from "../models/Transaction.js";
import QrTransaction from "../models/QrTransaction.js"; // Corrected import
import EnpayService from "../services/enpayService.js";
import mongoose from 'mongoose'; // Import mongoose for ObjectId

const generateTransactionId = () => `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateTxnRefId = () => `REF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
const generateMid = () => `MID${Date.now()}`; // Helper for MID
const generateVendorRefId = () => `VENDORREF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;


export const getTransactions = async (req, res) => {
  try {
    const merchantId = req.user.id;
    console.log("🟡 Fetching transactions for merchant:", merchantId);

    // Fetch from the main Transaction collection
    const transactions = await Transaction.find({ merchantId: new mongoose.Types.ObjectId(merchantId) }) // Convert merchantId to ObjectId
      .sort({ createdAt: -1 })
      .select('-__v');

    console.log(`✅ Found ${transactions.length} transactions in main collection`);

    res.json(transactions); // Send transactions from the main collection

  } catch (error) {
    console.error("❌ Error fetching transactions:", error);
    res.status(500).json({
      code: 500,
      message: "Failed to fetch transactions",
      error: error.message
    });
  }
};

// In your generateDynamicQR function - UPDATE THIS PART
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
    const transactionId = generateTransactionId();
    const txnRefId = generateTxnRefId();
    const merchantOrderId = `ORDER${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // Create UPI URL (for the QR image)
    const upiId = "enpay1.skypal@fino";
    const paymentUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&am=${amount}&tn=${encodeURIComponent(txnNote)}&tr=${txnRefId}&cu=INR`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(paymentUrl)}`;

    // Data for QrTransaction collection
    const qrTransactionData = {
      transactionId: transactionId,
      merchantId: merchantId,
      merchantName: merchantName,
      amount: parseFloat(amount),
      status: "GENERATED",
      qrCode: qrCodeUrl,
      paymentUrl: paymentUrl,
      txnNote: txnNote,
      txnRefId: txnRefId,
      upiId: upiId,
      merchantVpa: upiId,
      merchantOrderId: merchantOrderId,
      mid: generateMid(),
      "Vendor Ref ID": generateVendorRefId(),
      "Commission Amount": 0,
      "Settlement Status": "NA"
    };

    // FIXED: Use Enpay dynamicQR instead of initiateCollectRequest
    let enpayInitiationStatus = 'NOT_ATTEMPTED';
    let enpayError = null;
    let enpayQRCode = null;

    try {
      const enpayResponse = await EnpayService.generateDynamicQR({
        amount: parseFloat(amount),
        txnNote: txnNote,
        txnRefId: txnRefId
      });

      if (enpayResponse.success) {
        enpayInitiationStatus = 'ATTEMPTED_SUCCESS';
        enpayQRCode = enpayResponse.qrCode; // Store Enpay's QR code
        console.log("✅ Enpay dynamic QR generated successfully.");
      } else {
        enpayInitiationStatus = 'ATTEMPTED_FAILED';
        enpayError = enpayResponse.error || "Unknown Enpay error";
        console.warn("⚠️ Enpay dynamic QR failed but QR generated locally:", enpayError);
      }
    } catch (enpayServiceError) {
      enpayInitiationStatus = 'ATTEMPTED_FAILED';
      enpayError = enpayServiceError.message;
      console.error("❌ Error calling EnpayService:", enpayServiceError.message);
    }

    qrTransactionData.enpayInitiationStatus = enpayInitiationStatus;
    qrTransactionData.enpayError = enpayError;
    if (enpayQRCode) {
      qrTransactionData.enpayQRCode = enpayQRCode;
    }

    console.log("🟡 Saving to QR transactions collection...");
    const qrTransaction = new QrTransaction(qrTransactionData);
    await qrTransaction.save();
    console.log("✅ Successfully saved to QR transactions collection");

    // Return both QR codes (local and Enpay)
    res.json({
      code: 200,
      message: "QR generated successfully",
      transaction: {
        transactionId: qrTransaction.transactionId,
        amount: qrTransaction.amount,
        status: qrTransaction.status,
        upiId: qrTransaction.upiId,
        txnRefId: qrTransaction.txnRefId,
        qrCode: qrTransaction.qrCode, // Local QR
        paymentUrl: qrTransaction.paymentUrl,
        txnNote: qrTransaction.txnNote,
        merchantName: qrTransaction.merchantName,
        createdAt: qrTransaction.createdAt,
        merchantOrderId: qrTransaction.merchantOrderId
      },
      qrCode: qrCodeUrl, // Local QR
      enpayQRCode: enpayQRCode, // Enpay QR (if available)
      upiUrl: paymentUrl,
      enpayInitiated: enpayInitiationStatus === 'ATTEMPTED_SUCCESS'
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
    const qrTransactionData = { // Renamed from transactionData for clarity
      transactionId: transactionId,
      merchantId: merchantId,
      merchantName: merchantName,
      amount: 0, // Default QR has 0 amount
      status: "GENERATED",
      qrCode: qrCodeUrl,
      paymentUrl: paymentUrl,
      txnNote: "Default QR Payment",
      txnRefId: txnRefId,
      upiId: upiId,
      merchantVpa: upiId,
      merchantOrderId: merchantOrderId, // Store this for Enpay
      mid: generateMid(),
      "Vendor Ref ID": generateVendorRefId(),
      "Commission Amount": 0,
      "Settlement Status": "NA"
    };

    // Attempt to initiate collect request with Enpay (even for default QR, if you want it tracked by Enpay)
    let enpayInitiationStatus = 'NOT_ATTEMPTED';
    let enpayError = null;
    // For default QR, usually you don't initiate Enpay unless it's a dynamic amount QR.
    // If you do, you'd send amount: 0 to Enpay if they support it, or skip.
    // Assuming you generally skip Enpay for 0-amount default QRs.
    // if (qrTransactionData.amount > 0) { // Only call Enpay if there's an amount, which is 0 for default QR
    try {
      const enpayResponse = await EnpayService.initiateCollectRequest({
        amount: parseFloat(qrTransactionData.amount), // Will be 0
        merchantOrderId: merchantOrderId,
        transactionId: transactionId,
        txnNote: qrTransactionData.txnNote
      });

      if (enpayResponse.success) {
        enpayInitiationStatus = 'ATTEMPTED_SUCCESS';
        console.log("✅ Enpay collect request initiated successfully for default QR.");
      } else {
        enpayInitiationStatus = 'ATTEMPTED_FAILED';
        enpayError = enpayResponse.error || "Unknown Enpay error";
        console.warn("⚠️ Enpay collect request failed for default QR but QR generated locally:", enpayError);
      }
    } catch (enpayServiceError) {
      enpayInitiationStatus = 'ATTEMPTED_FAILED';
      enpayError = enpayServiceError.message;
      console.error("❌ Error calling EnpayService for default QR:", enpayServiceError.message);
    }
    // }

    qrTransactionData.enpayInitiationStatus = enpayInitiationStatus;
    qrTransactionData.enpayError = enpayError;


    console.log("🟡 Saving default QR to new collection:", qrTransactionData);
    const qrTransaction = new QrTransaction(qrTransactionData); // Use QrTransaction
    await qrTransaction.save();
    console.log("✅ Default QR transaction saved:", qrTransaction.transactionId);

    res.json({
      code: 200,
      message: "Default QR generated successfully",
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
        merchantOrderId: qrTransaction.merchantOrderId
      },
      qrCode: qrCodeUrl,
      upiUrl: paymentUrl,
      enpayInitiated: enpayInitiationStatus === 'ATTEMPTED_SUCCESS'
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

export const handlePaymentWebhook = async (req, res) => {
  try {
    const {
      transactionId, // Your internal transactionId or Enpay's equivalent
      status, // SUCCESS, FAILED, PENDING
      upiId, // Customer's UPI ID
      amount,
      txnRefId, // Your internal txnRefId
      customerName,
      customerVpa,
      customerContact,
      settlementStatus,
      merchantOrderId, // The order ID sent to Enpay
      enpayTxnId, // Enpay's transaction ID (if provided by webhook)
      failureReason,
      vendorTxnId
    } = req.body;

    console.log("🟡 Webhook Received:", req.body);

    let qrTransaction;

    // First, try to find the transaction in the QR collection
    if (transactionId) {
      qrTransaction = await QrTransaction.findOne({ transactionId });
    }
    if (!qrTransaction && merchantOrderId) {
      qrTransaction = await QrTransaction.findOne({ merchantOrderId });
    }
    if (!qrTransaction && txnRefId) {
      qrTransaction = await QrTransaction.findOne({ txnRefId });
    }

    if (qrTransaction) {
      console.log(`✅ Found QrTransaction: ${qrTransaction.transactionId}, Current status: ${qrTransaction.status}`);

      const oldStatus = qrTransaction.status;

      // Update QrTransaction fields
      if (status) qrTransaction.status = status;
      if (upiId) qrTransaction.upiId = upiId;
      if (amount) qrTransaction.amount = parseFloat(amount);
      if (customerName) qrTransaction.customerName = customerName;
      if (customerVpa) qrTransaction.customerVpa = customerVpa;
      if (customerContact) qrTransaction.customerContact = customerContact;
      if (settlementStatus) qrTransaction.settlementStatus = settlementStatus;
      if (enpayTxnId) qrTransaction.enpayTxnId = enpayTxnId;
      if (failureReason) qrTransaction.enpayError = failureReason; // Use enpayError for webhook failure reason in QR model
      if (vendorTxnId) qrTransaction["Vendor Txn ID"] = vendorTxnId;


      await qrTransaction.save();
      console.log(`✅ QrTransaction ${qrTransaction.transactionId} updated from ${oldStatus} to: ${qrTransaction.status}`);

      // If the transaction is successful, create/update it in the main Transaction collection
      if (status === "SUCCESS") {
        await syncQrTransactionToMain(qrTransaction, req.body);
      } else if (status === "FAILED") {
        // If it failed, ensure it's recorded in the main transactions too, or just update the main if it exists
        await syncQrTransactionToMain(qrTransaction, req.body);
      }

      res.json({
        code: 200,
        message: "Webhook processed successfully",
        transactionId: qrTransaction.transactionId,
        oldStatus: oldStatus,
        newStatus: qrTransaction.status,
        amount: qrTransaction.amount
      });
    } else {
      console.log("❌ Transaction not found in QrTransaction collection. Attempting to create in main collection.");

      // If no QR transaction found, it might be a direct payment not initiated by QR
      // Or an issue with lookup. Create/update directly in main Transaction collection.
      const mainTransaction = await syncQrTransactionToMain(null, req.body); // Pass null for qrTransaction if not found
      if (mainTransaction) {
        res.json({
          code: 200,
          message: "Webhook processed successfully, new transaction created/updated in main collection.",
          transactionId: mainTransaction.transactionId,
          status: mainTransaction.status
        });
      } else {
        res.status(404).json({
          code: 404,
          message: "Transaction not found and could not be created/updated in main collection."
        });
      }
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

// Helper function to sync QR transaction data to the main Transaction collection
const syncQrTransactionToMain = async (qrTransaction, webhookData) => {
  let mainTransaction;

  // Try to find in main Transaction collection first
  if (webhookData.transactionId) {
    mainTransaction = await Transaction.findOne({ transactionId: webhookData.transactionId });
  }
  if (!mainTransaction && webhookData.merchantOrderId) {
    mainTransaction = await Transaction.findOne({ merchantOrderId: webhookData.merchantOrderId });
  }
  if (!mainTransaction && webhookData.txnRefId) {
    mainTransaction = await Transaction.findOne({ txnRefId: webhookData.txnRefId });
  }

  // If a main transaction is found, update it
  if (mainTransaction) {
    console.log(`Updating existing main transaction: ${mainTransaction.transactionId}`);
    mainTransaction.status = webhookData.status || mainTransaction.status;
    mainTransaction.amount = parseFloat(webhookData.amount) || mainTransaction.amount;
    mainTransaction.upiId = webhookData.upiId || mainTransaction.upiId;
    mainTransaction["Customer Name"] = webhookData.customerName || mainTransaction["Customer Name"];
    mainTransaction["Customer VPA"] = webhookData.customerVpa || mainTransaction["Customer VPA"];
    mainTransaction["Customer Contact No"] = webhookData.customerContact || mainTransaction["Customer Contact No"];
    mainTransaction["Settlement Status"] = webhookData.settlementStatus || mainTransaction["Settlement Status"];
    mainTransaction.enpayTxnId = webhookData.enpayTxnId || mainTransaction.enpayTxnId;
    mainTransaction["Failure Reasons"] = webhookData.failureReason || mainTransaction["Failure Reasons"];
    mainTransaction["Vendor Txn ID"] = webhookData.vendorTxnId || mainTransaction["Vendor Txn ID"];
    await mainTransaction.save();
    console.log(`✅ Main transaction ${mainTransaction.transactionId} updated to: ${mainTransaction.status}`);
    return mainTransaction;
  } else {
    // If no main transaction found, create a new one
    console.log("Creating new main transaction from webhook/QR data.");

    const source = qrTransaction || webhookData; // Prioritize QR transaction if available

    const newTransactionData = {
      _id: new mongoose.Types.ObjectId(), // Generate new ObjectId for main transaction
      transactionId: source.transactionId || generateTransactionId(),
      merchantId: new mongoose.Types.ObjectId(source.merchantId || "60a7e6b0c2e3a4001c8c4f9f"), // Default or determine merchantId
      merchantName: source.merchantName || "SKYPAL SYSTEM PRIVATE LIMITED",
      amount: parseFloat(source.amount) || 0,
      status: source.status || "SUCCESS",
      qrCode: source.qrCode || null,
      paymentUrl: source.paymentUrl || null,
      txnNote: source.txnNote || "Payment for Order",
      txnRefId: source.txnRefId || generateTxnRefId(),
      upiId: source.upiId || "enpay1.skypal@fino",
      merchantVpa: source.merchantVpa || "enpay1.skypal@fino",
      merchantOrderId: source.merchantOrderId || `ORDER${Date.now()}`,
      "Commission Amount": source["Commission Amount"] || 0,
      createdAt: source.createdAt || new Date(),
      mid: source.mid || generateMid(),
      "Settlement Status": source.settlementStatus || "Unsettled",
      "Vendor Ref ID": source["Vendor Ref ID"] || generateVendorRefId(),
      "Customer Name": source.customerName || source["Customer Name"] || null,
      "Customer VPA": source.customerVpa || source["Customer VPA"] || null,
      "Customer Contact No": source.customerContact || source["Customer Contact No"] || null,
      "Failure Reasons": source.failureReason || source["Failure Reasons"] || null,
      "Vendor Txn ID": source.vendorTxnId || source["Vendor Txn ID"] || null,
      enpayTxnId: source.enpayTxnId || null // If webhook provides Enpay Txn ID
    };

    const newMainTransaction = new Transaction(newTransactionData);
    await newMainTransaction.save();
    console.log(`✅ Created new main transaction: ${newMainTransaction.transactionId}`);
    return newMainTransaction;
  }
};


// In transactionController.js - FIX THE WEBHOOK FUNCTION
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
      // ADD MISSING REQUIRED FIELDS:
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
// Check Transaction Status - now checks main Transaction collection
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

// Add to your transactionController.js
export const listAllEndpoints = async (req, res) => {
  try {
    res.json({
      code: 200,
      message: "Available endpoints",
      endpoints: [
        "GET /api/transactions",
        "POST /api/transactions/generate-dynamic-qr",
        "POST /api/transactions/generate-default-qr", 
        "POST /api/transactions/generate-qr",
        "POST /api/transactions/default-qr",
        "GET /api/transactions/debug",
        "POST /api/transactions/debug-qr",
        "POST /api/transactions/simulate-webhook"
      ],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      error: error.message
    });
  }
};