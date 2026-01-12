// controllers/transactionController.js - FIXED VERSION
import Transaction from "../models/Transaction.js";
import mongoose from "mongoose";
import axios from "axios";
import xlsx from "xlsx";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Merchant from "../models/Merchant.js";
// const Razorpay = require("razorpay");
import Razorpay from "razorpay";
import { isJWTFormat } from "../utils/isJWTFormat.js";
import { todayFilter } from "../utils/todayFilter.js";
import PayoutTransaction from "../models/PayoutTransaction.js";
import TransactionsLog from "../models/TransactionsLog.js";

// Generate unique IDs
const generateTransactionId = () =>
  `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateDynamicQRTransactionId = () =>
  `DYNAMIC${Date.now()}${Math.floor(Math.random() * 1000)}`;

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:5001";

const formatDateForExcel = (date) => {
  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

export const getMerchantConnectorAccount = async (merchantId) => {
  try {
    // Ensure we have a valid ObjectId
    let merchantObjectId;
    try {
      merchantObjectId = new mongoose.Types.ObjectId(merchantId);
    } catch {
      merchantObjectId = merchantId; // fallback if not a valid ObjectId
    }

    const merchantConnectorCollection = mongoose.connection.db.collection(
      "merchantconnectoraccounts"
    );

    // Find primary active connector for this merchant
    const connectorAccount = await merchantConnectorCollection.findOne({
      isPrimary: true,
      status: "Active",
      $or: [{ userId: merchantObjectId }, { merchantId: merchantObjectId }],
    });

    if (!connectorAccount) return null;

    // Parallel fetch for connector and connectorAccount details
    const [connectorDetails, connectorAccDetails] = await Promise.all([
      connectorAccount.connectorId
        ? mongoose.connection.db
            .collection("connectors")
            .findOne({ _id: connectorAccount.connectorId })
        : null,
      connectorAccount.connectorAccountId
        ? mongoose.connection.db.collection("connectoraccounts").findOne({
            _id: new mongoose.Types.ObjectId(
              connectorAccount.connectorAccountId
            ),
          })
        : null,
    ]);

    // Extract integration keys safely
    const integrationKeys =
      connectorAccDetails?.integrationKeys ||
      connectorAccDetails?.integratedonKeys ||
      connectorAccDetails?.credentials ||
      {};

    return {
      ...connectorAccount,
      connectorDetails,
      connectorAccDetails,
      integrationKeys,
    };
  } catch (error) {
    console.error("❌ Error fetching merchant connector:", error);
    return null;
  }
};

// const failTransaction = async (
//   transactionId,
//   merchantId,
//   error,
//   extra = {}
// ) => {
//   await Transaction.findByIdAndUpdate(transactionId, {
//     status: "FAILED",
//     totalApplied: true,
//     wasFailed: true,
//     error,
//     updatedAt: new Date(),
//     ...extra,
//   });

//   await Merchant.findOneAndUpdate(
//     { userId: merchantId },
//     {
//       $inc: {
//         totalTransactions: 1,
//         payinTransactions: 1,
//         failedTransactions: 1,
//       },
//       $set: { lastPayinTransactions: transactionId },
//     }
//   );
// };

const failTransaction = async (
  transactionId,
  merchantId,
  error,
  options = {}
) => {
  const update = {
    status: "FAILED",
    wasFailed: true,
    totalApplied: true,
    updatedAt: new Date(),
  };

  /* ✅ Gateway Error (optional) */
  if (options.connector) {
    if (options.transactionStatusField) {
      update[options.transactionStatusField] = "FAILED";
    }
    if (options.initiationStatusField) {
      update[options.initiationStatusField] = "ATTEMPTED_FAILED";
    }
    update.error = error?.response?.data || error?.message || error;
  } else {
    update.error = error?.response?.data || error?.message || error;
  }

  await Transaction.findByIdAndUpdate(transactionId, update);

  await Merchant.findOneAndUpdate(
    { userId: merchantId },
    {
      $inc: {
        totalTransactions: 1,
        payinTransactions: 1,
        failedTransactions: 1,
      },
      $set: { lastPayinTransactions: transactionId },
    }
  );

  await TransactionsLog.findOneAndUpdate(
    {
      referenceId: transactionId,
    },
    {
      $set: {
        status: "FAILED",
        description: "Payment failed",
        updatedAt: new Date(),
        txnCompletedDate: new Date(),
      },
    }
  );
};

const generateRazorpayQR = async (transactionData, integrationKeys) => {
  try {
    // console.log(keys);
    // 1️⃣ Fetch keys from DB
    const requiredKeys = ["key_id", "key_secret"];

    const missingKeys = requiredKeys.filter((key) => !integrationKeys[key]);

    if (missingKeys.length > 0) {
      console.error("Razorpay keys missing:", missingKeys);
      throw new Error(
        `Missing Razorpay credentials: ${missingKeys.join(", ")}`
      );
    }
    // 2️⃣ Initialize Razorpay with DB keys
    const razorpay = new Razorpay({
      key_id: integrationKeys.key_id,
      key_secret: integrationKeys.key_secret,
    });

    // 3️⃣ Prepare expiry timestamp
    const closeBy = Math.floor(Date.now() / 1000) + 3 * 60;

    // 4️⃣ Prepare payload (amount OR no amount)
    let payload = {
      type: "upi_qr",
      name: transactionData.merchantName,
      description: transactionData.txnNote || "",
      // customer_id: transactionData.txnRefId || "",
    };

    if (transactionData.amount) {
      payload.close_by = closeBy;
      payload.usage = "single_use";
      payload.fixed_amount = true;
      payload.payment_amount = transactionData.amount * 100; // paise
    } else {
      payload.usage = "multiple_use";
      payload.fixed_amount = false;
    }

    // console.log(payload);
    // 5️⃣ Create QR
    const qr = await razorpay.qrCode.create(payload);
    // console.log(qr);

    return {
      success: true,
      razorpayTransactionCreated: true,
      razorPayTxnId: qr.id,
      rawResponse: qr,
      qrCode: qr.image_url,
      paymentUrl: qr.image_url,
      connector: "razorpay",
      message: "QR generated via Razorpay",
    };
  } catch (error) {
    console.error("QR creation error:", error);
    throw error;
  }
};

// ✅ ENPAY QR GENERATION - FIXED (CRITICAL)
const generateEnpayQR = async (transactionData, integrationKeys) => {
  try {
    // console.log("🔍 ENPAY QR GENERATION STARTED");
    // console.log("Transaction Data:", transactionData);

    // Validate credentials
    const requiredKeys = [
      "X-Merchant-Key",
      "X-Merchant-Secret",
      "merchantHashId",
      "merchantVpa",
    ];
    const missingKeys = requiredKeys.filter((key) => !integrationKeys[key]);

    if (missingKeys.length > 0) {
      console.error("❌ MISSING ENPAY CREDENTIALS:", missingKeys);
      throw new Error(`Missing Enpay credentials: ${missingKeys.join(", ")}`);
    }

    // console.log("✅ Enpay credentials validated");

    // ✅ CRITICAL: Create EXACT payload as Enpay expects
    const payload = {
      merchantHashId: integrationKeys.merchantHashId,
      txnRefId: transactionData.transactionId,
      txnNote: transactionData.txnNote || "",
    };
    let apiUrl;
    // Add amount only if provided (for dynamic QR)
    if (transactionData.amount && transactionData.amount > 0) {
      payload.txnAmount = parseFloat(transactionData.amount).toFixed(2);
      // console.log("💰 Amount added to payload:", payload.txnAmount);

      // console.log("🟡 Enpay API Payload:", payload);

      // Use base URL from integration keys or default
      const baseUrl =
        integrationKeys.baseUrl ||
        "https://api.enpay.in/enpay-product-service/api/v1/merchant-gateway";
      apiUrl = `${baseUrl}/dynamicQR`;
    } else {
      // console.log("🟡 Enpay API Payload:", payload);

      // Use base URL from integration keys or default
      const baseUrl =
        integrationKeys.baseUrl ||
        "https://api.enpay.in/enpay-product-service/api/v1/merchant-gateway";
      apiUrl = `${baseUrl}/staticQR`;
    }
    // console.log("🟡 Calling Enpay API:", apiUrl);

    const response = await axios.post(apiUrl, payload, {
      headers: {
        "Content-Type": "application/json",
        "X-Merchant-Key": integrationKeys["X-Merchant-Key"],
        "X-Merchant-Secret": integrationKeys["X-Merchant-Secret"],
        Accept: "application/json",
      },
      timeout: 30000,
    });

    // console.log("✅ Enpay API Response Code:", response.data.code);
    // console.log("✅ Enpay API Message:", response.data.message);

    // Check Enpay response
    if (response.data.code === 0) {
      // ✅ Transaction successfully created in Enpay
      const qrCodeData = response.data.details;

      // console.log("✅ Enpay QR generated successfully", qrCodeData);

      return {
        success: true,
        enpayTransactionCreated: true,
        enpayTxnId: transactionData.transactionId,
        enpayResponse: response.data,
        qrData: `data:image/png;base64,${qrCodeData}`,
        paymentUrl: `upi://pay?pa=${
          integrationKeys.merchantHashId
        }@enpay&pn=${encodeURIComponent(
          transactionData.merchantName
        )}&tn=${encodeURIComponent(transactionData.txnNote)}&tr=${
          transactionData.transactionId
        }`,
        connector: "enpay",
        message: "QR generated via Enpay",
      };
    } else {
      console.error("❌ Enpay returned error code:", response.data.code);
      throw new Error(
        `Enpay error: ${response.data.message || "Unknown error"}`
      );
    }
  } catch (error) {
    // console.error("❌ ENPAY API ERROR DETAILS:", {
    //   message: error.message,
    //   status: error.response?.status,
    //   data: error.response?.data,
    //   url: error.config?.url,
    //   headers: error.config?.headers,
    // });

    throw new Error(
      `Enpay QR generation failed: ${
        error.response?.data?.message || error.message
      }`
    );
  }
};

export const generateCashfreeQR = async (transactionData, merchant, keys) => {
  try {
    // console.log(keys, transactionData);
    if (!keys || !keys["x-client-id"] || !keys["x-client-secret"]) {
      throw new Error("Missing Cashfree integration keys");
    }

    const payload = {
      order_id: transactionData.txnRefId,
      order_amount: Number(transactionData.amount).toFixed(2),
      order_currency: "INR",
      order_note: transactionData.txnNote || "",
      customer_details: {
        customer_id: merchant.mid || `cust_${Date.now()}`,
        customer_name: merchant.merchantName,
        customer_email: merchant.email,
        customer_phone: merchant.contact,
      },
      order_meta: {
        return_url: `${process.env.FRONTEND_URL}/transaction/list`,
      },
    };

    const response = await axios.post(
      "https://api.cashfree.com/pg/orders",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          "x-client-id": keys["x-client-id"],
          "x-client-secret": keys["x-client-secret"],
          "x-api-version": keys["x-api-version"] || "2023-08-01",
        },
        timeout: 30000,
      }
    );

    const data = response.data;

    if (!data?.payment_session_id) {
      throw new Error("Cashfree did not return payment_session_id");
    }

    // ✅ OFFICIAL CASHFREE PAYMENT URL
    const paymentLink = `https://payments.cashfree.com/order/#${data.payment_session_id}`;

    // ✅ Generate QR IMAGE from payment link
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
      paymentLink
    )}`;

    return {
      success: true,
      // qrType: "PAYMENT_URL",
      // qrValue: paymentUrl,
      cashfreeTransactionCreated: true,
      cfOrderId: response.data.order_id,
      rawResponse: data,
      qrCode: qrImageUrl,
      paymentUrl: paymentLink,
      connector: "cashfree",
      message: "QR generated via Cashfree",
    };
  } catch (err) {
    console.error(
      "Cashfree QR generation failed:",
      err.response?.data || err.message
    );
    throw new Error("Cashfree QR generation failed");
  }
};

// ✅ MAIN DYNAMIC QR FUNCTION - COMPLETELY FIXED
export const generateDynamicQR = async (req, res) => {
  console.log("🚀 ========== GENERATE DYNAMIC QR STARTED ==========");
  // console.log("🔍 Request Body:", req.body);
  // console.log("🔍 Request Headers:", req.headers["content-type"]);
  let savedTransaction = null;

  try {
    // ✅ FIX 1: Check if body exists
    if (!req.body) {
      console.error("❌ ERROR: req.body is undefined");
      return res.status(400).json({
        success: false,
        message: "Request body is required",
        error: "Request body is undefined",
      });
    }

    const merchantId = req.user?.id || req.user?._id;

    if (!merchantId) {
      return res.status(400).json({
        success: false,
        message: "Merchant ID not found",
      });
    }

    const [user, merchant] = await Promise.all([
      User.findById(merchantId).lean(),
      Merchant.findOne({ userId: merchantId }).lean(),
    ]);

    if (!user || !merchant) {
      return res
        .status(404)
        .json({ success: false, message: "Merchant not found" });
    }

    if (user.transactionLimit) {
      const dateFilter = todayFilter();
      // console.log(dateFilter, user._id, user.transactionLimit);
      const [payinCount, payoutCount] = await Promise.all([
        Transaction.countDocuments({ merchantId, ...dateFilter }),
        PayoutTransaction.countDocuments({
          merchantId,
          ...dateFilter,
        }),
      ]);

      const totalTransactionsCount = payinCount + payoutCount;

      // console.log(totalTransactionsCount, "transaction Count");

      const used = Number(totalTransactionsCount);
      const limit = Number(user.transactionLimit || 0);

      if (used >= limit) {
        return res.status(403).json({
          success: false,
          message: "Transaction limit has been exceeded for today!",
        });
      }
    }

    const merchantName =
      user.company || user?.firstname + " " + (user?.lastname || "");

    const transactionId = generateDynamicQRTransactionId();
    const txnRefId = transactionId; // Use same as transactionId for Enpay
    const merchantOrderId = `ORDER${Date.now()}`;

    const { amount, txnNote = "" } = req.body;

    const transactionData = {
      transactionId,
      merchantId,
      merchantName,
      mid: req.user.mid || "",
      amount: amount,
      status: "INITIATED",
      previousStatus: "INITIATED",
      payInApplied: false,
      txnNote,
      gatewayTransactionId: transactionId,
      paymentMethod: "UPI",
      merchantOrderId,
      txnRefId,
      netAmount: amount ? parseFloat(amount) : 0,
      transactionType: "QR",
    };

    // console.log("📊 Transaction data prepared:", transactionData);
    savedTransaction = await Transaction.create(transactionData);

    // ✅ FIX 2: Log the actual values
    // console.log("🟡 Parsed values:", {
    //   amount: amount,
    //   txnNote: txnNote,
    //   bodyType: typeof req.body,
    //   bodyKeys: Object.keys(req.body),
    // });

    await TransactionsLog.create({
      merchantId: user._id,
      referenceType: "PAYIN",
      referenceId: savedTransaction._id,
      referenceNo: savedTransaction.transactionId,
      referenceTxnId: txnRefId,
      description: "Dynamic QR generated",
      debit: 0,
      credit: 0, // no money yet
      balance: merchant.availableBalance,
      status: "INITIATED",
      source: "API",
      txnInitiatedDate: new Date(),
    });

    if (!amount) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "Amount cannot be blank"
      );
      return res.status(400).json({
        success: false,
        message: "Amount cannot be blank",
      });
    }

    const amountNum = Number(amount);

    if (isNaN(amountNum) || amountNum < 500) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "Amount must be greater than or equal to 500"
      );
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than or equal to 500",
      });
    }

    // ✅ Step 1: Get Merchant Connector
    // console.log("🟡 Step 1: Getting merchant connector...");
    const merchantConnectorAccount = await getMerchantConnectorAccount(
      merchantId
    );
    // console.log("🎯 Using Connector:", merchantConnectorAccount);

    if (!merchantConnectorAccount) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "No payment connector configured. Please contact admin."
      );
      // console.log("❌ No connector account found for merchant");
      return res.status(400).json({
        success: false,
        message: "No payment connector configured. Please contact admin.",
        needsSetup: true,
      });
    }
    // console.log(
    //   "✅ Merchant connector found:",
    //   merchantConnectorAccount.connectorDetails.name
    // );

    const connectorName =
      merchantConnectorAccount.connectorDetails?.name.toLowerCase();

    const connectorMeta = {
      // Connector Info
      connectorUsed: connectorName,
      connectorName: connectorName,
      connectorAccountId: merchantConnectorAccount.connectorAccDetails._id,
      connectorId: merchantConnectorAccount.connectorDetails._id,
      terminalId: merchantConnectorAccount.terminalId,
      merchantHashId:
        merchantConnectorAccount.connectorAccDetails.integrationKeys
          ?.merchantHashId || "",

      // Payment Info
      paymentGateway: connectorName,
      source: connectorName,
      updatedAt: new Date(),
    };

    await Transaction.findByIdAndUpdate(savedTransaction._id, connectorMeta);

    await TransactionsLog.findOneAndUpdate(
      {
        referenceType: "PAYIN",
        referenceId: savedTransaction._id,
      },
      {
        $set: {
          connector: {
            name: connectorName,
            connectorId: merchantConnectorAccount.connectorDetails._id,
            connectorAccountId:
              merchantConnectorAccount.connectorAccDetails._id,
            gatewayRefId: txnRefId,
          },
          updatedAt: new Date(),
        },
      }
    );

    let qrResult;
    if (connectorName === "cashfree") {
      try {
        qrResult = await generateCashfreeQR(
          transactionData,
          merchant,
          merchantConnectorAccount.connectorAccDetails.integrationKeys
        );

        // console.log(qrResult);

        const updateData = {
          qrCode: qrResult.qrCode,
          paymentUrl: qrResult.paymentUrl,
          cfOrderId: qrResult.cfOrderId,
          cfResponse: qrResult.rawResponse,
          cfTransactionStatus: "CREATED",
          cfInitiationStatus: "CASHFREE_CREATED",
          updatedAt: new Date(),
        };

        if (qrResult.cashfreeTransactionCreated) {
          updateData.status = "INITIATED";
          updateData.gatewayTransactionId = qrResult.cfOrderId;
        }

        await Transaction.findByIdAndUpdate(savedTransaction._id, updateData);
      } catch (error) {
        console.error(error, "Cashfree error");
        await failTransaction(savedTransaction._id, merchantId, error, {
          connector: connectorName,
          transactionStatusField: "cfTransactionStatus",
          initiationStatusField: "cfInitiationStatus",
        });
        return res.status(502).json({
          success: false,
          message: error.message || "Cashfree QR generation failed",
        });
      }
    } else if (connectorName === "enpay") {
      try {
        qrResult = await generateEnpayQR(
          transactionData,
          merchantConnectorAccount.connectorAccDetails.integrationKeys
        );

        const updateData = {
          qrCode: qrResult.qrData,
          paymentUrl: qrResult.paymentUrl,
          enpayTxnId: qrResult.enpayTxnId,
          enpayQrCode: qrResult.qrData,
          enpayResponse: qrResult.enpayResponse,
          enpayTransactionStatus: "CREATED",
          enpayInitiationStatus: "ENPAY_CREATED",
          updatedAt: new Date(),
        };

        if (qrResult.enpayTransactionCreated) {
          updateData.status = "INITIATED";
          updateData.gatewayTransactionId = qrResult.enpayTxnId;
        }

        await Transaction.findByIdAndUpdate(savedTransaction._id, updateData);
      } catch (error) {
        console.error(error, "Enpay error");
        await failTransaction(savedTransaction._id, merchantId, error, {
          connector: connectorName,
          transactionStatusField: "enpayTransactionStatus",
          initiationStatusField: "enpayInitiationStatus",
        });
        if (error.message === "Duplicate transaction reference Id.") {
          return res.status(400).json({
            success: false,
            message: "txnRefId already exists.",
          });
        }
        return res.status(502).json({
          success: false,
          message: error.message || "Enpay QR generation failed",
        });
      }
    } else if (connectorName === "razorpay") {
      try {
        qrResult = await generateRazorpayQR(
          transactionData,
          merchantConnectorAccount.connectorAccDetails.integrationKeys
        );

        const updateData = {
          qrCode: qrResult.qrCode,
          paymentUrl: qrResult.paymentUrl,
          txnRefId: qrResult.razorPayTxnId,
          razorPayTxnId: qrResult.razorPayTxnId,
          razorPayResponse: qrResult.rawResponse,
          razorPayTransactionStatus: "CREATED",
          razorPayInitiationStatus: "RAZORPAY_CREATED",
          updatedAt: new Date(),
        };

        if (qrResult.razorpayTransactionCreated) {
          updateData.status = "INITIATED";
          updateData.gatewayTransactionId = qrResult.razorPayTxnId;
        }

        await Transaction.findByIdAndUpdate(savedTransaction._id, updateData);
      } catch (error) {
        console.error(error, "Razorpay error");
        await failTransaction(savedTransaction._id, merchantId, error, {
          connector: connectorName,
          transactionStatusField: "razorPayTransactionStatus",
          initiationStatusField: "razorPayInitiationStatus",
        });
        return res.status(502).json({
          success: false,
          message: error.message || "Razorpay QR generation failed",
        });
      }
    } else {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        `Unsupported connector: ${connectorName}`
      );
      return res.status(400).json({
        success: false,
        message: `Unsupported connector: ${connectorName}`,
      });
    }
    // console.log("✅ QR Generation Result:", {
    //   success: qrResult.success,
    //   enpayTransactionCreated: qrResult.enpayTransactionCreated,
    //   connector: qrResult.connector,
    //   hasQR: !!qrResult.qrData,
    // });

    await Merchant.findOneAndUpdate(
      { userId: user._id },
      { lastPayinTransactions: savedTransaction._id }
    ).catch(console.error);

    // Fetch updated transaction
    const updatedTransaction = await Transaction.findById(
      savedTransaction._id
    ).lean();

    await TransactionsLog.updateOne(
      { referenceId: savedTransaction._id },
      {
        $set: {
          "connector.gatewayTransactionId":
            updatedTransaction.gatewayTransactionId,
          "connector.gatewayOrderId": updatedTransaction.merchantOrderId,
          updatedAt: new Date(),
        },
      }
    );

    // console.log(
    //   "✅ Transaction updated successfully:",
    //   updatedTransaction.transactionId
    // );

    const responseData = {
      success: true,
      transactionId: updatedTransaction.transactionId,
      qrCode: updatedTransaction.qrCode,
      paymentUrl: updatedTransaction.paymentUrl,
      amount: updatedTransaction.amount,
      status: updatedTransaction.status,
      connector: updatedTransaction.connectorName,
      message: "QR generated successfully!",
      transaction: {
        _id: updatedTransaction._id,
        createdAt: updatedTransaction.createdAt,
        updatedAt: updatedTransaction.updatedAt,
      },
    };

    // console.log("✅ Response prepared:", responseData.success);
    console.log("🚀 ========== GENERATE DYNAMIC QR COMPLETED ==========");

    res.status(200).json(responseData);
  } catch (error) {
    console.error("❌ GENERATE QR ERROR:", error);

    // Update transaction status if it exists
    if (savedTransaction?._id) {
      await failTransaction(
        savedTransaction._id,
        savedTransaction.merchantId,
        error || "Internal Server Error."
      );
    }

    res.status(500).json({
      success: false,
      message: "Failed to generate dynamic QR",
      error: error.message,
      details: error.response?.data || error.message || null,
      connector: savedTransaction.connectorName,
    });
  }
};

export const generateDynamicQRTransaction = async (req, res) => {
  console.log("🚀 ========== GENERATE DYNAMIC QR STARTED ==========");
  // console.log("Body keys:", Object.keys(req.body));
  // console.log("🔍 Request Headers:", req.headers);
  let savedTransaction = null;

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided" });
    }

    let decoded;
    try {
      decoded = jwt.verify(
        authHeader.split(" ")[1],
        process.env.JWT_SECRET || "mysecretkey"
      );
    } catch (err) {
      return res.status(401).json({
        success: false,
        message:
          err.name === "TokenExpiredError"
            ? "Token expired"
            : "Invalid authorization token",
      });
    }
    // console.log("Decoded payload:", decoded);

    const merchantId = new mongoose.Types.ObjectId(decoded.userId);

    const [user, merchant] = await Promise.all([
      User.findById(merchantId).lean(),
      Merchant.findOne({ userId: merchantId }).lean(),
    ]);

    if (!user || !merchant) {
      return res
        .status(404)
        .json({ success: false, message: "Merchant not found" });
    }

    /* ===================== BCRYPT ===================== */
    const passwordMatch = await bcrypt.compare(decoded.password, user.password);
    if (!passwordMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid merchant token",
      });
    }

    if (user.transactionLimit) {
      const dateFilter = todayFilter();
      // console.log(dateFilter, user._id, user.transactionLimit);
      const [payinCount, payoutCount] = await Promise.all([
        Transaction.countDocuments({ merchantId: user._id, ...dateFilter }),
        PayoutTransaction.countDocuments({
          merchantId: user._id,
          ...dateFilter,
        }),
      ]);

      const totalTransactionsCount = payinCount + payoutCount;

      // console.log(totalTransactionsCount, "transaction Count");

      const used = Number(totalTransactionsCount);
      const limit = Number(user.transactionLimit || 0);

      if (used >= limit) {
        return res.status(403).json({
          success: false,
          message: "Transaction limit has been exceeded for today!",
        });
      }
    }

    const merchantName =
      user.company || user?.firstname + " " + (user?.lastname || "");

    const transactionId = generateDynamicQRTransactionId();
    // const txnRefId = transactionId; // Use same as transactionId for Enpay
    const merchantOrderId = `ORDER${Date.now()}`;

    if (!Object.keys(req.body).length) {
      return res.status(403).json({
        success: false,
        message: "Request body is empty.",
      });
    }

    const { txnRefId, amount, txnNote = "" } = req.body;

    const transactionData = {
      transactionId,
      merchantId: merchantId,
      merchantName,
      mid: user.mid || "",
      amount: amount ? parseFloat(amount) : null,
      status: "INITIATED",
      previousStatus: "INITIATED",
      payInApplied: false,
      txnNote,
      gatewayTransactionId: transactionId,
      paymentMethod: "UPI",
      merchantOrderId,
      txnRefId,
      netAmount: amount ? parseFloat(amount) : 0,
      transactionType: "QR",
    };

    // console.log("📊 Transaction data prepared:", transactionData);

    savedTransaction = await Transaction.create(transactionData);

    await TransactionsLog.create({
      merchantId: user._id,
      referenceType: "PAYIN",
      referenceId: savedTransaction._id,
      referenceNo: savedTransaction.transactionId,
      referenceTxnId: txnRefId,
      description: "Dynamic QR generated",
      debit: 0,
      credit: 0, // no money yet
      balance: merchant.availableBalance,
      status: "INITIATED",
      source: "API",
      txnInitiatedDate: new Date(),
    });

    /* ===================== VALIDATION ===================== */

    if (!txnRefId) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "TxnRefId cannot be blank"
      );
      return res.status(400).json({
        success: false,
        message: "TxnRefId cannot be blank",
      });
    }

    const [existingTxnRefId] = await Promise.all([
      Transaction.findOne({
        txnRefId,
        _id: { $ne: savedTransaction._id },
      }).lean(),
    ]);

    // console.log(existingTxnRefId, savedTransaction._id);
    if (existingTxnRefId) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "TxnRefId already exists"
      );
      return res
        .status(400)
        .json({ success: false, message: "TxnRefId already exists" });
    }

    if (!amount) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "Amount cannot be blank"
      );
      return res.status(400).json({
        success: false,
        message: "Amount cannot be blank",
      });
    }

    const amountNum = Number(amount);

    if (isNaN(amountNum) || amountNum < 500) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "Amount must be a number and greater than or equal to 500"
      );
      return res.status(400).json({
        success: false,
        message: "Amount must be a number and greater than or equal to 500",
      });
    }

    // ✅ Step 1: Get Merchant Connector
    // console.log("🟡 Step 1: Getting merchant connector...");
    const merchantConnectorAccount = await getMerchantConnectorAccount(
      merchantId
    );

    if (!merchantConnectorAccount) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "No payment connector configured. Please contact admin."
      );
      // console.log("❌ No connector account found for merchant");
      return res.status(400).json({
        success: false,
        message: "No payment connector configured. Please contact admin.",
        needsSetup: true,
      });
    }

    // console.log(
    //   "✅ Merchant connector found:",
    //   merchantConnectorAccount.connectorAccDetails.name
    // );

    const connectorName =
      merchantConnectorAccount.connectorDetails?.name.toLowerCase();

    const connectorMeta = {
      // Connector Info
      connectorUsed: connectorName,
      connectorName: connectorName,
      connectorAccountId: merchantConnectorAccount.connectorAccDetails._id,
      connectorId: merchantConnectorAccount.connectorDetails._id,
      terminalId: merchantConnectorAccount.terminalId,
      merchantHashId:
        merchantConnectorAccount.connectorAccDetails.integrationKeys
          ?.merchantHashId || "",

      // Payment Info
      paymentGateway: connectorName,
      source: connectorName,
      updatedAt: new Date(),
    };

    await Transaction.findByIdAndUpdate(savedTransaction._id, connectorMeta);

    await TransactionsLog.findOneAndUpdate(
      {
        referenceType: "PAYIN",
        referenceId: savedTransaction._id,
      },
      {
        $set: {
          connector: {
            name: connectorName,
            connectorId: merchantConnectorAccount.connectorDetails._id,
            connectorAccountId:
              merchantConnectorAccount.connectorAccDetails._id,
            gatewayRefId: txnRefId,
          },
          updatedAt: new Date(),
        },
      }
    );

    let qrResult;
    if (connectorName === "cashfree") {
      try {
        qrResult = await generateCashfreeQR(
          transactionData,
          merchant,
          merchantConnectorAccount.connectorAccDetails.integrationKeys
        );

        // console.log(qrResult);

        const updateData = {
          qrCode: qrResult.qrCode,
          paymentUrl: qrResult.paymentUrl,
          cfOrderId: qrResult.cfOrderId,
          cfResponse: qrResult.rawResponse,
          cfTransactionStatus: "CREATED",
          cfInitiationStatus: "CASHFREE_CREATED",
          updatedAt: new Date(),
        };

        if (qrResult.cashfreeTransactionCreated) {
          updateData.status = "INITIATED";
          updateData.gatewayTransactionId = qrResult.cfOrderId;
        }

        await Transaction.findByIdAndUpdate(savedTransaction._id, updateData);
      } catch (error) {
        console.error(error, "Cashfree error");
        await failTransaction(savedTransaction._id, merchantId, error, {
          connector: connectorName,
          transactionStatusField: "cfTransactionStatus",
          initiationStatusField: "cfInitiationStatus",
        });
        return res.status(502).json({
          success: false,
          message: error.message || "Cashfree QR generation failed",
        });
      }
    } else if (connectorName === "enpay") {
      try {
        qrResult = await generateEnpayQR(
          transactionData,
          merchantConnectorAccount.connectorAccDetails.integrationKeys
        );

        const updateData = {
          qrCode: qrResult.qrData,
          paymentUrl: qrResult.paymentUrl,
          enpayTxnId: qrResult.enpayTxnId,
          enpayQrCode: qrResult.qrData,
          enpayResponse: qrResult.enpayResponse,
          enpayTransactionStatus: "CREATED",
          enpayInitiationStatus: "ENPAY_CREATED",
          updatedAt: new Date(),
        };

        if (qrResult.enpayTransactionCreated) {
          updateData.status = "INITIATED";
          updateData.gatewayTransactionId = qrResult.enpayTxnId;
        }

        await Transaction.findByIdAndUpdate(savedTransaction._id, updateData);
      } catch (error) {
        console.error(error, "Enpay error");
        await failTransaction(savedTransaction._id, merchantId, error, {
          connector: connectorName,
          transactionStatusField: "enpayTransactionStatus",
          initiationStatusField: "enpayInitiationStatus",
        });
        if (error.message === "Duplicate transaction reference Id.") {
          return res.status(400).json({
            success: false,
            message: "txnRefId already exists.",
          });
        }
        return res.status(502).json({
          success: false,
          message: error.message || "Enpay QR generation failed",
        });
      }
    } else if (connectorName === "razorpay") {
      try {
        qrResult = await generateRazorpayQR(
          transactionData,
          merchantConnectorAccount.connectorAccDetails.integrationKeys
        );

        const updateData = {
          qrCode: qrResult.qrCode,
          paymentUrl: qrResult.paymentUrl,
          txnRefId: qrResult.razorPayTxnId,
          razorPayTxnId: qrResult.razorPayTxnId,
          razorPayResponse: qrResult.rawResponse,
          razorPayTransactionStatus: "CREATED",
          razorPayInitiationStatus: "RAZORPAY_CREATED",
          updatedAt: new Date(),
        };

        if (qrResult.razorpayTransactionCreated) {
          updateData.status = "INITIATED";
          updateData.gatewayTransactionId = qrResult.razorPayTxnId;
        }

        await Transaction.findByIdAndUpdate(savedTransaction._id, updateData);
      } catch (error) {
        console.error(error, "Razorpay error");
        await failTransaction(savedTransaction._id, merchantId, error, {
          connector: connectorName,
          transactionStatusField: "razorPayTransactionStatus",
          initiationStatusField: "razorPayInitiationStatus",
        });
        return res.status(502).json({
          success: false,
          message: error.message || "Razorpay QR generation failed",
        });
      }
    } else {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        `Unsupported connector: ${connectorName}`
      );
      return res.status(400).json({
        success: false,
        message: `Unsupported connector: ${connectorName}`,
      });
    }

    await Merchant.findOneAndUpdate(
      { userId: user._id },
      { lastPayinTransactions: savedTransaction._id }
    ).catch(console.error);

    // Fetch updated transaction
    const updatedTransaction = await Transaction.findById(
      savedTransaction._id
    ).lean();

    await TransactionsLog.updateOne(
      { referenceId: savedTransaction._id },
      {
        $set: {
          "connector.gatewayTransactionId":
            updatedTransaction.gatewayTransactionId,
          "connector.gatewayOrderId": updatedTransaction.merchantOrderId,
          updatedAt: new Date(),
        },
      }
    );

    const responseData = {
      success: true,
      txnRefId: updatedTransaction.txnRefId,
      qrCode: updatedTransaction.qrCode,
      paymentUrl: updatedTransaction.paymentUrl,
      amount: updatedTransaction.amount,
      status: updatedTransaction.status,
      message: "Dynamic QR generated successfully",
    };

    // console.log("✅ Response prepared:", responseData.success);
    console.log("🚀 ========== GENERATE DYNAMIC QR COMPLETED ==========");

    return res.status(200).json(responseData);
  } catch (error) {
    console.error("❌ GENERATE QR ERROR:", error);

    // Update transaction status if it exists
    if (savedTransaction?._id) {
      await failTransaction(
        savedTransaction._id,
        savedTransaction.merchantId,
        error || "Internal Server Error."
      );
    }
    return res.status(500).json({
      success: false,
      message: "Failed to generate dynamic QR",
      details: error.response?.data || error.message || null,
    });
  }
};

// ✅ GET MERCHANT CONNECTOR - FIXED
export const getMerchantConnector = async (req, res) => {
  try {
    const merchantId = req.user.id;
    // console.log("🟡 Fetching connector for merchant:", merchantId);

    const connectorAccountRes = await getMerchantConnectorAccount(merchantId);
    const connectorAccount = connectorAccountRes.connectorAccDetails;
    // console.log(connectorAccount, "Connector Details");
    if (connectorAccount) {
      const integrationKeys = connectorAccount.integrationKeys || {};

      res.json({
        success: true,
        connectorAccount: {
          _id: connectorAccount._id,
          connectorId: connectorAccount.connectorId,
          connectorName: connectorAccount.name,
          connectorType: "UPI",
          terminalId: connectorAccountRes.terminalId,
          status: connectorAccount.status,
          hasIntegrationKeys: Object.keys(integrationKeys).length > 0,
          availableKeys: Object.keys(integrationKeys),
          merchantHashId: integrationKeys.merchantHashId,
          // Include actual credentials (masked) for debugging
          X_Merchant_Key: integrationKeys["X-Merchant-Key"]
            ? "***" + integrationKeys["X-Merchant-Key"].slice(-4)
            : null,
          merchantHashId_full: integrationKeys.merchantHashId,
        },
        message: "Enpay connector found",
      });
    } else {
      res.json({
        success: false,
        message: "No active Enpay connector found",
        needsSetup: true,
      });
    }
  } catch (error) {
    console.error("❌ Get Merchant Connector Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch connector",
      error: error.message,
    });
  }
};

// ✅ GET TRANSACTIONS - FIXED
export const getTransactions = async (req, res) => {
  try {
    const merchantId = req.user.id;
    // console.log("🟡 Fetching transactions for merchant:", merchantId);

    // Handle both string and ObjectId merchantId
    let query = { merchantId: merchantId };

    try {
      query.merchantId = new mongoose.Types.ObjectId(merchantId);
    } catch (error) {
      console.log("⚠️ Using string merchantId for query");
    }

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // console.log(`✅ Found ${transactions.length} transactions`);

    // Format response
    const formattedTransactions = transactions.map((txn) => ({
      _id: txn._id,
      transactionId: txn.transactionId,
      transactionRefId: txn.txnRefId || txn.transactionId,
      amount: txn.amount,
      status: txn.status,
      settlementStatus: txn.settlementStatus || "",
      createdAt: txn.createdAt,
      updatedAt: txn.updatedAt,
      merchantName: txn.merchantName,
      customerName: txn.customerName,
      customerVpa: txn.customerVpa,
      customerEmail: txn.customerEmail,
      customerContact: txn.customerContact,
      commissionAmount: txn.commissionAmount || 0,
      netAmount: txn.netAmount || txn.amount || 0,
      paymentMethod: txn.paymentMethod || "",
      qrCode: txn.qrCode,
      paymentUrl: txn.paymentUrl,
      connectorUsed: txn.connectorUsed,
      enpayTxnId: txn.enpayTxnId,
      merchantHashId: txn.merchantHashId,
      enpayInitiationStatus: txn.enpayInitiationStatus,
      // isEnpayTransaction: txn.isEnpayTransaction,
      webhookStatus: txn.webhookStatus,
      merchantOrderId: txn.merchantOrderId,
      gatewayOrderId: txn.gatewayOrderId,
    }));

    res.json(formattedTransactions);
  } catch (error) {
    console.error("❌ Error fetching transactions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transactions",
      error: error.message,
    });
  }
};

export const getSalesTransactions = async (req, res) => {
  try {
    const merchantId = req.user.id;
    // console.log("🟡 Fetching transactions for merchant:", merchantId);
    // console.log(req.query);
    const { transactionRefId, fromDate, toDate } = req.query;

    // Handle both string and ObjectId merchantId
    let query = { merchantId: merchantId };

    if (transactionRefId) {
      query.txnRefId = new RegExp(transactionRefId, "i");
    }

    if (fromDate && toDate) {
      const from = new Date(fromDate);
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999); // include the entire end day

      if (!isNaN(from.getTime()) && !isNaN(to.getTime())) {
        query.createdAt = { $gte: from, $lte: to };
      }
    }
    // console.log(query, "QUERY");

    try {
      query.merchantId = new mongoose.Types.ObjectId(merchantId);
    } catch (error) {
      console.log("⚠️ Using string merchantId for query");
    }

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // console.log(`✅ Found ${transactions.length} transactions`);

    // Format response
    const formattedTransactions = transactions.map((txn) => ({
      _id: txn._id,
      transactionId: txn.transactionId,
      transactionRefId: txn.txnRefId || txn.transactionId,
      amount: txn.amount,
      netAmount: txn.netAmount || txn.amount || 0,
      paymentMethod: txn.paymentMethod || "",
      customerName: txn.customerName,
      customerVpa: txn.customerVpa,
      customerEmail: txn.customerEmail,
      customerContact: txn.customerContact,
      createdAt: txn.createdAt,
    }));

    res.json(formattedTransactions);
  } catch (error) {
    console.error("❌ Error fetching transactions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transactions",
      error: error.message,
    });
  }
};

export const exportSalesToExcel = async (req, res) => {
  try {
    const merchantId = req.user.id;
    console.log("🟡 Fetching transactions for merchant:");
    // console.log(req.query);
    const { transactionRefId, fromDate, toDate } = req.query;

    // Handle both string and ObjectId merchantId
    let query = { merchantId: merchantId };

    if (transactionRefId) {
      query.txnRefId = new RegExp(transactionRefId, "i");
    }

    if (fromDate && toDate) {
      const from = new Date(fromDate);
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);

      if (!isNaN(from.getTime()) && !isNaN(to.getTime())) {
        query.createdAt = { $gte: from, $lte: to };
      }
    }
    // console.log(query, "QUERY");

    try {
      query.merchantId = new mongoose.Types.ObjectId(merchantId);
    } catch (error) {
      console.log("⚠️ Using string merchantId for query");
    }

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // console.log(`✅ Found ${transactions.length} transactions`);

    // DEFINE HEADERS
    const headers = [
      "Sr No.",
      "Transaction Date",
      "Transaction Ref ID",
      "Amount",
      "Net Amount",
      "Payment Method",
      "Customer Name",
      "Customer Email",
      "Customer VPA",
      "Customer Contact",
    ];

    // PREPARE ROWS
    let excelRows = transactions.map((t, i) => [
      i + 1,
      t.createdAt ? formatDateForExcel(t.createdAt) : "",
      t.txnRefId || "",
      t.amount || "",
      t.netAmount || "",
      t.paymentMethod || "",
      t.customerName || "",
      t.customerEmail || "",
      t.customerVpa || "",
      t.customerContact || "",
    ]);
    // Final sheet data (headers + rows)
    const finalSheetData = [headers, ...excelRows];

    // CREATE WORKBOOK
    const worksheet = xlsx.utils.aoa_to_sheet(finalSheetData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Sales");

    // Random 10-digit number
    const randomNumber = Math.floor(1000000000 + Math.random() * 9000000000);
    const fileName = `Sales_${randomNumber}.xlsx`;

    // Write to buffer
    const excelBuffer = xlsx.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.send(excelBuffer);
  } catch (error) {
    console.error("DOWNLOAD SALES EXCEL ERROR:", error);
    res.status(500).json({ message: "Failed to download Excel" });
  }
};

export const generateDefaultQR = async (req, res) => {
  console.log("🔵 ========== GENERATE DEFAULT/STATIC QR STARTED ==========");
  // console.log("🟡 Merchant ID:", req.user?.id);
  let savedTransaction = null;

  try {
    const merchantId = req.user?.id || req.user?._id;

    if (!merchantId) {
      return res.status(400).json({
        success: false,
        message: "Merchant ID not found",
      });
    }

    const [user, merchant] = await Promise.all([
      User.findById(merchantId).lean(),
      Merchant.findOne({ userId: merchantId }).lean(),
    ]);

    if (!user || !merchant) {
      return res
        .status(404)
        .json({ success: false, message: "Merchant not found" });
    }

    if (user.transactionLimit) {
      const dateFilter = todayFilter();
      // console.log(dateFilter, user._id, user.transactionLimit);
      const [payinCount, payoutCount] = await Promise.all([
        Transaction.countDocuments({ merchantId, ...dateFilter }),
        PayoutTransaction.countDocuments({
          merchantId,
          ...dateFilter,
        }),
      ]);

      const totalTransactionsCount = payinCount + payoutCount;

      // console.log(totalTransactionsCount, "transaction Count");

      const used = Number(totalTransactionsCount);
      const limit = Number(user.transactionLimit || 0);

      if (used >= limit) {
        return res.status(403).json({
          success: false,
          message: "Transaction limit has been exceeded for today!",
        });
      }
    }

    const merchantName =
      user.company || user?.firstname + " " + (user?.lastname || "");

    const transactionId = `STATIC${Date.now()}`;
    const txnRefId = transactionId;
    const merchantOrderId = `ORDER${Date.now()}`;

    const transactionData = {
      transactionId,
      merchantId,
      merchantName,
      mid: req.user.mid || "",
      amount: null, // ✅ NULL for static QR (no amount)
      status: "INITIATED",
      previousStatus: "INITIATED",
      payInApplied: false,
      txnNote: "Static QR Payment",
      isStaticQR: true, // ✅ Mark as static QR
      isDefaultQR: true,
      gatewayTransactionId: transactionId,
      paymentMethod: "UPI",
      txnRefId,
      merchantOrderId,
      transactionType: "QR",
    };

    savedTransaction = await Transaction.create(transactionData);

    await TransactionsLog.create({
      merchantId: user._id,
      referenceType: "PAYIN",
      referenceId: savedTransaction._id,
      referenceNo: savedTransaction.transactionId,
      referenceTxnId: txnRefId,
      description: "Static QR generated",
      debit: 0,
      credit: 0, // no money yet
      balance: merchant.availableBalance,
      status: "INITIATED",
      source: "API",
      txnInitiatedDate: new Date(),
    });

    // Get merchant connector
    const merchantConnectorAccount = await getMerchantConnectorAccount(
      merchantId
    );

    if (!merchantConnectorAccount) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "No payment connector configured. Please contact admin."
      );
      // console.log("❌ No connector account found for merchant");
      return res.status(400).json({
        success: false,
        message: "No payment connector configured. Please contact admin.",
        needsSetup: true,
      });
    }

    // console.log(
    //   "✅ Merchant connector found for static QR:",
    //   merchantConnectorAccount.connectorDetails.name
    // );

    const connectorName =
      merchantConnectorAccount.connectorDetails?.name.toLowerCase();

    // console.log("📝 Generated IDs:", {
    //   transactionId,
    //   txnRefId,
    //   merchantOrderId,
    // });

    const connectorMeta = {
      // Enpay info
      connectorUsed: connectorName,
      connectorName: connectorName,
      connectorAccountId: merchantConnectorAccount.connectorAccDetails._id,
      connectorId: merchantConnectorAccount.connectorDetails._id,
      terminalId: merchantConnectorAccount.terminalId,
      merchantHashId:
        merchantConnectorAccount.connectorAccDetails.integrationKeys
          ?.merchantHashId || "",

      // Payment info
      paymentGateway: connectorName,
      source: connectorName,
      updatedAt: new Date(),
    };

    await Transaction.findByIdAndUpdate(savedTransaction._id, connectorMeta);

    await TransactionsLog.findOneAndUpdate(
      {
        referenceType: "PAYIN",
        referenceId: savedTransaction._id,
      },
      {
        $set: {
          connector: {
            name: connectorName,
            connectorId: merchantConnectorAccount.connectorDetails._id,
            connectorAccountId:
              merchantConnectorAccount.connectorAccDetails._id,
            gatewayRefId: txnRefId,
          },
          updatedAt: new Date(),
        },
      }
    );

    let qrResult;
    if (connectorName === "cashfree") {
      try {
        qrResult = await generateCashfreeQR(
          transactionData,
          merchant,
          merchantConnectorAccount.connectorAccDetails.integrationKeys
        );

        // console.log(qrResult);

        const updateData = {
          qrCode: qrResult.qrCode,
          paymentUrl: qrResult.paymentUrl,
          cfOrderId: qrResult.cfOrderId,
          cfResponse: qrResult.rawResponse,
          cfTransactionStatus: "CREATED",
          cfInitiationStatus: "CASHFREE_CREATED",
          updatedAt: new Date(),
        };

        if (qrResult.cashfreeTransactionCreated) {
          updateData.status = "INITIATED";
          updateData.gatewayTransactionId = qrResult.cfOrderId;
        }

        await Transaction.findByIdAndUpdate(savedTransaction._id, updateData);
      } catch (error) {
        console.error(error, "Cashfree error");
        await failTransaction(savedTransaction._id, merchantId, error, {
          connector: connectorName,
          transactionStatusField: "cfTransactionStatus",
          initiationStatusField: "cfInitiationStatus",
        });
        return res.status(502).json({
          success: false,
          message: error.message || "Cashfree QR generation failed",
        });
      }
    } else if (connectorName === "enpay") {
      try {
        qrResult = await generateEnpayQR(
          transactionData,
          merchantConnectorAccount.connectorAccDetails.integrationKeys
        );

        const updateData = {
          qrCode: qrResult.qrData,
          paymentUrl: qrResult.paymentUrl,
          enpayTxnId: qrResult.enpayTxnId,
          enpayQrCode: qrResult.qrData,
          enpayResponse: qrResult.enpayResponse,
          enpayTransactionStatus: "CREATED",
          enpayInitiationStatus: "ENPAY_CREATED",
          updatedAt: new Date(),
        };

        if (qrResult.enpayTransactionCreated) {
          updateData.status = "INITIATED";
          updateData.gatewayTransactionId = qrResult.enpayTxnId;
        }

        await Transaction.findByIdAndUpdate(savedTransaction._id, updateData);
      } catch (error) {
        console.error(error, "Enpay error");
        await failTransaction(savedTransaction._id, merchantId, error, {
          connector: connectorName,
          transactionStatusField: "enpayTransactionStatus",
          initiationStatusField: "enpayInitiationStatus",
        });
        if (error.message === "Duplicate transaction reference Id.") {
          return res.status(400).json({
            success: false,
            message: "txnRefId already exists.",
          });
        }
        return res.status(502).json({
          success: false,
          message: error.message || "Enpay QR generation failed",
        });
      }
    } else if (connectorName === "razorpay") {
      try {
        qrResult = await generateRazorpayQR(
          transactionData,
          merchantConnectorAccount.connectorAccDetails.integrationKeys
        );

        const updateData = {
          qrCode: qrResult.qrCode,
          paymentUrl: qrResult.paymentUrl,
          txnRefId: qrResult.razorPayTxnId,
          razorPayTxnId: qrResult.razorPayTxnId,
          razorPayResponse: qrResult.rawResponse,
          razorPayTransactionStatus: "CREATED",
          razorPayInitiationStatus: "RAZORPAY_CREATED",
          updatedAt: new Date(),
        };

        if (qrResult.razorpayTransactionCreated) {
          updateData.status = "INITIATED";
          updateData.gatewayTransactionId = qrResult.razorPayTxnId;
        }

        await Transaction.findByIdAndUpdate(savedTransaction._id, updateData);
      } catch (error) {
        console.error(error, "Razorpay error");
        await failTransaction(savedTransaction._id, merchantId, error, {
          connector: connectorName,
          transactionStatusField: "razorPayTransactionStatus",
          initiationStatusField: "razorPayInitiationStatus",
        });
        return res.status(502).json({
          success: false,
          message: error.message || "Razorpay QR generation failed",
        });
      }
    } else {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        `Unsupported connector: ${connectorName}`
      );
      return res.status(400).json({
        success: false,
        message: `Unsupported connector: ${connectorName}`,
      });
    }

    await Merchant.findOneAndUpdate(
      { userId: user._id },
      { lastPayinTransactions: savedTransaction._id }
    ).catch(console.error);

    const updatedTransaction = await Transaction.findById(
      savedTransaction._id
    ).lean();

    await TransactionsLog.updateOne(
      { referenceId: savedTransaction._id },
      {
        $set: {
          "connector.gatewayTransactionId":
            updatedTransaction.gatewayTransactionId,
          "connector.gatewayOrderId": updatedTransaction.merchantOrderId,
          updatedAt: new Date(),
        },
      }
    );

    console.log("✅ Static QR generated successfully");

    res.status(200).json({
      success: true,
      transactionId: updatedTransaction.transactionId,
      qrCode: updatedTransaction.qrCode,
      paymentUrl: updatedTransaction.paymentUrl,
      status: updatedTransaction.status,
      connector: updatedTransaction.connectorName,
      isStatic: true,
      isDefault: true,
      message: "Static QR generated successfully",
      note: "Scan this QR code and enter any amount in your UPI app",
    });
  } catch (error) {
    console.error("❌ Generate Static QR Error:", error);

    // Update transaction status if it exists
    if (savedTransaction?._id) {
      await failTransaction(
        savedTransaction._id,
        savedTransaction.merchantId,
        error || "Internal Server Error."
      );
    }

    res.status(500).json({
      success: false,
      message: "Failed to generate static QR",
      error: error.message,
      details: error.response?.data || error.message || null,
      connector: savedTransaction.connectorName,
    });
  }
};

export const generateDefaultQRTransaction = async (req, res) => {
  console.log("🔵 ========== GENERATE DEFAULT/STATIC QR STARTED ==========");
  // console.log(req.body);
  let savedTransaction = null;

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided" });
    }

    let decoded;

    try {
      decoded = jwt.verify(
        authHeader.split(" ")[1],
        process.env.JWT_SECRET || "mysecretkey"
      );
    } catch (err) {
      return res.status(401).json({
        success: false,
        message:
          err.name === "TokenExpiredError"
            ? "Token expired"
            : "Invalid authorization token",
      });
    }
    // console.log("Decoded payload:", decoded);

    const merchantId = new mongoose.Types.ObjectId(decoded.userId);

    const [user, merchant] = await Promise.all([
      User.findById(merchantId).lean(),
      Merchant.findOne({ userId: merchantId }).lean(),
    ]);

    if (!user || !merchant) {
      return res
        .status(404)
        .json({ success: false, message: "Merchant not found" });
    }

    /* ===================== BCRYPT ===================== */
    const passwordMatch = await bcrypt.compare(decoded.password, user.password);
    if (!passwordMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid merchant token",
      });
    }

    if (user.transactionLimit) {
      const dateFilter = todayFilter();
      // console.log(dateFilter, user._id, user.transactionLimit);
      const [payinCount, payoutCount] = await Promise.all([
        Transaction.countDocuments({ merchantId: user._id, ...dateFilter }),
        PayoutTransaction.countDocuments({
          merchantId: user._id,
          ...dateFilter,
        }),
      ]);

      const totalTransactionsCount = payinCount + payoutCount;

      // console.log(totalTransactionsCount, "transaction Count");

      const used = Number(totalTransactionsCount);
      const limit = Number(user?.transactionLimit || 0);

      if (used >= limit) {
        return res.status(403).json({
          success: false,
          message: "Transaction limit has been exceeded for today!",
        });
      }
    }

    const merchantName =
      user.company || user?.firstname + " " + (user?.lastname || "");

    const transactionId = `STATIC${Date.now()}`;
    // const txnRefId = transactionId;
    const merchantOrderId = `ORDER${Date.now()}`;

    if (!Object.keys(req.body).length) {
      return res.status(403).json({
        success: false,
        message: "Request body is empty.",
      });
    }

    const { txnRefId, txnNote = "" } = req.body;

    // Create transaction
    const transactionData = {
      transactionId,
      merchantId: merchantId,
      merchantName,
      mid: user.mid || "",
      amount: null, // ✅ NULL for static QR (no amount)
      status: "INITIATED",
      previousStatus: "INITIATED",
      payInApplied: false,
      txnNote: txnNote || "",
      isStaticQR: true, // ✅ Mark as static QR
      isDefaultQR: true,
      gatewayTransactionId: transactionId,
      paymentMethod: "UPI",
      txnRefId,
      merchantOrderId,
      transactionType: "QR",
    };

    // console.log("📊 Static QR Transaction Data:", transactionData);

    savedTransaction = await Transaction.create(transactionData);

    await TransactionsLog.create({
      merchantId: user._id,
      referenceType: "PAYIN",
      referenceId: savedTransaction._id,
      referenceNo: savedTransaction.transactionId,
      referenceTxnId: txnRefId,
      description: "Static QR generated",
      debit: 0,
      credit: 0, // no money yet
      balance: merchant.availableBalance,
      status: "INITIATED",
      source: "API",
      txnInitiatedDate: new Date(),
    });

    /* ===================== VALIDATION ===================== */

    if (!txnRefId) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "TxnRefId cannot be blank"
      );
      return res.status(400).json({
        success: false,
        message: "TxnRefId cannot be blank",
      });
    }

    const [existingTxnRefId] = await Promise.all([
      Transaction.findOne({
        txnRefId,
        _id: { $ne: savedTransaction._id },
      }).lean(),
    ]);

    if (existingTxnRefId) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "TxnRefId already exists"
      );
      return res
        .status(400)
        .json({ success: false, message: "TxnRefId already exists" });
    }

    // Get merchant connector
    const merchantConnectorAccount = await getMerchantConnectorAccount(
      merchantId
    );

    if (!merchantConnectorAccount) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "No payment connector configured. Please contact admin."
      );
      // console.log("❌ No connector account found for merchant");
      return res.status(400).json({
        success: false,
        message: "No payment connector configured. Please contact admin.",
        needsSetup: true,
      });
    }

    // console.log(
    //   "✅ Merchant connector found for static QR:",
    //   merchantConnectorAccount.connectorAccDetails.name
    // );

    const connectorName =
      merchantConnectorAccount.connectorDetails?.name.toLowerCase();

    // Create transaction
    const connectorMeta = {
      // Enpay info
      connectorUsed: connectorName,
      connectorName: connectorName,
      connectorAccountId: merchantConnectorAccount.connectorAccDetails._id,
      connectorId: merchantConnectorAccount.connectorDetails._id,
      terminalId: merchantConnectorAccount.terminalId,
      merchantHashId:
        merchantConnectorAccount.connectorAccDetails.integrationKeys
          ?.merchantHashId || "",

      // Payment info
      paymentGateway: connectorName,
      source: connectorName,
      updatedAt: new Date(),
    };

    await Transaction.findByIdAndUpdate(savedTransaction._id, connectorMeta);

    await TransactionsLog.findOneAndUpdate(
      {
        referenceType: "PAYIN",
        referenceId: savedTransaction._id,
      },
      {
        $set: {
          connector: {
            name: connectorName,
            connectorId: merchantConnectorAccount.connectorDetails._id,
            connectorAccountId:
              merchantConnectorAccount.connectorAccDetails._id,
            gatewayRefId: txnRefId,
          },
          updatedAt: new Date(),
        },
      }
    );

    let qrResult;
    if (connectorName === "cashfree") {
      try {
        qrResult = await generateCashfreeQR(
          transactionData,
          merchant,
          merchantConnectorAccount.connectorAccDetails.integrationKeys
        );

        // console.log(qrResult);

        const updateData = {
          qrCode: qrResult.qrCode,
          paymentUrl: qrResult.paymentUrl,
          cfOrderId: qrResult.cfOrderId,
          cfResponse: qrResult.rawResponse,
          cfTransactionStatus: "CREATED",
          cfInitiationStatus: "CASHFREE_CREATED",
          updatedAt: new Date(),
        };

        if (qrResult.cashfreeTransactionCreated) {
          updateData.status = "INITIATED";
          updateData.gatewayTransactionId = qrResult.cfOrderId;
        }

        await Transaction.findByIdAndUpdate(savedTransaction._id, updateData);
      } catch (error) {
        console.error(error, "Cashfree error");
        await failTransaction(savedTransaction._id, merchantId, error, {
          connector: connectorName,
          transactionStatusField: "cfTransactionStatus",
          initiationStatusField: "cfInitiationStatus",
        });
        return res.status(502).json({
          success: false,
          message: error.message || "Cashfree QR generation failed",
        });
      }
    } else if (connectorName === "enpay") {
      try {
        qrResult = await generateEnpayQR(
          transactionData,
          merchantConnectorAccount.connectorAccDetails.integrationKeys
        );

        const updateData = {
          qrCode: qrResult.qrData,
          paymentUrl: qrResult.paymentUrl,
          enpayTxnId: qrResult.enpayTxnId,
          enpayQrCode: qrResult.qrData,
          enpayResponse: qrResult.enpayResponse,
          enpayTransactionStatus: "CREATED",
          enpayInitiationStatus: "ENPAY_CREATED",
          updatedAt: new Date(),
        };

        if (qrResult.enpayTransactionCreated) {
          updateData.status = "INITIATED";
          updateData.gatewayTransactionId = qrResult.enpayTxnId;
        }

        await Transaction.findByIdAndUpdate(savedTransaction._id, updateData);
      } catch (error) {
        console.error(error, "Enpay error");
        await failTransaction(savedTransaction._id, merchantId, error, {
          connector: connectorName,
          transactionStatusField: "enpayTransactionStatus",
          initiationStatusField: "enpayInitiationStatus",
        });
        if (error.message === "Duplicate transaction reference Id.") {
          return res.status(400).json({
            success: false,
            message: "txnRefId already exists.",
          });
        }
        return res.status(502).json({
          success: false,
          message: error.message || "Enpay QR generation failed",
        });
      }
    } else if (connectorName === "razorpay") {
      try {
        qrResult = await generateRazorpayQR(
          transactionData,
          merchantConnectorAccount.connectorAccDetails.integrationKeys
        );

        const updateData = {
          qrCode: qrResult.qrCode,
          paymentUrl: qrResult.paymentUrl,
          txnRefId: qrResult.razorPayTxnId,
          razorPayTxnId: qrResult.razorPayTxnId,
          razorPayResponse: qrResult.rawResponse,
          razorPayTransactionStatus: "CREATED",
          razorPayInitiationStatus: "RAZORPAY_CREATED",
          updatedAt: new Date(),
        };

        if (qrResult.razorpayTransactionCreated) {
          updateData.status = "INITIATED";
          updateData.gatewayTransactionId = qrResult.razorPayTxnId;
        }

        await Transaction.findByIdAndUpdate(savedTransaction._id, updateData);
      } catch (error) {
        console.error(error, "Razorpay error");
        await failTransaction(savedTransaction._id, merchantId, error, {
          connector: connectorName,
          transactionStatusField: "razorPayTransactionStatus",
          initiationStatusField: "razorPayInitiationStatus",
        });
        return res.status(502).json({
          success: false,
          message: error.message || "Razorpay QR generation failed",
        });
      }
    } else {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        `Unsupported connector: ${connectorName}`
      );
      return res.status(400).json({
        success: false,
        message: `Unsupported connector: ${connectorName}`,
      });
    }

    await Merchant.findOneAndUpdate(
      { userId: user._id },
      { lastPayinTransactions: savedTransaction._id }
    ).catch(console.error);

    const updatedTransaction = await Transaction.findById(
      savedTransaction._id
    ).lean();

    await TransactionsLog.updateOne(
      { referenceId: savedTransaction._id },
      {
        $set: {
          "connector.gatewayTransactionId":
            updatedTransaction.gatewayTransactionId,
          "connector.gatewayOrderId": updatedTransaction.merchantOrderId,
          updatedAt: new Date(),
        },
      }
    );

    console.log("✅ Static QR generated successfully");

    return res.status(200).json({
      success: true,
      txnRefId: updatedTransaction.txnRefId,
      qrCode: updatedTransaction.qrCode,
      paymentUrl: updatedTransaction.paymentUrl,
      status: updatedTransaction.status,
      message: "Static QR generated successfully",
      note: "Scan this QR code and enter any amount in your UPI app",
    });
  } catch (error) {
    console.error("❌ Generate Static QR Error:", error);
    // Update transaction status if it exists
    if (savedTransaction?._id) {
      await failTransaction(
        savedTransaction._id,
        savedTransaction.merchantId,
        error || "Internal Server Error."
      );
    }

    return res.status(500).json({
      success: false,
      message: "Failed to generate static QR",
      details: error.response?.data || error.message || null,
    });
  }
};

function generateMerchantOrderId() {
  return `ORDER${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

function generateShortId(length = 10) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function extractIntegrationKeys(connectorAccount) {
  // console.log("🔍 Extracting integration keys from:", {
  //   hasIntegrationKeys: !!connectorAccount?.integrationKeys,
  //   hasConnectorAccountId:
  //     !!connectorAccount?.connectorAccount?.integrationKeys,
  //   connectorAccount: connectorAccount?.connectorAccount?._id,
  // });

  let integrationKeys = {};

  // ✅ Check multiple possible locations for integration keys
  if (
    connectorAccount?.integrationKeys &&
    Object.keys(connectorAccount.integrationKeys).length > 0
  ) {
    // console.log("🎯 Found keys in connectorAccount.integrationKeys");
    integrationKeys = connectorAccount.integrationKeys;
  } else if (
    connectorAccount?.connectorAccount?.integrationKeys &&
    Object.keys(connectorAccount.connectorAccount.integrationKeys).length > 0
  ) {
    // console.log(
    //   "🎯 Found keys in connectorAccount.connectorAccount.integrationKeys"
    // );
    integrationKeys = connectorAccount.connectorAccount.integrationKeys;
  } else {
    console.log("⚠️ No integration keys found in standard locations");
  }

  // ✅ Convert if it's a Map or special object
  if (integrationKeys instanceof Map) {
    integrationKeys = Object.fromEntries(integrationKeys);
    // console.log("🔍 Converted Map to Object");
  } else if (typeof integrationKeys === "string") {
    try {
      integrationKeys = JSON.parse(integrationKeys);
      // console.log("🔍 Parsed JSON string to Object");
    } catch (e) {
      console.error("❌ Failed to parse integrationKeys string:", e);
    }
  }

  // console.log("🎯 Extracted Keys:", Object.keys(integrationKeys));
  return integrationKeys;
}

const generateEnpayPayment = async ({
  txnRefId,
  amount,
  paymentMethod,
  paymentOption,
  connectorAccount,
}) => {
  try {
    // console.log("🔹 Generating Enpay Payment");

    // 1. Get Keys (Calculated in main function)
    const keys = connectorAccount.extractedKeys || {};

    const merchantKey = keys["X-Merchant-Key"];
    const merchantSecret = keys["X-Merchant-Secret"];
    const merchantHashId = keys["merchantHashId"];
    const merchantVpa = keys["merchantVpa"];
    // const baseUrl = keys["baseUrl"];

    // 2. Validate Keys
    if (
      !merchantKey ||
      !merchantSecret ||
      !merchantHashId ||
      !merchantVpa
      //  || !baseUrl
    ) {
      console.error("❌ Missing Enpay Credentials. Found:", Object.keys(keys));
      throw new Error("No integration keys found for Enpay connector");
    }

    // 3. Prepare IDs
    // const txnRefId = generateTxnRefId();
    const merchantOrderId = generateMerchantOrderId();
    const enpayTxnId = `ENP${Date.now()}`;

    // 4. Construct Payload (MATCHING POSTMAN EXACTLY)
    const requestData = {
      amount: String(amount.toFixed(2)), // Ensure string format "600.00"
      merchantHashId: merchantHashId,
      merchantOrderId: merchantOrderId,
      merchantTrnId: txnRefId,
      // ✅ FIXED: Use the EXACT VPA from your working Postman example
      merchantVpa: merchantVpa, // HARDCODE THE WORKING VPA
      returnURL: `${API_BASE_URL}/api/payment/return?transactionId=${txnRefId}`,
      // returnURL: `https://api.thefoxes.in/payment/enpay/webhook/receiver`,
      successURL: `${API_BASE_URL}/api/payment/success?transactionId=${txnRefId}`,
      txnNote: `Payment for Order`,
    };

    // console.log("📤 Enpay Request Payload:", requestData);

    // 5. API Call
    const enpayResponse = await axios.post(
      "https://api.enpay.in/enpay-product-service/api/v1/merchant-gateway/initiateCollectRequest",
      requestData,
      {
        headers: {
          "Content-Type": "application/json",
          "X-Merchant-Key": merchantKey,
          "X-Merchant-Secret": merchantSecret,
          Accept: "application/json",
        },
        timeout: 30000,
      }
    );

    // console.log("✅ Enpay API Response:", enpayResponse.data);

    // 6. Extract Link
    let paymentLink = "";
    if (enpayResponse.data && enpayResponse.data.details) {
      paymentLink = enpayResponse.data.details;
    } else if (enpayResponse.data && enpayResponse.data.paymentUrl) {
      paymentLink = enpayResponse.data.paymentUrl;
    } else {
      throw new Error("Enpay API response missing payment URL/details");
    }

    return {
      paymentLink: paymentLink,
      merchantOrderId: merchantOrderId,
      txnRefId: txnRefId,
      gatewayTransactionId: enpayTxnId,
      enpayTxnId: enpayTxnId,
      enpayResponse,
    };
  } catch (error) {
    console.error("❌ Enpay Error:", error.message);
    if (error.response) {
      console.error("Enpay API Response Data:", error.response.data);
      throw { message: error.response.data?.message };
      // throw new Error(
      //   `Enpay Provider Error: ${
      //     error.response.data?.message || error.response.statusText
      //   }`
      // );
    }
    throw error;
  }
};

export const generateRazorpayPayment = async ({
  txnRefId,
  merchant,
  amount,
  paymentMethod,
  paymentOption,
  connectorAccount,
}) => {
  try {
    // console.log("🔹 Generating Razorpay Payment", merchant);

    const integrationKeys = connectorAccount.extractedKeys || {};

    const requiredKeys = ["key_id", "key_secret"];

    const missingKeys = requiredKeys.filter((key) => !integrationKeys[key]);

    if (missingKeys.length > 0) {
      console.error("Razorpay keys missing:", missingKeys);
      throw new Error(
        `Missing Razorpay credentials: ${missingKeys.join(", ")}`
      );
    }

    const razorpay = new Razorpay({
      key_id: integrationKeys.key_id,
      key_secret: integrationKeys.key_secret,
    });

    // const txnRefId = generateTxnRefId();
    const merchantOrderId = generateMerchantOrderId();
    const razorpayTxnId = `RAZ${Date.now()}`;

    const expireBy = Math.floor(Date.now() / 1000) + 16 * 60; // 3 minutes from now

    const paymentLinkPayload = {
      upi_link: "true",
      amount: Math.round(amount * 100), // paise
      currency: "INR",
      accept_partial: false,
      reference_id: txnRefId,
      description: `Payment for ${
        merchant.company || `${merchant.firstname} ${merchant.lastname || ""}`
      }`,
      expire_by: expireBy,
      customer: {
        name: `${merchant.firstname} ${merchant.lastname || ""}`,
        email: merchant.email || "",
        contact: merchant.contact || "",
      },

      notify: {
        sms: true,
        email: true,
      },

      reminder_enable: true,

      // callback_url: `${FRONTEND_BASE_URL}/payment/success?transactionId=${txnRefId}`,
      // callback_method: "get",
    };

    // console.log(paymentLinkPayload);
    const razorpayResponse = await razorpay.paymentLink.create(
      paymentLinkPayload
    );

    return {
      paymentLink: razorpayResponse.short_url,
      merchantOrderId,
      txnRefId,
      gatewayTransactionId: razorpayResponse.id,
      razorPayTxnId: razorpayResponse.id,
      razorPayResponse: razorpayResponse,
    };
  } catch (error) {
    console.error("❌ Razorpay payment link error:", error);

    throw {
      message:
        error?.error?.description ||
        error.message ||
        "Razorpay payment link generation failed",
    };
  }
};

export const generatePaymentLinkTransaction = async (req, res) => {
  // const startTime = Date.now();
  console.log("🚀 Generate PaymentLink STARTED");
  let savedTransaction = null;

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided" });
    }

    let decoded;
    try {
      decoded = jwt.verify(
        authHeader.split(" ")[1],
        process.env.JWT_SECRET || "mysecretkey"
      );
    } catch (err) {
      return res.status(401).json({
        success: false,
        message:
          err.name === "TokenExpiredError"
            ? "Token expired"
            : "Invalid authorization token",
      });
    }
    // console.log("Decoded payload:", decoded);

    const merchantId = new mongoose.Types.ObjectId(decoded.userId);

    const [user, merchant] = await Promise.all([
      User.findById(merchantId).lean(),
      Merchant.findOne({ userId: merchantId }).lean(),
    ]);

    if (!user || !merchant) {
      return res
        .status(404)
        .json({ success: false, message: "Merchant not found" });
    }

    /* ===================== BCRYPT ===================== */
    const passwordMatch = await bcrypt.compare(decoded.password, user.password);
    if (!passwordMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid merchant token",
      });
    }

    if (user.transactionLimit) {
      const dateFilter = todayFilter();
      // console.log(dateFilter, user._id, user.transactionLimit);
      const [payinCount, payoutCount] = await Promise.all([
        Transaction.countDocuments({ merchantId: user._id, ...dateFilter }),
        PayoutTransaction.countDocuments({
          merchantId: user._id,
          ...dateFilter,
        }),
      ]);

      const totalTransactionsCount = payinCount + payoutCount;

      // console.log(totalTransactionsCount, "transaction Count");

      const used = Number(totalTransactionsCount);
      const limit = Number(user?.transactionLimit || 0);

      if (used >= limit) {
        return res.status(403).json({
          success: false,
          message: "Transaction limit has been exceeded for today!",
        });
      }
    }

    const merchantName =
      user.company || user?.firstname + " " + (user?.lastname || "");

    if (!Object.keys(req.body).length) {
      return res.status(403).json({
        success: false,
        message: "Request body is empty.",
      });
    }

    const {
      txnRefId,
      amount,
      currency = "INR",
      paymentMethod,
      paymentOption,
    } = req.body;

    const transactionData = {
      transactionId: generateTransactionId(),
      txnRefId,
      shortLinkId: generateShortId(),

      merchantId: user._id,
      merchantName: merchantName,
      mid: user.mid,

      amount: amount,
      netAmount: amount,
      currency: currency,

      status: "INITIATED",
      previousStatus: "INITIATED",
      payInApplied: false,
      paymentMethod: paymentMethod,
      paymentOption: paymentOption,

      transactionType: "Link",
      customerName: `${user.firstname} ${user.lastname || ""}`,
      customerVpa: ``,
      customerContact: user.contact || "",
      customerEmail: user.email || "",

      txnNote: `Payment for ${user.company || user.firstname}`,
    };

    savedTransaction = await Transaction.create(transactionData);

    await TransactionsLog.create({
      merchantId: user._id,
      referenceType: "PAYIN",
      referenceId: savedTransaction._id,
      referenceNo: savedTransaction.transactionId,
      referenceTxnId: txnRefId,
      description: "Payment link generated",
      debit: 0,
      credit: 0, // no money yet
      balance: merchant.availableBalance,
      currency,
      status: "INITIATED",
      source: "API",
      txnInitiatedDate: new Date(),
    });

    /* ===================== VALIDATION ===================== */

    if (!txnRefId) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "TxnRefId cannot be blank"
      );
      return res.status(400).json({
        success: false,
        message: "TxnRefId cannot be blank",
      });
    }

    const [existingTxnRefId] = await Promise.all([
      Transaction.findOne({
        txnRefId,
        _id: { $ne: savedTransaction._id },
      }).lean(),
    ]);

    if (existingTxnRefId) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "TxnRefId already exists"
      );
      return res
        .status(400)
        .json({ success: false, message: "TxnRefId already exists" });
    }

    if (!amount) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "Amount cannot be blank"
      );
      return res.status(400).json({
        success: false,
        message: "Amount cannot be blank",
      });
    }

    const amountNum = Number(amount);

    if (isNaN(amountNum) || amountNum < 500) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "Amount must be a number and greater than or equal to 500"
      );
      return res.status(400).json({
        success: false,
        message: "Amount must be a number and greater than or equal to 500",
      });
    }

    // Find Active Connector Account
    const [activeAccount] = await mongoose.connection.db
      .collection("merchantconnectoraccounts")
      .aggregate([
        {
          $match: {
            merchantId,
            isPrimary: true,
            status: "Active",
          },
        },
        {
          $lookup: {
            from: "connectors",
            localField: "connectorId",
            foreignField: "_id",
            as: "connector",
          },
        },
        {
          $lookup: {
            from: "connectoraccounts",
            localField: "connectorAccountId",
            foreignField: "_id",
            as: "connectorAccount",
          },
        },
        { $unwind: "$connector" },
        { $unwind: "$connectorAccount" },
      ])
      .toArray();

    if (!activeAccount) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "No payment connector configured. Please contact admin."
      );
      // console.log("❌ No connector account found for merchant");
      return res.status(400).json({
        success: false,
        message: "No payment connector configured. Please contact admin.",
        needsSetup: true,
      });
    }

    // console.log("Connector:", activeAccount);
    const connectorName = activeAccount.connector?.name.toLowerCase();
    // console.log("🎯 Using Connector:", connectorName);

    // Extract keys using helper function
    const integrationKeys = extractIntegrationKeys(activeAccount);

    activeAccount.extractedKeys = integrationKeys;

    // Create transaction record
    const connectorMeta = {
      merchantHashId: integrationKeys.merchantHashId,
      merchantVpa: integrationKeys.merchantVpa,

      connectorName: connectorName,
      connectorUsed: connectorName,
      connectorAccountId: activeAccount.connectorAccount?._id,
      connectorId: activeAccount.connector?._id,
      terminalId: activeAccount.terminalId || "N/A",

      paymentGateway: connectorName,
      source: connectorName.toLowerCase(),
      updatedAt: new Date(),
    };

    // console.log(savedTransaction._id);

    await Transaction.findByIdAndUpdate(savedTransaction._id, connectorMeta);

    await TransactionsLog.findOneAndUpdate(
      {
        referenceType: "PAYIN",
        referenceId: savedTransaction._id,
      },
      {
        $set: {
          connector: {
            name: connectorName,
            connectorId: activeAccount.connector?._id,
            connectorAccountId: activeAccount.connectorAccount?._id,
            gatewayRefId: txnRefId,
          },
        },
      }
    );

    let paymentResult;

    if (connectorName === "cashfree") {
      paymentResult = await generateCashfreePayment({
        merchant,
        amount: amountNum,
        paymentMethod,
        paymentOption,
        connectorAccount: activeAccount,
      });
    } else if (connectorName === "enpay") {
      try {
        // console.log(`Enpay started:`);
        paymentResult = await generateEnpayPayment({
          txnRefId,
          amount: amountNum,
          paymentMethod,
          paymentOption,
          connectorAccount: activeAccount,
        });
      } catch (error) {
        // console.error(`❌ Enpay failed:`, error);

        await failTransaction(savedTransaction._id, merchantId, error, {
          connector: connectorName,
          transactionStatusField: "enpayTransactionStatus",
          initiationStatusField: "enpayInitiationStatus",
        });
        if (error.message === "Duplicate transaction reference Id.") {
          return res.status(400).json({
            success: false,
            message: "TxnRefId already exists.",
          });
        }
        return res.status(502).json({
          success: false,
          message: error.message || "Enpay QR generation failed",
        });
      }
    } else if (connectorName === "razorpay") {
      try {
        paymentResult = await generateRazorpayPayment({
          txnRefId,
          merchant,
          amount: amountNum,
          paymentMethod,
          paymentOption,
          connectorAccount: activeAccount,
        });
        // console.log(paymentResult);
      } catch (error) {
        // console.log(error, "asdasda");
        await failTransaction(savedTransaction._id, merchantId, error, {
          connector: connectorName,
          transactionStatusField: "razorPayTransactionStatus",
          initiationStatusField: "razorPayInitiationStatus",
        });
        return res.status(502).json({
          success: false,
          message: error.message || "Razorpay QR generation failed",
        });
      }
    } else {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        `Unsupported connector: ${connectorName}`
      );
      return res.status(400).json({
        success: false,
        message: `Unsupported connector: ${connectorName}`,
      });
    }

    if (!paymentResult) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "Payment gateway did not return a valid response"
      );
      return res.status(500).json({
        success: false,
        message: "Payment gateway did not return a valid response",
      });
    }

    const updateTransaction = {
      merchantOrderId: paymentResult.merchantOrderId,
      paymentUrl: paymentResult.paymentLink,
      gatewayTransactionId: paymentResult.gatewayTransactionId,
      gatewayPaymentLink: paymentResult.paymentLink,
      gatewayOrderId: paymentResult.gatewayOrderId,
      updatedAt: new Date(),
    };

    if (connectorName === "enpay") {
      updateTransaction.enpayTxnId = paymentResult.enpayTxnId;
      updateTransaction.enpayPaymentLink = paymentResult.paymentLink;
      updateTransaction.enpayResponse = paymentResult.enpayResponse?.data;
      updateTransaction.enpayTransactionStatus = "CREATED";
      updateTransaction.enpayInitiationStatus = "ENPAY_CREATED";
    } else if (connectorName === "razorpay") {
      updateTransaction.txnRefId = paymentResult.razorPayTxnId; //It is used to check the payment status
      updateTransaction.razorPayTxnId = paymentResult.txnRefId; //this is the Reference Id which is passed to generate Payment Link
      updateTransaction.razorPayPaymentLink = paymentResult.paymentLink;
      updateTransaction.razorPayResponse = paymentResult.razorPayResponse;
      updateTransaction.razorPayTransactionStatus = "CREATED";
      updateTransaction.razorPayInitiationStatus = "RAZORPAY_CREATED";
    }

    const [updatedTransac, updatedMerchant, updatedTransacLog] =
      await Promise.all([
        Transaction.findByIdAndUpdate(savedTransaction._id, updateTransaction, {
          new: true,
          lean: true,
        }),
        Merchant.findOneAndUpdate(
          { userId: user._id },
          { lastPayinTransactions: savedTransaction._id }
        ),
        TransactionsLog.findOneAndUpdate(
          {
            referenceType: "PAYIN",
            referenceId: savedTransaction._id,
          },
          {
            $set: {
              "connector.gatewayTransactionId":
                paymentResult.gatewayTransactionId,
              "connector.gatewayOrderId": paymentResult.gatewayOrderId,
            },
          }
        ),
      ]);

    // console.log(
    //   `✅ ${connectorName} payment link generated in ${
    //     Date.now() - startTime
    //   }ms`
    // );
    console.log("Payment Link Generated");

    return res.json({
      success: true,
      paymentLink: paymentResult.paymentLink,
      transactionId: updatedTransac.transactionId,
      txnRefId: updatedTransac.txnRefId,
      message: `Payment link generated successfully`,
    });
  } catch (error) {
    console.error(`❌ Payment link generation failed:`, error);
    if (savedTransaction?._id) {
      await failTransaction(
        savedTransaction._id,
        savedTransaction.merchantId,
        error || "Internal Server Error."
      );
    }
    return res.status(500).json({
      success: false,
      message: "Failed to generate payment link",
      details: error.response?.data || error.message || null,
    });
  }
};

// ✅ CREATE DEFAULT CONNECTOR - FIXED
export const createDefaultConnectorAccount = async (req, res) => {
  try {
    const merchantId = req.user.id;
    // console.log(
    //   "🟡 Creating default Enpay connector for merchant:",
    //   merchantId
    // );

    // Get merchant
    const merchant = await mongoose.connection.db
      .collection("merchants")
      .findOne({ _id: new mongoose.Types.ObjectId(merchantId) });

    if (!merchant) {
      return res.status(404).json({
        success: false,
        message: "Merchant not found",
      });
    }

    // Get Enpay connector
    const connector = await mongoose.connection.db
      .collection("connectors")
      .findOne({ name: "enpay", status: "Active" });

    if (!connector) {
      return res.status(404).json({
        success: false,
        message: "Enpay connector not available",
      });
    }

    // Create connector account with REAL credentials
    const connectorAccountData = {
      userId: new mongoose.Types.ObjectId(merchantId),
      connectorId: connector._id,
      name: connector.name,
      currency: "INR",
      status: "Active",
      terminalId: `TERM${Date.now()}`,
      integrationKeys: {
        "X-Merchant-Key": "0851439b-03df-4983-88d6-32399b1e4514", // Your actual key
        "X-Merchant-Secret": "bae97f533a594af9bf3dded47f09c34e15e053d1", // Your actual secret
        merchantHashId: "MERCDSH51Y7CD4YJLFIZR8NF", // Your actual hash ID
        baseUrl:
          "https://api.enpay.in/enpay-product-service/api/v1/merchant-gateway",
      },
      limits: {
        defaultCurrency: "INR",
        minTransactionAmount: 100,
        maxTransactionAmount: 10000,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await mongoose.connection.db
      .collection("merchantconnectoraccounts")
      .insertOne(connectorAccountData);

    // console.log("✅ Default Enpay connector created:", result.insertedId);

    res.json({
      success: true,
      message: "Enpay connector created successfully",
      connectorAccount: {
        connectorId: connector._id,
        connectorName: connector.name,
        terminalId: connectorAccountData.terminalId,
      },
    });
  } catch (error) {
    console.error("❌ Create Connector Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create connector",
      error: error.message,
    });
  }
};

// ✅ DEBUG ENDPOINT
export const debugEndpoint = async (req, res) => {
  try {
    const merchantId = req.user.id;

    const merchantConnector = await getMerchantConnectorAccount(merchantId);
    const transactionCount = await Transaction.countDocuments({
      merchantId: merchantId,
    });
    const latestTransaction = await Transaction.findOne({
      merchantId: merchantId,
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      merchantId,
      merchantConnector: merchantConnector
        ? {
            name: merchantConnector.name,
            hasIntegrationKeys: !!merchantConnector.integrationKeys,
            integrationKeys: merchantConnector.integrationKeys
              ? Object.keys(merchantConnector.integrationKeys)
              : [],
          }
        : null,
      transactionCount,
      latestTransaction: latestTransaction
        ? {
            transactionId: latestTransaction.transactionId,
            status: latestTransaction.status,
            amount: latestTransaction.amount,
            enpayInitiationStatus: latestTransaction.enpayInitiationStatus,
          }
        : null,
      message: "Debug information",
    });
  } catch (error) {
    console.error("❌ Debug Error:", error);
    res.status(500).json({
      success: false,
      message: "Debug failed",
      error: error.message,
    });
  }
};
