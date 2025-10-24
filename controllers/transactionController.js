// controllers/transactionController.js
import Transaction from "../models/Transaction.js";

const generateTransactionId = () => `TRN${Date.now()}${Math.floor(Math.random() * 10000)}`;
const generateTxnRefId = () => `TXN${Date.now()}${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

// Get transactions for logged-in merchant ONLY
export const getTransactions = async (req, res) => {
  try {
    // Get merchant ID from authenticated request
    const merchantId = req.user.id;

    const transactions = await Transaction.find({ merchantId })
      .sort({ createdAt: -1 });

    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Generate Dynamic QR Code with Merchant Info
export const generateDynamicQR = async (req, res) => {
  try {
    const { amount, txnNote = "Payment for Order", merchantOrderId } = req.body;
    const merchantId = req.user.id; // From authenticated request
    const merchantName = `${req.user.firstname} ${req.user.lastname}`;

    console.log("🟡 Dynamic QR Request from:", merchantName, req.body);

    if (!amount || amount <= 0) {
      return res.status(400).json({
        code: 400,
        message: "Valid amount is required"
      });
    }

    // Generate unique IDs
    const transactionId = generateTransactionId();
    const txnRefId = generateTxnRefId();

    // Create proper UPI URL
    const upiUrl = `upi://pay?pa=enpay1.skypal@fino&pn=${encodeURIComponent(merchantName)}&am=${amount}&tn=${encodeURIComponent(txnNote)}&tr=${txnRefId}&cu=INR`;

    // Create transaction record with merchant info
    const transaction = new Transaction({
      transactionId: transactionId,
      merchantOrderId: merchantOrderId || `ORDER${Date.now()}`,
      merchantHashId: process.env.MERCHANT_HASH_ID || "default_merchant_hash",
      merchantId: merchantId,
      merchantName: merchantName,
      amount: parseFloat(amount),
      status: "Pending",
      txnNote,
      txnRefId,
      upiId: "enpay1.skypal@fino",
      qrCode: upiUrl,
      paymentUrl: upiUrl,
      currency: "INR"
    });

    await transaction.save();
    console.log("✅ Dynamic QR Transaction Saved for:", merchantName);

    res.json({
      code: 200,
      message: "QR generated successfully",
      details: upiUrl,
      transaction: {
        transactionId: transaction.transactionId,
        amount: transaction.amount,
        status: transaction.status,
        upiId: transaction.upiId,
        txnRefId: transaction.txnRefId,
        qrCode: upiUrl,
        txnNote: transaction.txnNote,
        merchantOrderId: transaction.merchantOrderId,
        paymentUrl: upiUrl,
        merchantName: merchantName
      }
    });

  } catch (error) {
    console.error("❌ Dynamic QR Error:", error);
    res.status(500).json({
      code: 500,
      message: "QR generation failed: " + error.message
    });
  }
};

// Default QR with Merchant Info
export const generateDefaultQR = async (req, res) => {
  try {
    const merchantId = req.user.id;
    const merchantName = `${req.user.firstname} ${req.user.lastname}`;

    console.log("🟡 Default QR Request from:", merchantName);

    // Generate unique IDs
    const transactionId = generateTransactionId();
    const txnRefId = generateTxnRefId();

    // Create UPI URL without amount
    const upiUrl = `upi://pay?pa=enpay1.skypal@fino&pn=${encodeURIComponent(merchantName)}&tn=Default%20QR%20Payment&tr=${txnRefId}&cu=INR`;

    // Create default transaction with merchant info
    const transaction = new Transaction({
      transactionId: transactionId,
      merchantOrderId: `ORDER${Date.now()}`,
      merchantHashId: process.env.MERCHANT_HASH_ID || "default_merchant_hash",
      merchantId: merchantId,
      merchantName: merchantName,
      amount: 0,
      status: "Pending",
      txnNote: "Default QR Payment",
      txnRefId: txnRefId,
      upiId: "enpay1.skypal@fino",
      qrCode: upiUrl,
      paymentUrl: upiUrl,
      currency: "INR"
    });

    await transaction.save();
    console.log("✅ Default QR Transaction Saved for:", merchantName);

    res.json({
      code: 200,
      message: "Default QR generated successfully",
      details: upiUrl,
      transaction: {
        transactionId: transaction.transactionId,
        upiId: transaction.upiId,
        status: transaction.status,
        txnNote: transaction.txnNote,
        txnRefId: transaction.txnRefId,
        qrCode: upiUrl,
        merchantOrderId: transaction.merchantOrderId,
        paymentUrl: upiUrl,
        merchantName: merchantName
      }
    });

  } catch (error) {
    console.error("❌ Default QR Error:", error);
    res.status(500).json({
      code: 500,
      message: "Default QR generation failed: " + error.message
    });
  }
};

// View Transaction Details
export const getTransactionDetails = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const merchantId = req.user.id;

    const transaction = await Transaction.findOne({ 
      transactionId, 
      merchantId 
    });

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    res.json(transaction);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Download Receipt
export const downloadReceipt = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const merchantId = req.user.id;

    const transaction = await Transaction.findOne({ 
      transactionId, 
      merchantId 
    });

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    if (transaction.status !== "Success") {
      return res.status(400).json({ message: "Receipt only available for successful transactions" });
    }

    // Generate receipt data (you can use PDF generation libraries here)
    const receiptData = {
      transactionId: transaction.transactionId,
      amount: transaction.amount,
      date: transaction.createdAt,
      merchantName: transaction.merchantName,
      status: transaction.status,
      upiId: transaction.upiId
    };

    res.json({
      code: 200,
      message: "Receipt generated successfully",
      receipt: receiptData
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Initiate Refund
export const initiateRefund = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { refundAmount, reason } = req.body;
    const merchantId = req.user.id;

    const transaction = await Transaction.findOne({ 
      transactionId, 
      merchantId 
    });

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    if (transaction.status !== "Success") {
      return res.status(400).json({ message: "Refund only available for successful transactions" });
    }

    // Implement refund logic here
    console.log(`🟡 Refund initiated for: ${transactionId}, Amount: ${refundAmount}, Reason: ${reason}`);

    res.json({
      code: 200,
      message: "Refund initiated successfully",
      refundId: `REF${Date.now()}`,
      transactionId: transactionId,
      refundAmount: refundAmount,
      status: "Processing"
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Check Transaction Status
export const checkTransactionStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const merchantId = req.user.id;

    const transaction = await Transaction.findOne({ 
      transactionId, 
      merchantId 
    });

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    res.json({
      transactionId: transaction.transactionId,
      status: transaction.status,
      amount: transaction.amount,
      upiId: transaction.upiId,
      txnRefId: transaction.txnRefId,
      createdAt: transaction.createdAt
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Webhook handler for payment notifications
export const handlePaymentWebhook = async (req, res) => {
  try {
    const { transactionId, status, upiId, amount, txnRefId, customerName, customerVpa, customerContact } = req.body;

    console.log("🟡 Webhook Received:", req.body);

    let transaction;

    if (transactionId) {
      transaction = await Transaction.findOne({ transactionId });
    } else if (txnRefId) {
      transaction = await Transaction.findOne({ txnRefId });
    }

    if (transaction) {
      transaction.status = status;
      if (upiId) transaction.upiId = upiId;
      if (amount) transaction.amount = amount;
      if (customerName) transaction.customerName = customerName;
      if (customerVpa) transaction.customerVpa = customerVpa;
      if (customerContact) transaction.customerContact = customerContact;
      transaction.updatedAt = new Date();
      
      await transaction.save();
      
      console.log(`✅ Transaction ${transaction.transactionId} updated to: ${status}`);
    }

    res.json({ code: 200, message: "Webhook processed successfully" });
  } catch (error) {
    console.error("❌ Webhook Error:", error);
    res.status(500).json({ message: "Webhook processing failed" });
  }
};