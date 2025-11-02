// controllers/transactionController.js - UPDATED AND SIMPLIFIED
import Transaction from "../models/Transaction.js"; // Import your MAIN Transaction model
// import QrCodeTransaction from "../models/QrCodeTransaction.js"; // Only import if you want a separate QR collection
import EnpayService from "../services/enpayService.js";

const generateUniqueId = (prefix) => `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateTxnRefId = () => `REF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

export const getTransactions = async (req, res) => {
  try {
    const merchantId = req.user.id;
    console.log("🟡 Fetching transactions for merchant:", merchantId);

    // Fetch from your MAIN transactions collection
    const transactions = await Transaction.find({ merchantId })
      .sort({ createdAt: -1 })
      .select('-__v'); // Exclude __v field

    console.log(`✅ Found ${transactions.length} transactions in main collection`);

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

export const generateDynamicQR = async (req, res) => {
  try {
    const { amount, txnNote = "Payment for Order" } = req.body;
    const merchantId = req.user.id;
    const merchantName = `${req.user.firstname || ''} ${req.user.lastname || ''}`.trim() || "SKYPAL SYSTEM PRIVATE LIMITED";

    console.log("🟡 Dynamic QR Request:", { merchantId, merchantName, amount, txnNote });

    if (!amount || parseFloat(amount) <= 0) { // Use parseFloat for robust check
      return res.status(400).json({
        code: 400,
        message: "Valid amount is required and must be greater than 0"
      });
    }

    const transactionId = generateUniqueId("TXN"); // Your internal unique ID
    const txnRefId = generateTxnRefId(); // Your internal transaction reference ID
    const merchantOrderId = generateUniqueId("ORDER"); // Enpay requires a unique merchantOrderId

    // Create UPI URL (for the QR image)
    const upiId = "enpay1.skypal@fino"; // Your default UPI ID
    const paymentUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&am=${parseFloat(amount).toFixed(2)}&tn=${encodeURIComponent(txnNote)}&tr=${txnRefId}&cu=INR`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(paymentUrl)}`;

    // Data for your MAIN Transaction collection
    const transactionData = {
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
      // Default values for other required fields from your main schema
      "Commission Amount": 0,
      mid: `MID${Date.now()}`,
      "Settlement Status": "Unsettled",
      "Vendor Ref ID": txnRefId, // Use txnRefId for vendor ref
      createdAt: new Date() // Use Date object for Date type
    };

    let enpayInitiated = false;
    let enpayErrorDetails = null;

    try {
      const enpayResponse = await EnpayService.initiateCollectRequest({
        amount: parseFloat(amount),
        merchantOrderId: merchantOrderId,
        transactionId: transactionId, // merchantTrnId for Enpay
        txnNote: txnNote
      });

      if (enpayResponse.success) {
        enpayInitiated = true;
        transactionData.enpayTxnId = enpayResponse.data.enpayTxnId; // Store Enpay's ID
        console.log("✅ Enpay collect request initiated successfully.");
      } else {
        enpayErrorDetails = enpayResponse.error;
        console.warn("⚠️ Enpay collect request failed:", enpayErrorDetails);
        // Optionally change status if Enpay initiation is critical
        transactionData.status = "FAILED"; // Mark as failed if Enpay initiation failed
      }
    } catch (enpayError) {
      enpayErrorDetails = enpayError.message;
      console.error("❌ Error calling EnpayService:", enpayErrorDetails);
      transactionData.status = "FAILED"; // Mark as failed if Enpay service call failed
    }

    console.log("🟡 Saving to main transactions collection...");
    const newTransaction = new Transaction(transactionData);
    await newTransaction.save();
    console.log("✅ Successfully saved to main transactions collection:", newTransaction.transactionId);

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
      enpayInitiated: enpayInitiated,
      enpayError: enpayErrorDetails // Include error details for frontend debugging
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

// Generate default QR (without amount) - NOW SAVES TO MAIN COLLECTION
export const generateDefaultQR = async (req, res) => {
  try {
    const merchantId = req.user.id;
    const merchantName = `${req.user.firstname || ''} ${req.user.lastname || ''}`.trim() || "SKYPAL SYSTEM PRIVATE LIMITED";

    console.log("🟡 Default QR Request from:", merchantName);

    const transactionId = generateUniqueId("TXN");
    const txnRefId = generateTxnRefId();
    const merchantOrderId = generateUniqueId("ORDER");

    const upiId = "enpay1.skypal@fino";
    const paymentUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&tn=Default%20QR%20Payment&tr=${txnRefId}&cu=INR`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(paymentUrl)}`;

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
      merchantOrderId: merchantOrderId,
      // Default values for other required fields
      "Commission Amount": 0,
      mid: `MID${Date.now()}`,
      "Settlement Status": "Unsettled",
      "Vendor Ref ID": txnRefId,
      createdAt: new Date()
    };

    let enpayInitiated = false;
    let enpayErrorDetails = null;

    // Call Enpay only if amount is > 0 (though default QR is 0, keeping the structure)
    if (transactionData.amount > 0) { // This condition will prevent Enpay call for default QR (amount 0)
      try {
        const enpayResponse = await EnpayService.initiateCollectRequest({
          amount: parseFloat(transactionData.amount),
          merchantOrderId: merchantOrderId,
          transactionId: transactionId,
          txnNote: transactionData.txnNote
        });

        if (enpayResponse.success) {
          enpayInitiated = true;
          transactionData.enpayTxnId = enpayResponse.data.enpayTxnId;
          console.log("✅ Enpay collect request initiated successfully for default QR.");
        } else {
          enpayErrorDetails = enpayResponse.error;
          console.warn("⚠️ Enpay collect request failed for default QR:", enpayErrorDetails);
          transactionData.status = "FAILED";
        }
      } catch (enpayError) {
        enpayErrorDetails = enpayError.message;
        console.error("❌ Error calling EnpayService for default QR:", enpayErrorDetails);
        transactionData.status = "FAILED";
      }
    } else {
      console.log("⏩ Skipping Enpay initiation for default QR as amount is 0.");
    }

    console.log("🟡 Saving default QR to main collection:", transactionData.transactionId);
    const newTransaction = new Transaction(transactionData);
    await newTransaction.save();
    console.log("✅ Default QR transaction saved:", newTransaction.transactionId);

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
      enpayInitiated: enpayInitiated,
      enpayError: enpayErrorDetails
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
      transactionId, // Your internal transactionId (merchantTrnId for Enpay)
      status, // Payment status from Enpay
      upiId,
      amount,
      txnRefId, // Your internal txnRefId
      customerName,
      customerVpa,
      customerContact,
      settlementStatus,
      merchantOrderId // Enpay's merchantOrderId
    } = req.body;

    console.log("🟡 Webhook Received for Transaction:", req.body);

    let transaction;

    // Find in MAIN Transaction collection using multiple identifiers
    if (transactionId) {
      transaction = await Transaction.findOne({ transactionId });
    }
    if (!transaction && merchantOrderId) {
      transaction = await Transaction.findOne({ merchantOrderId });
    }
    if (!transaction && txnRefId) { // Fallback to txnRefId
      transaction = await Transaction.findOne({ txnRefId });
    }

    if (transaction) {
      console.log(`✅ Found Transaction: ${transaction.transactionId}, Current status: ${transaction.status}`);

      const oldStatus = transaction.status;

      // Update transaction fields
      if (status) transaction.status = status;
      if (upiId) transaction.upiId = upiId;
      if (amount) transaction.amount = parseFloat(amount);
      if (customerName) transaction.customerName = customerName;
      if (customerVpa) transaction.customerVpa = customerVpa;
      if (customerContact) transaction.customerContact = customerContact;
      if (settlementStatus) transaction["Settlement Status"] = settlementStatus; // Update main schema field

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
      console.log("❌ Transaction not found in main collection for webhook. Attempting to create a new one.");
      // If transaction not found, create a new one based on webhook data.
      // This is a safety net for cases where initial QR generation might have failed to save locally,
      // but Enpay still processed a payment.
      const newTransactionId = transactionId || generateUniqueId("WEBHOOK");
      const newTxnRefId = txnRefId || generateTxnRefId();
      const newMerchantOrderId = merchantOrderId || generateUniqueId("WEBHOOK_ORDER");

      const webhookTransactionData = {
        transactionId: newTransactionId,
        merchantId: "WEBHOOK_UNKNOWN", // You might need a more robust way to derive merchantId
        merchantName: "SKYPAL SYSTEM PRIVATE LIMITED", // Default
        amount: parseFloat(amount) || 0,
        status: status || "SUCCESS", // Assume success if webhook received
        upiId: upiId || "enpay1.skypal@fino",
        txnRefId: newTxnRefId,
        merchantOrderId: newMerchantOrderId,
        customerName: customerName || null,
        customerVpa: customerVpa || null,
        customerContact: customerContact || null,
        "Commission Amount": 0, // Default
        mid: `MID${Date.now()}`,
        "Settlement Status": settlementStatus || "Unsettled",
        "Vendor Ref ID": newTxnRefId,
        createdAt: new Date()
      };

      try {
        const newWebhookTransaction = new Transaction(webhookTransactionData);
        await newWebhookTransaction.save();
        console.log(`✅ New transaction created from webhook: ${newWebhookTransaction.transactionId}`);
        res.json({
          code: 200,
          message: "New transaction created from webhook successfully",
          transactionId: newWebhookTransaction.transactionId,
          status: newWebhookTransaction.status
        });
      } catch (saveError) {
        console.error("❌ Error saving new transaction from webhook:", saveError);
        res.status(500).json({
          code: 500,
          message: "Webhook processed, but failed to save new transaction",
          error: saveError.message
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


// The rest of your controller functions (checkTransactionStatus, getTransactionDetails, etc.)
// should now correctly use the imported 'Transaction' model, which points to the 'transactions' collection.
// You might need to adjust some field names if they were inconsistent between your old 'QrTransaction' and new 'Transaction' models.

export const simulatePaymentWebhook = async (req, res) => {
  try {
    const { transactionId, merchantOrderId, amount = 100, status = "SUCCESS", customerVpa = "customer@okicici" } = req.body;

    // You need to ensure a transaction exists in your DB with this transactionId/merchantOrderId first
    let existingTransaction;
    if (transactionId) {
      existingTransaction = await Transaction.findOne({ transactionId });
    } else if (merchantOrderId) {
      existingTransaction = await Transaction.findOne({ merchantOrderId });
    }

    if (!existingTransaction) {
      // If no existing transaction, simulate a failed webhook or create a dummy one
      return res.status(400).json({ code: 400, message: "No existing transaction found to simulate webhook against. Please generate a QR first." });
    }

    const webhookData = {
      transactionId: existingTransaction.transactionId,
      merchantOrderId: existingTransaction.merchantOrderId,
      status: status,
      upiId: "customer@upi",
      amount: amount,
      txnRefId: existingTransaction.txnRefId,
      customerName: "Simulated Customer",
      customerVpa: customerVpa,
      customerContact: "9876543210",
      settlementStatus: "Unsettled"
    };

    console.log("🟡 Simulating webhook call for:", webhookData);

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
    res.status(500).