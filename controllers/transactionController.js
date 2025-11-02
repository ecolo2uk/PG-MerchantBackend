// controllers/transactionController.js
import Transaction from "../models/Transaction.js"; // Import your MAIN Transaction model
import EnpayService from "../services/enpayService.js";

// Helper functions (already good from your code)
const generateUniqueId = (prefix) => `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateTxnRefId = () => `REF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

// =========================================================================
// GET ALL TRANSACTIONS
// =========================================================================
export const getTransactions = async (req, res) => {
  try {
    const merchantId = req.user.id; // Assuming req.user.id is set by auth middleware
    console.log("🟡 Fetching transactions for merchant:", merchantId);

    const transactions = await Transaction.find({ merchantId })
      .sort({ createdAt: -1 })
      .select('-__v'); // Exclude __v field

    console.log(`✅ Found ${transactions.length} transactions for merchant ${merchantId}`);

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

// =========================================================================
// GENERATE DYNAMIC QR CODE (WITH AMOUNT)
// =========================================================================
export const generateDynamicQR = async (req, res) => {
  try {
    const { amount, txnNote = "Payment for Order" } = req.body;
    const merchantId = req.user.id; // Assuming req.user.id is set by auth middleware
    const merchantName = `${req.user.firstname || ''} ${req.user.lastname || ''}`.trim() || "SKYPAL SYSTEM PRIVATE LIMITED";

    console.log("🟡 Dynamic QR Request:", { merchantId, merchantName, amount, txnNote });

    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({
        code: 400,
        message: "Valid amount is required and must be greater than 0"
      });
    }

    // Generate unique IDs
    const transactionId = generateUniqueId("TXN"); // Your internal unique ID
    const txnRefId = generateTxnRefId(); // Your internal transaction reference ID
    const merchantOrderId = generateUniqueId("ORDER"); // Enpay requires a unique merchantOrderId

    const upiId = "enpay1.skypal@fino"; // Your default UPI ID
    const paymentUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&am=${parseFloat(amount).toFixed(2)}&tn=${encodeURIComponent(txnNote)}&tr=${txnRefId}&cu=INR`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(paymentUrl)}`;

    // Prepare data for saving to your MAIN Transaction collection
    const transactionData = {
      transactionId: transactionId,
      merchantId: merchantId,
      merchantName: merchantName,
      amount: parseFloat(amount),
      status: "INITIATED", // Initial status
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

    // --- Attempt to initiate collect request with Enpay ---
    try {
      const enpayResponse = await EnpayService.initiateCollectRequest({
        amount: transactionData.amount, // Use the already parsed float amount
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
        // If Enpay initiation fails, the transaction status remains "INITIATED"
        // or you might want to change it to "ENPAY_FAILED" to signify the failure.
        // For now, let's keep it INITIATED as the QR is still generated.
        // transactionData.status = "ENPAY_FAILED";
      }
    } catch (enpayError) {
      enpayErrorDetails = enpayError.message;
      console.error("❌ Error calling EnpayService:", enpayErrorDetails);
      // transactionData.status = "ENPAY_FAILED";
    }

    console.log("🟡 Saving to main transactions collection:", transactionData.transactionId);
    const newTransaction = new Transaction(transactionData);
    await newTransaction.save();
    console.log("✅ Successfully saved to main transactions collection.");

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
        merchantOrderId: newTransaction.merchantOrderId,
        enpayTxnId: newTransaction.enpayTxnId // Include Enpay's ID if available
      },
      qrCode: qrCodeUrl,
      upiUrl: paymentUrl,
      enpayInitiated: enpayInitiated,
      enpayError: enpayErrorDetails // Include error details for frontend debugging
    });

  } catch (error) {
    console.error("❌ Dynamic QR Generation Error:", error);
    res.status(500).json({
      code: 500,
      message: "QR generation failed",
      error: error.message
    });
  }
};

// =========================================================================
// GENERATE DEFAULT QR (WITHOUT AMOUNT)
// =========================================================================
export const generateDefaultQR = async (req, res) => {
  try {
    const merchantId = req.user.id; // Assuming req.user.id is set by auth middleware
    const merchantName = `${req.user.firstname || ''} ${req.user.lastname || ''}`.trim() || "SKYPAL SYSTEM PRIVATE LIMITED";

    console.log("🟡 Default QR Request from:", merchantName);

    // Generate unique IDs
    const transactionId = generateUniqueId("TXN");
    const txnRefId = generateTxnRefId();
    const merchantOrderId = generateUniqueId("ORDER");

    const upiId = "enpay1.skypal@fino";
    // For default QR, amount is 0, so don't include 'am' parameter in UPI URL
    const paymentUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&tn=Default%20QR%20Payment&tr=${txnRefId}&cu=INR`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(paymentUrl)}`;

    // Prepare data for saving to your MAIN Transaction collection
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

    // --- For Default QR (amount 0), we typically don't initiate Enpay collect request ---
    // Enpay's collect request API usually requires an amount > 0.
    // If you need Enpay to track 0-amount QR generations, you'd need to confirm
    // their API supports it or use a nominal amount if acceptable.
    console.log("⏩ Skipping Enpay initiation for default QR as amount is 0.");
    // if (transactionData.amount > 0) { // This condition (currently false) would enable Enpay call
    //   try {
    //     const enpayResponse = await EnpayService.initiateCollectRequest({
    //       amount: transactionData.amount,
    //       merchantOrderId: merchantOrderId,
    //       transactionId: transactionId,
    //       txnNote: transactionData.txnNote
    //     });
    //     // ... handle response like in generateDynamicQR ...
    //   } catch (enpayError) { /* ... */ }
    // }

    console.log("🟡 Saving default QR to main transactions collection:", transactionData.transactionId);
    const newTransaction = new Transaction(transactionData);
    await newTransaction.save();
    console.log("✅ Default QR transaction saved.");

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
      enpayInitiated: enpayInitiated, // Will be false for default QR
      enpayError: enpayErrorDetails // Will be null for default QR
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

// =========================================================================
// HANDLE PAYMENT WEBHOOK FROM ENPAY
// =========================================================================
export const handlePaymentWebhook = async (req, res) => {
  try {
    const {
      transactionId, // Your internal transactionId (merchantTrnId for Enpay)
      status, // Payment status from Enpay (e.g., "SUCCESS", "FAILED")
      upiId, // Customer's UPI ID or Enpay's default
      amount,
      txnRefId, // Your internal txnRefId
      customerName,
      customerVpa,
      customerContact,
      settlementStatus, // Settlement status from Enpay
      merchantOrderId, // Enpay's merchantOrderId
      enpayTxnId // Enpay's actual transaction ID
    } = req.body;

    console.log("🟡 Webhook Received for Transaction:", req.body);

    let transaction;

    // Prioritize finding by Enpay's transaction ID or your internal IDs
    if (enpayTxnId) {
      transaction = await Transaction.findOne({ enpayTxnId });
    }
    if (!transaction && transactionId) {
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

      // Update transaction fields from webhook
      if (status) transaction.status = status;
      if (upiId) transaction.upiId = upiId; // This could be the customer's UPI ID or Enpay's
      if (amount) transaction.amount = parseFloat(amount); // Ensure amount is number
      if (customerName) transaction.customerName = customerName;
      if (customerVpa) transaction.customerVpa = customerVpa;
      if (customerContact) transaction.customerContact = customerContact;
      if (settlementStatus) transaction["Settlement Status"] = settlementStatus;
      if (enpayTxnId && !transaction.enpayTxnId) transaction.enpayTxnId = enpayTxnId; // Store Enpay's ID if not already there
      if (txnRefId && !transaction["Vendor Ref ID"]) transaction["Vendor Ref ID"] = txnRefId; // Ensure vendor ref is updated

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
      // or if Enpay initiates a transaction not previously recorded.
      const newTransactionId = transactionId || generateUniqueId("WEBHOOK");
      const newTxnRefId = txnRefId || generateTxnRefId();
      const newMerchantOrderId = merchantOrderId || generateUniqueId("WEBHOOK_ORDER");

      const webhookTransactionData = {
        transactionId: newTransactionId,
        merchantId: req.user?.id || "WEBHOOK_UNKNOWN", // Try to get merchantId from user or use default
        merchantName: req.user?.merchantName || "SKYPAL SYSTEM PRIVATE LIMITED", // Try to get merchant name
        amount: parseFloat(amount) || 0,
        status: status || "SUCCESS", // Assume success if webhook received, but could be PENDING, FAILED
        upiId: upiId || "enpay1.skypal@fino",
        txnRefId: newTxnRefId,
        merchantOrderId: newMerchantOrderId,
        enpayTxnId: enpayTxnId || null,
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


// =========================================================================
// SIMULATE PAYMENT WEBHOOK (FOR TESTING)
// =========================================================================
export const simulatePaymentWebhook = async (req, res) => {
  try {
    const { transactionId, merchantOrderId, amount = 100, status = "SUCCESS", customerVpa = "customer@okicici", enpayTxnId, txnRefId } = req.body;

    // You need to ensure a transaction exists in your DB with this transactionId/merchantOrderId first
    let existingTransaction;
    if (transactionId) {
      existingTransaction = await Transaction.findOne({ transactionId });
    } else if (merchantOrderId) {
      existingTransaction = await Transaction.findOne({ merchantOrderId });
    } else if (enpayTxnId) {
      existingTransaction = await Transaction.findOne({ enpayTxnId });
    } else if (txnRefId) {
      existingTransaction = await Transaction.findOne({ txnRefId });
    }


    if (!existingTransaction) {
      // If no existing transaction, we can still simulate a creation scenario
      // or return an error depending on test case
      console.log("⚠️ No existing transaction found for simulation. Will attempt to create one via webhook handler.");
      // We will proceed to call handlePaymentWebhook, which has logic to create if not found
    }

    const webhookData = {
      transactionId: existingTransaction?.transactionId || transactionId || generateUniqueId("SIM_TXN"),
      merchantOrderId: existingTransaction?.merchantOrderId || merchantOrderId || generateUniqueId("SIM_ORDER"),
      enpayTxnId: existingTransaction?.enpayTxnId || enpayTxnId || generateUniqueId("SIM_ENPAY"), // Populate Enpay's ID
      txnRefId: existingTransaction?.txnRefId || txnRefId || generateTxnRefId(),
      status: status,
      upiId: "simulated@upi",
      amount: amount,
      customerName: "Simulated Customer",
      customerVpa: customerVpa,
      customerContact: "9876543210",
      settlementStatus: "Unsettled",
      merchantId: existingTransaction?.merchantId || "TEST_MERCHANT_ID", // Add merchant ID for creation
      merchantName: existingTransaction?.merchantName || "SIMULATED MERCHANT"
    };

    console.log("🟡 Simulating webhook call with data:", webhookData);

    const fakeReq = {
      body: webhookData,
      user: { // Mock user for webhook creation scenario
        id: webhookData.merchantId,
        merchantName: webhookData.merchantName
      }
    };
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
          console.log(`❌ Simulated webhook error (${code}):`, data);
          res.status(code).json(data);
        }
      })
    };

    // Call the actual webhook handler
    await handlePaymentWebhook(fakeReq, fakeRes);

  } catch (error) {
    console.error("❌ Simulation error:", error);
    res.status(500).json({
      code: 500,
      message: "Webhook simulation failed",
      error: error.message
    });
  }
};


// =========================================================================
// ENPAY RETURN/SUCCESS URLS (These are usually frontend redirects,
// but if Enpay posts data directly, handle them as webhooks or log them)
// =========================================================================
export const handleEnpayReturn = (req, res) => {
  console.log("🟡 Enpay Return URL hit:", req.query || req.body);
  // Typically, you would redirect the user to a success page on your frontend
  // and fetch the transaction status from your backend.
  res.redirect('/payment-status?status=return&transactionId=' + (req.query.transactionId || ''));
};

export const handleEnpaySuccess = (req, res) => {
  console.log("🟡 Enpay Success URL hit:", req.query || req.body);
  // Typically, you would redirect the user to a success page on your frontend
  // and fetch the transaction status from your backend.
  res.redirect('/payment-status?status=success&transactionId=' + (req.query.transactionId || ''));
};