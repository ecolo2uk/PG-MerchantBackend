// controllers/transactionController.js
import Transaction from "../models/Transaction.js"; // Only import Transaction
import mongoose from 'mongoose';

const generateTransactionId = () => `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateTxnRefId = () => `REF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
const generateMid = () => `MID${Date.now()}`;
const generateVendorRefId = () => `VENDORREF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

export const generateDynamicQR = async (req, res) => {
  try {
    console.log("🟡 generateDynamicQR - Processing request...");
    console.log("Full req.body:", req.body);

    let amountValue = req.body.amount;
    let parsedAmount;

    if (amountValue && typeof amountValue === 'object') {
      console.log("🚨 EMERGENCY: Amount is object, attempting recovery...");
      amountValue = amountValue.value || amountValue.amount ||
                    amountValue.data || Object.values(amountValue).find(val =>
                      typeof val === 'number' || (typeof val === 'string' && !isNaN(parseFloat(val)))
                    );
      console.log("Recovered amount value:", amountValue);
    }

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

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        code: 400,
        message: "Amount must be a valid number greater than 0"
      });
    }

    const { txnNote = "Payment for Order" } = req.body;
    const merchantId = req.user.id;
    const merchantName = `${req.user.firstname || ''} ${req.user.lastname || ''}`.trim() || "SKYPAL SYSTEM PRIVATE LIMITED";

    console.log("✅ Amount validation passed:", parsedAmount);

    const transactionId = generateTransactionId();
    const txnRefId = generateTxnRefId();
    const merchantOrderId = `ORDER${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const mid = generateMid();
    const vendorRefId = generateVendorRefId();

    const upiId = "enpay1.skypal@fino";
    const paymentUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&am=${parsedAmount}&tn=${encodeURIComponent(txnNote)}&tr=${txnRefId}&cu=INR`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(paymentUrl)}`;

    const transactionData = {
      transactionId,
      merchantId: new mongoose.Types.ObjectId(merchantId),
      merchantName,
      amount: parsedAmount,
      status: "GENERATED", // Changed to GENERATED for initial QR state
      qrCode: qrCodeUrl,
      paymentUrl,
      txnNote,
      txnRefId,
      upiId,
      merchantVpa: upiId,
      merchantOrderId,
      mid,
      "Vendor Ref ID": vendorRefId,
      "Commission Amount": 0,
      "Settlement Status": "Unsettled",
      // createdAt and updatedAt will be handled by timestamps: true
    };

    console.log("🟡 Saving to Transaction collection:", transactionData);

    let newTransaction;
    try {
      newTransaction = new Transaction(transactionData);

      const validationError = newTransaction.validateSync();
      if (validationError) {
        console.error("❌ Transaction Validation Error:", validationError.errors);
        return res.status(400).json({
          code: 400,
          message: `Transaction validation failed: ${JSON.stringify(validationError.errors)}`
        });
      }

      await newTransaction.save();
      console.log("✅ SUCCESS: Saved to Transaction collection:", newTransaction.transactionId);

    } catch (saveError) {
      console.error("❌ Error saving to Transaction:", saveError);
      return res.status(500).json({
        code: 500,
        message: "Failed to save transaction",
        error: saveError.message
      });
    }

    res.json({
      code: 200,
      message: "QR generated successfully",
      transaction: {
        transactionId: newTransaction.transactionId,
        amount: newTransaction.amount,
        status: newTransaction.status,
        upiId: newTransaction.upiId,
        txnRefId: newTransaction.txnRefId,
        qrCode: newTransaction.qrCode,
        paymentUrl: newTransaction.paymentUrl,
        txnNote: newTransaction.txnNote,
        merchantName: newTransaction.merchantName,
        createdAt: newTransaction.createdAt,
        merchantOrderId: newTransaction.merchantOrderId
      },
      qrCode: qrCodeUrl,
      upiUrl: paymentUrl,
      enpayInitiated: false
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

    const transactionId = generateTransactionId();
    const txnRefId = generateTxnRefId();
    const merchantOrderId = `ORDER${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const mid = generateMid();
    const vendorRefId = generateVendorRefId();


    const upiId = "enpay1.skypal@fino";
    const paymentUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&tn=Default%20QR%20Payment&tr=${txnRefId}&cu=INR`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(paymentUrl)}`;

    const transactionData = {
      transactionId: transactionId,
      merchantId: new mongoose.Types.ObjectId(merchantId),
      merchantName: merchantName,
      amount: 0, // Default QR usually has 0 amount or no amount specified
      status: "GENERATED",
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
      // createdAt and updatedAt will be handled by timestamps: true
    };

    console.log("🟡 Saving default QR to Transaction collection:", transactionData);

    let newTransaction;
    try {
      newTransaction = new Transaction(transactionData);

      const validationError = newTransaction.validateSync();
      if (validationError) {
        console.error("❌ Transaction Validation Error:", validationError.errors);
        return res.status(400).json({
          code: 400,
          message: `Transaction validation failed: ${JSON.stringify(validationError.errors)}`
        });
      }

      await newTransaction.save();
      console.log("✅ SUCCESS: Default QR saved to Transaction collection:", newTransaction.transactionId);

    } catch (saveError) {
      console.error("❌ Error saving default QR to Transaction:", saveError);
      return res.status(500).json({
        code: 500,
        message: "Failed to save default QR",
        error: saveError.message
      });
    }

    res.json({
      code: 200,
      message: "Default QR generated successfully",
      transaction: {
        transactionId: newTransaction.transactionId,
        amount: newTransaction.amount,
        status: newTransaction.status,
        upiId: newTransaction.upiId,
        txnRefId: newTransaction.txnRefId,
        qrCode: newTransaction.qrCode,
        paymentUrl: newTransaction.paymentUrl,
        txnNote: newTransaction.txnNote,
        merchantName: newTransaction.merchantName,
        createdAt: newTransaction.createdAt,
        merchantOrderId: newTransaction.merchantOrderId
      },
      qrCode: qrCodeUrl,
      upiUrl: paymentUrl,
      enpayInitiated: false
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

export const getTransactions = async (req, res) => {
  try {
    const merchantId = req.user.id;
    console.log("🟡 Fetching transactions for merchant:", merchantId);

    const transactions = await Transaction.find({
      merchantId: new mongoose.Types.ObjectId(merchantId)
    })
    .sort({ createdAt: -1 })
    .select('-__v'); // Exclude __v field

    console.log(`✅ Found ${transactions.length} transactions`);

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

    console.log("🟡 Webhook Received - Updating Transaction collection:", req.body);

    let transaction;

    // Find by transactionId, merchantOrderId, or txnRefId
    if (transactionId) {
      transaction = await Transaction.findOne({ transactionId });
    }
    if (!transaction && merchantOrderId) {
      transaction = await Transaction.findOne({ merchantOrderId });
    }
    if (!transaction && txnRefId) {
      transaction = await Transaction.findOne({ txnRefId });
    }

    if (transaction) {
      console.log(`✅ Found transaction: ${transaction.transactionId}, Current status: ${transaction.status}`);

      const oldStatus = transaction.status;

      // Update fields
      if (status) transaction.status = status;
      if (upiId) transaction.upiId = upiId;
      if (amount) transaction.amount = parseFloat(amount);
      if (customerName) transaction["Customer Name"] = customerName;
      if (customerVpa) transaction["Customer VPA"] = customerVpa;
      if (customerContact) transaction["Customer Contact No"] = customerContact;
      if (settlementStatus) transaction["Settlement Status"] = settlementStatus;
      if (enpayTxnId) transaction.enpayTxnId = enpayTxnId;
      if (failureReason) transaction["Failure Reasons"] = failureReason;
      if (vendorTxnId) transaction["Vendor Txn ID"] = vendorTxnId;

      await transaction.save();
      console.log(`✅ Transaction ${transaction.transactionId} updated from ${oldStatus} to: ${transaction.status}`);

      res.json({
        code: 200,
        message: "Webhook processed successfully",
        transactionId: transaction.transactionId,
        oldStatus: oldStatus,
        newStatus: transaction.status,
        amount: transaction.amount
      });

    } else {
      console.log("❌ Transaction not found. Creating new from webhook data...");

      const newTransactionData = {
        transactionId: transactionId || generateTransactionId(),
        merchantId: new mongoose.Types.ObjectId("60a7e6b0c2e3a4001c8c4f9f"), // Default merchant ID or handle dynamically
        merchantName: "SKYPAL SYSTEM PRIVATE LIMITED", // Default merchant name
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
        // createdAt and updatedAt handled by timestamps: true
      };

      transaction = new Transaction(newTransactionData);
      await transaction.save();
      console.log(`✅ Created new transaction from webhook: ${transaction.transactionId}`);

      res.json({
        code: 200,
        message: "Webhook processed successfully, new transaction created",
        transactionId: transaction.transactionId,
        status: transaction.status
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
        message: "Transaction not found"
      });
    }

    if (transaction.status !== "SUCCESS" && transaction.status !== "REFUNDED") { // Allow refund receipts
      return res.status(400).json({
        code: 400,
        message: "Receipt only available for successful or refunded transactions"
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

    console.log("🟡 Refund request:", { transactionId, merchantId, refundAmount, reason });

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

    transaction.status = "REFUNDED";
    await transaction.save();

    res.json({
      code: 200,
      message: "Refund initiated successfully",
      refundId: `REF${Date.now()}`,
      transactionId: transactionId,
      refundAmount: refundAmount,
      originalAmount: transaction.amount,
      status: "REFUNDED"
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

// Removed testMainCollection, syncQRToMain, syncAllQRToMain, checkSyncStatus
// as they are no longer relevant with a single collection approach.
// If you need specific testing, you can re-introduce a simplified test endpoint
// that only interacts with the 'Transaction' model.