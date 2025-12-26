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

// Generate unique IDs
const generateTransactionId = () =>
  `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
const generateEnpayTransactionId = () =>
  `DYNAMIC${Date.now()}${Math.floor(Math.random() * 1000)}`;

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:5001";

const todayFilter = () => {
  const now = new Date();

  let start, end;
  start = new Date(now);
  start.setHours(0, 0, 0, 0);
  end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return {
    createdAt: {
      $gte: start,
      $lte: end,
    },
  };
};

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

const isJWTFormat = (token) => {
  if (typeof token !== "string") return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const base64UrlRegex = /^[A-Za-z0-9-_]+$/;

  // ✅ Validate HEADER & PAYLOAD only
  for (let i = 0; i < 2; i++) {
    const part = parts[i];

    if (!base64UrlRegex.test(part)) return false;

    try {
      // Convert Base64URL → Base64
      const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
      const decoded = JSON.parse(
        Buffer.from(base64, "base64").toString("utf8")
      );

      if (typeof decoded !== "object") return false;
    } catch {
      return false;
    }
  }

  // ✅ Signature: ONLY Base64URL check (NO JSON parse)
  if (!base64UrlRegex.test(parts[2])) return false;

  return true;
};

// Usage
// console.log(isJWTFormat("your.token.here")); // true or false

export const getMerchantConnectorAccount = async (merchantId) => {
  try {
    // console.log("🟡 Fetching merchant connector account for:", merchantId);

    let merchantObjectId;
    try {
      merchantObjectId = new mongoose.Types.ObjectId(merchantId);
    } catch (error) {
      // console.log("⚠️ Invalid merchantId, trying string:", merchantId);
      merchantObjectId = merchantId;
    }

    // ✅ FIX 1: Check BOTH possible field names
    let connectorAccount = await mongoose.connection.db
      .collection("merchantconnectoraccounts")
      .findOne({
        isPrimary: true,
        status: "Active",
        $or: [
          { userId: merchantObjectId, status: "Active" },
          { merchantId: merchantObjectId, status: "Active" },
        ],
      });

    if (connectorAccount?.connectorAccountId) {
      const connector = await mongoose.connection.db
        .collection("connectoraccounts")
        .findOne({
          _id: new mongoose.Types.ObjectId(connectorAccount.connectorAccountId),
        });

      connectorAccount.connectorAccDetails = connector;
    }

    if (connectorAccount?.connectorId) {
      const connectorDetails = await mongoose.connection.db
        .collection("connectors")
        .findOne({ _id: connectorAccount.connectorId });
      connectorAccount.connectorDetails = connectorDetails;
    }

    // if (connectorAccount.merchantId) {
    //   const merchant = await mongoose.connection.db
    //     .collection("merchants")
    //     .findOne({
    //       userId: new mongoose.Types.ObjectId(connectorAccount.merchantId),
    //     });

    //   connectorAccount.merchantDetails = merchant;
    // }

    if (connectorAccount) {
      // console.log("✅ Merchant Connector Account Found:", {
      //   connectorAccount,
      // });

      // ✅ FIX 2: Get integration keys from multiple possible sources
      const integrationKeys =
        connectorAccount.connectorAccDetails.integrationKeys ||
        connectorAccount.connectorAccDetails.integratedonKeys ||
        connectorAccount.connectorAccDetails.credentials ||
        {};

      return {
        ...connectorAccount,
        integrationKeys: integrationKeys || {},
      };
    }

    // console.log(
    //   "❌ No active connector account found for merchant:",
    //   merchantId
    // );
    return null;
  } catch (error) {
    console.error("❌ Error fetching merchant connector:", error);
    return null;
  }
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
    // const closeBy = Math.floor(Date.now() / 1000) + durationInMinutes * 60;

    // 4️⃣ Prepare payload (amount OR no amount)
    let payload = {
      type: "upi_qr",
      name: transactionData.merchantName,
      description: transactionData.txnNote || "",
      // customer_id: transactionData.txnRefId || "",
      // close_by: closeBy,
    };

    if (transactionData.amount) {
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
    console.error("❌ ENPAY API ERROR DETAILS:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      url: error.config?.url,
      headers: error.config?.headers,
    });

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
  const session = await mongoose.startSession();
  let savedTransaction = null;

  try {
    session.startTransaction();
    // ✅ FIX 1: Check if body exists
    if (!req.body) {
      console.error("❌ ERROR: req.body is undefined");
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Request body is required",
        error: "req.body is undefined",
      });
    }

    const { amount, txnNote = "" } = req.body;

    // ✅ FIX 2: Log the actual values
    // console.log("🟡 Parsed values:", {
    //   amount: amount,
    //   txnNote: txnNote,
    //   bodyType: typeof req.body,
    //   bodyKeys: Object.keys(req.body),
    // });
    if (!amount) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Amount cannot be blank",
      });
    }

    const merchantId = req.user?.id || req.user?._id;
    const merchantName = req.user?.firstname + " " + (req.user?.lastname || "");

    if (!merchantId) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Merchant ID not found",
      });
    }

    let user;
    if (merchantId)
      user = await User.findOne({ _id: merchantId }).session(session);

    if (!user) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "Merchnat Not found" });
    }

    const merchant = await Merchant.findOne({ userId: user._id }).session(
      session
    );
    // console.log(merchant);
    if (!merchant) {
      await session.abortTransaction();
      return res.status(500).json({
        success: false,
        message: "Merchant not found",
      });
    }

    const dateFilter = todayFilter();
    // console.log(dateFilter, user._id, user.transactionLimit);

    const transactionLimit = await Transaction.find({
      merchantId,
      ...dateFilter,
    }).session(session);

    // console.log(transactionLimit.length, "transactionLimit");

    const used = Number(transactionLimit?.length || 0);
    const limit = Number(user?.transactionLimit || 0);

    if (user.transactionLimit) {
      if (used >= limit) {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: "Transaction limit has been exceeded for today!",
        });
      }
    }

    // console.log("🟡 Generate Dynamic QR Request:", {
    //   merchantId,
    //   merchantName,
    //   amount,
    //   txnNote,
    // });

    const amountNum = parseFloat(amount);
    if (amountNum < 500) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Amount should be greater than 500",
      });
    }

    // ✅ Step 1: Get Merchant Connector
    // console.log("🟡 Step 1: Getting merchant connector...");
    const merchantConnectorAccount = await getMerchantConnectorAccount(
      merchantId
    );
    // console.log("🎯 Using Connector:", merchantConnectorAccount);

    if (!merchantConnectorAccount) {
      // console.log("❌ No connector account found for merchant");
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message:
          "No payment connector configured. Please set up a connector first.",
        needsSetup: true,
      });
    }

    // console.log(
    //   "✅ Merchant connector found:",
    //   merchantConnectorAccount.connectorDetails.name
    // );

    const connectorName =
      merchantConnectorAccount.connectorDetails?.name.toLowerCase();

    // ✅ Step 2: Generate Transaction IDs
    // console.log("🟡 Step 2: Generating transaction IDs...");
    const transactionId = generateEnpayTransactionId();
    const txnRefId = transactionId; // Use same as transactionId for Enpay
    const merchantOrderId = `ORDER${Date.now()}`;

    // console.log("📝 Generated IDs:", {
    //   transactionId,
    //   txnRefId,
    //   merchantOrderId,
    // });

    // ✅ Step 3: Create Transaction Object
    // console.log("🟡 Step 3: Creating transaction object...");
    const transactionData = {
      transactionId,
      merchantId,
      merchantName,
      mid: req.user.mid || "",
      amount: amountNum,
      status: "INITIATED",
      previousStatus: "INITIATED",
      payInApplied: false,
      txnNote,

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
      gatewayTransactionId: transactionId,
      paymentMethod: "UPI",
      merchantOrderId,
      txnRefId,
      netAmount: amount ? parseFloat(amount) : 0,
      transactionType: "QR",

      // UPI Info
      // upiId: `${merchantConnectorAccount.connectorAccDetails.integrationKeys?.merchantHashId}@enpay`,
      // merchantVpa: `${merchantConnectorAccount.connectorAccDetails.integrationKeys?.merchantVpa}`,

      // Settlement Info
      // commissionAmount: 0,
      // netAmount: amount ? parseFloat(amount) : 0,
      // settlementStatus: "UNSETTLED",
      // vendorRefId: `VENDOR${Date.now()}`,
    };

    // console.log("📊 Transaction data prepared:", transactionData);

    // ✅ Step 4: Save to Database FIRST
    // console.log("🟡 Step 4: Saving to database...");
    const transaction = new Transaction(transactionData);
    savedTransaction = await transaction.save({ session });

    // console.log("✅ Transaction saved in database:", {
    //   id: savedTransaction._id,
    //   transactionId: savedTransaction.transactionId,
    //   amount: savedTransaction.amount,
    // });

    // ✅ Step 5: Generate QR via Enpay
    // console.log(
    //   "🟡 Step 5: Calling Enpay API...",
    //   merchantConnectorAccount.connectorAccDetails
    // );
    // console.log({ amountNum, merchant, merchantOrderId });

    let qrResult;
    if (connectorName === "cashfree") {
      try {
        qrResult = await generateCashfreeQR(
          transactionData,
          merchant,
          merchantConnectorAccount.connectorAccDetails.integrationKeys
        );

        console.log(qrResult);
        // ✅ Step 6: Update Transaction with QR Data
        // console.log("🟡 Step 6: Updating transaction with QR data...", qrResult);

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

        await Transaction.findByIdAndUpdate(
          savedTransaction._id,
          updateData
        ).session(session);
      } catch (error) {
        console.log(error, "Cashfree error");
        await Transaction.findByIdAndUpdate(savedTransaction._id, {
          status: "FAILED",
          cfTransactionStatus: "FAILED",
          cfError: error.message,
          updatedAt: new Date(),
        }).session(session);
      }
    } else if (connectorName === "enpay") {
      try {
        qrResult = await generateEnpayQR(
          transactionData,
          merchantConnectorAccount.connectorAccDetails.integrationKeys
        );
        // ✅ Step 6: Update Transaction with QR Data
        // console.log("🟡 Step 6: Updating transaction with QR data...", qrResult);

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

        await Transaction.findByIdAndUpdate(
          savedTransaction._id,
          updateData
        ).session(session);
      } catch (error) {
        await Transaction.findByIdAndUpdate(savedTransaction._id, {
          status: "FAILED",
          enpayTransactionStatus: "FAILED",
          enpayError: error.message,
          updatedAt: new Date(),
        }).session(session);
      }
    } else if (connectorName === "razorpay") {
      try {
        qrResult = await generateRazorpayQR(
          transactionData,
          merchantConnectorAccount.connectorAccDetails.integrationKeys
        );
        // ✅ Step 6: Update Transaction with QR Data
        // console.log("🟡 Step 6: Updating transaction with QR data...", qrResult);

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

        await Transaction.findByIdAndUpdate(
          savedTransaction._id,
          updateData
        ).session(session);
      } catch (error) {
        await Transaction.findByIdAndUpdate(savedTransaction._id, {
          status: "FAILED",
          razorPayTransactionStatus: "FAILED",
          razorPayError: error.message,
          updatedAt: new Date(),
        }).session(session);
      }
    } else {
      await session.abortTransaction();
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
      {
        lastPayinTransactions: savedTransaction._id,
      },
      { new: true, session }
    );

    await session.commitTransaction();

    // Fetch updated transaction
    const updatedTransaction = await Transaction.findById(savedTransaction._id);

    // console.log(
    //   "✅ Transaction updated successfully:",
    //   updatedTransaction.transactionId
    // );

    // ✅ Step 7: Return Response
    // console.log("🟡 Step 7: Returning response...");

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
    await session.abortTransaction();

    // Update transaction status if it exists
    if (savedTransaction?._id) {
      try {
        // await Transaction.findByIdAndUpdate(savedTransaction._id, {
        //   status: "FAILED",
        //   enpayInitiationStatus: "ATTEMPTED_FAILED",
        //   enpayError: error.message,
        //   updatedAt: new Date(),
        // });
        await Transaction.findByIdAndUpdate(savedTransaction._id, {
          status: "FAILED",
          updatedAt: new Date(),
        });
        // console.log("✅ Updated transaction as FAILED");
      } catch (updateError) {
        console.error("❌ Failed to update transaction status:", updateError);
      }
    }

    res.status(500).json({
      success: false,
      message: "Failed to generate dynamic QR",
      error: error.message,
      details: error.response?.data || null,
      connector: savedTransaction.connectorName,
    });
  } finally {
    session.endSession();
  }
};

export const generateDynamicQRTransaction = async (req, res) => {
  // console.log("Body keys:", Object.keys(req.body));
  // console.log("🔍 Request Headers:", req.headers);
  let savedTransaction = null;
  let session;

  try {
    const authHeader =
      req.headers["authorization"] || req.headers["Authorization"];

    if (!authHeader) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided" });
    }

    // Split 'Bearer TOKEN' → get the actual token
    const token = authHeader.split(" ")[1];

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "Token malformed" });
    }
    // console.log("Token received:", token);

    // ✅ Check if token is in valid JWT format
    if (!isJWTFormat(token)) {
      return res.status(401).json({
        success: false,
        message: "Invalid authorization token format",
      });
    }

    // Now you can verify JWT
    // const decoded = jwt.verify(token, process.env.JWT_SECRET || "mysecretkey");

    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || "mysecretkey");
    } catch (err) {
      return res.status(401).json({
        success: false,
        message:
          err.name === "TokenExpiredError"
            ? "Token expired"
            : "Invalid authorization token",
      });
    }

    session = await mongoose.startSession();
    session.startTransaction();
    // console.log("Decoded payload:", decoded);
    let user;
    if (decoded)
      user = await User.findOne({ _id: decoded.userId }).session(session);
    if (!user) {
      throw { message: "Merchant Not found" };
    }

    const merchant = await Merchant.findOne({ userId: user._id }).session(
      session
    );
    // console.log(merchant);
    if (!merchant) {
      throw { message: "Merchant Not found" };
    }

    const isMatch = await bcrypt.compare(decoded.password, user.password);
    if (!isMatch) {
      throw { message: "Invalid merchant token" }; //It returns error on wrong password or old header key
    }

    const dateFilter = todayFilter();
    // console.log(dateFilter, user._id, user.transactionLimit);
    const transactionLimit = await Transaction.find({
      merchantId: user._id,
      ...dateFilter,
    }).session(session);

    // console.log(transactionLimit.length, "transactionLimit");

    const used = Number(transactionLimit?.length || 0);
    const limit = Number(user?.transactionLimit || 0);

    if (user.transactionLimit) {
      if (used >= limit) {
        throw {
          message: "Transaction limit has been exceeded for today!",
        };
      }
    }

    // console.log("Req Body:", !req.body);

    // ✅ FIX 1: Check if body exists
    if (!req.body) {
      console.error("❌ ERROR: req.body is undefined");
      throw {
        message: "Request body is required",
      };
    }

    const merchantId = user._id;
    const merchantName = user?.firstname + " " + (user?.lastname || "");

    const { txnRefId, amount, txnNote = "" } = req.body;

    if (!txnRefId) {
      throw {
        message: "TxnRefId cannot be blank",
      };
    }

    if (!amount) {
      throw {
        message: "Amount cannot be blank",
      };
    }

    // ✅ FIX 2: Log the actual values
    // console.log("🟡 Parsed values:", {
    //   txnRefId,
    //   amount: amount,
    //   txnNote: txnNote,
    //   merchantId,
    //   merchantName: merchantName,
    //   bodyType: typeof req.body,
    //   bodyKeys: Object.keys(req.body),
    // });

    // console.log("🟡 Generate Request:", {
    //   merchantId,
    //   merchantName,
    //   amount,
    //   txnNote,
    // });

    // ✅ Check if txnRefId already exists
    const existingTxnRefId = await Transaction.findOne({ txnRefId }).session(
      session
    );
    if (existingTxnRefId) {
      throw {
        message: "txnRefId already exists",
      };
    }

    const existingTransactionId = await Transaction.findOne({
      transactionId: txnRefId,
    }).session(session);

    if (existingTransactionId) {
      throw {
        message: "txnRefId already exists",
      };
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum)) {
      throw {
        message: "Invalid amount. Amount should be a valid number",
      };
    }

    if (amountNum < 500) {
      throw {
        message: "Amount should be greater than 500",
      };
    }

    // ✅ Step 1: Get Merchant Connector
    // console.log("🟡 Step 1: Getting merchant connector...");
    const merchantConnectorAccount = await getMerchantConnectorAccount(
      merchantId
    );

    if (!merchantConnectorAccount) {
      // console.log("❌ No connector account found for merchant");
      throw {
        message: "No payment connector configured. Please contact admin.",
      };
    }

    // console.log(
    //   "✅ Merchant connector found:",
    //   merchantConnectorAccount.connectorAccDetails.name
    // );

    const connectorName =
      merchantConnectorAccount.connectorDetails?.name.toLowerCase();

    // ✅ Step 2: Generate Transaction IDs
    // console.log("🟡 Step 2: Generating transaction IDs...");
    const transactionId = txnRefId;
    // const txnRefId = transactionId; // Use same as transactionId for Enpay
    const merchantOrderId = `ORDER${Date.now()}`;

    // console.log("📝 Generated IDs:", {
    //   transactionId,
    //   txnRefId,
    //   merchantOrderId,
    // });

    // ✅ Step 3: Create Transaction Object
    // console.log("🟡 Step 3: Creating transaction object...");
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

      // Enpay Specific
      // enpayInitiationStatus: "ATTEMPTED_SUCCESS",
      // isEnpayTransaction: true,

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
      gatewayTransactionId: transactionId,
      paymentMethod: "UPI",
      merchantOrderId,
      txnRefId,
      netAmount: amount ? parseFloat(amount) : 0,
      transactionType: "QR",

      // UPI Info
      // upiId: `${merchantConnectorAccount.connectorAccDetails.integrationKeys?.merchantHashId}@enpay`,
      // merchantVpa: `${merchantConnectorAccount.connectorAccDetails.integrationKeys?.merchantVpa}`,

      // Settlement Info
      // commissionAmount: 0,
      // settlementStatus: "UNSETTLED",
      // vendorRefId: `VENDOR${Date.now()}`,
    };

    // console.log("📊 Transaction data prepared:", transactionData);

    // ✅ Step 4: Save to Database FIRST
    // console.log("🟡 Step 4: Saving to database...");
    const transaction = new Transaction(transactionData);
    savedTransaction = await transaction.save({ session });

    // console.log("✅ Transaction saved in database:", {
    //   id: savedTransaction._id,
    //   transactionId: savedTransaction.transactionId,
    //   amount: savedTransaction.amount,
    // });

    // ✅ Step 5: Generate QR via Enpay
    // console.log(
    //   "🟡 Step 5: Calling Enpay API...",
    //   merchantConnectorAccount.connectorAccDetails
    // );

    let qrResult;
    if (connectorName === "cashfree") {
      try {
        qrResult = await generateCashfreeQR(
          transactionData,
          merchant,
          merchantConnectorAccount.connectorAccDetails.integrationKeys
        );

        console.log(qrResult);
        // ✅ Step 6: Update Transaction with QR Data
        // console.log("🟡 Step 6: Updating transaction with QR data...", qrResult);

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

        await Transaction.findByIdAndUpdate(
          savedTransaction._id,
          updateData
        ).session(session);
      } catch (error) {
        console.log(error, "Cashfree error");
        await Transaction.findByIdAndUpdate(savedTransaction._id, {
          status: "FAILED",
          cfTransactionStatus: "FAILED",
          cfError: error.message,
          updatedAt: new Date(),
        }).session(session);
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

        await Transaction.findByIdAndUpdate(
          savedTransaction._id,
          updateData
        ).session(session);
      } catch (error) {
        // console.log(error, "Duplication");
        if (error.message === "Duplicate transaction reference Id.") {
          throw {
            message: "txnRefId already exists.",
          };
        }
        // await session.abortTransaction();
        // return res.status(500).json({
        //   success: false,
        //   message: "Failed to generate Enpay payment link",
        //   details: error.response?.data || null,
        // });
        await Transaction.findByIdAndUpdate(savedTransaction._id, {
          status: "FAILED",
          enpayTransactionStatus: "FAILED",
          enpayError: error.message,
          updatedAt: new Date(),
        }).session(session);
      }
    } else if (connectorName === "razorpay") {
      try {
        qrResult = await generateRazorpayQR(
          transactionData,
          merchantConnectorAccount.connectorAccDetails.integrationKeys
        );
        // ✅ Step 6: Update Transaction with QR Data
        // console.log("🟡 Step 6: Updating transaction with QR data...", qrResult);

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

        await Transaction.findByIdAndUpdate(
          savedTransaction._id,
          updateData
        ).session(session);
      } catch (error) {
        await Transaction.findByIdAndUpdate(savedTransaction._id, {
          status: "FAILED",
          razorPayTransactionStatus: "FAILED",
          razorPayError: error.message,
          updatedAt: new Date(),
        }).session(session);
      }
    } else {
      throw {
        message: `Unsupported connector: ${connectorName}`,
      };
    }

    // console.log("✅ QR Generation Result:", {
    //   success: qrResult.success,
    //   enpayTransactionCreated: qrResult.enpayTransactionCreated,
    //   connector: qrResult.connector,
    //   hasQR: !!qrResult.qrData,
    // });

    // ✅ Step 6: Update Transaction with QR Data
    // console.log("🟡 Step 6: Updating transaction with QR data...");

    // const updateData = {
    //   qrCode: qrResult.qrData,
    //   paymentUrl: qrResult.paymentUrl,
    //   enpayTxnId: qrResult.enpayTxnId,
    //   enpayResponse: qrResult.enpayResponse,
    //   enpayTransactionStatus: "CREATED",
    //   enpayInitiationStatus: "ENPAY_CREATED",
    //   updatedAt: new Date(),
    // };

    // if (qrResult.enpayTransactionCreated) {
    //   updateData.status = "INITIATED";
    //   updateData.gatewayTransactionId = qrResult.enpayTxnId;
    // }

    // await Transaction.findByIdAndUpdate(
    //   savedTransaction._id,
    //   updateData
    // ).session(session);

    await Merchant.findOneAndUpdate(
      { userId: user._id },
      {
        lastPayinTransactions: savedTransaction._id,
      },
      { new: true, session }
    );

    await session.commitTransaction();

    // Fetch updated transaction
    const updatedTransaction = await Transaction.findById(savedTransaction._id);

    // console.log(
    //   "✅ Transaction updated successfully:",
    //   updatedTransaction.transactionId
    // );

    // ✅ Step 7: Return Response
    // console.log("🟡 Step 7: Returning response...");
    // enpayResponse: qrResult.enpayResponse,

    const responseData = {
      success: true,
      txnRefId: updatedTransaction.txnRefId,
      qrCode: updatedTransaction.qrCode,
      paymentUrl: updatedTransaction.paymentUrl,
      amount: updatedTransaction.amount,
      status: updatedTransaction.status,
      message: "Dynamic QR generated successfully",
      // connector: "enpay",
      // enpayStatus: "CREATED",
      // enpayTxnId: updatedTransaction.enpayTxnId,
      // merchantHashId: updatedTransaction.merchantHashId,
      // upiId: updatedTransaction.upiId,
      // transaction: {
      //   _id: updatedTransaction._id,
      //   createdAt: updatedTransaction.createdAt,
      //   updatedAt: updatedTransaction.updatedAt,
      // },
    };

    // console.log("✅ Response prepared:", responseData.success);
    console.log("🚀 ========== GENERATE DYNAMIC QR COMPLETED ==========");

    res.status(200).json(responseData);
  } catch (error) {
    console.error("❌ GENERATE QR ERROR:", error);
    if (session?.inTransaction()) {
      await session.abortTransaction();
    }

    // Update transaction status if it exists
    if (savedTransaction?._id) {
      try {
        await Transaction.findByIdAndUpdate(savedTransaction._id, {
          status: "FAILED",
          updatedAt: new Date(),
        });
        // console.log("✅ Updated transaction as FAILED");
      } catch (updateError) {
        console.error("❌ Failed to update transaction status:", updateError);
      }
    }

    res.status(500).json({
      success: false,
      message: "Failed to generate dynamic QR",
      details: error.message || error.response?.data || null,
    });
  } finally {
    if (session) session.endSession();
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
    console.log("🟡 Fetching transactions for merchant:", merchantId);
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

  const session = await mongoose.startSession();
  let savedTransaction = null;

  try {
    session.startTransaction();

    const merchantId = req.user?.id || req.user?._id;
    const merchantName = req.user?.firstname + " " + (req.user?.lastname || "");

    if (!merchantId) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Merchant ID not found",
      });
    }

    let user;
    if (merchantId)
      user = await User.findOne({ _id: merchantId }).session(session);

    if (!user) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "Merchnat Not found" });
    }

    const merchant = await Merchant.findOne({ userId: user._id }).session(
      session
    );
    // console.log(merchant);
    if (!merchant) {
      await session.abortTransaction();
      return res.status(500).json({
        success: false,
        message: "Merchant not found",
      });
    }

    const dateFilter = todayFilter();
    // console.log(dateFilter, user._id, user.transactionLimit);

    const transactionLimit = await Transaction.find({
      merchantId,
      ...dateFilter,
    }).session(session);

    // console.log(transactionLimit.length, "transactionLimit");

    const used = Number(transactionLimit?.length || 0);
    const limit = Number(user?.transactionLimit || 0);

    if (user.transactionLimit) {
      if (used >= limit) {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: "Transaction limit has been exceeded for today!",
        });
      }
    }

    console.log("🔵 Generate Static QR for:", merchantId);

    // Get merchant connector
    const merchantConnectorAccount = await getMerchantConnectorAccount(
      merchantId
    );

    if (!merchantConnectorAccount) {
      // console.log("❌ No connector account found for merchant");
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message:
          "No payment connector configured. Please set up a connector first.",
        needsSetup: true,
      });
    }

    // console.log(
    //   "✅ Merchant connector found for static QR:",
    //   merchantConnectorAccount.connectorDetails.name
    // );

    const connectorName =
      merchantConnectorAccount.connectorDetails?.name.toLowerCase();

    const transactionId = `STATIC${Date.now()}`;
    const txnRefId = transactionId;
    const merchantOrderId = `ORDER${Date.now()}`;

    console.log("📝 Generated IDs:", {
      transactionId,
      txnRefId,
      merchantOrderId,
    });

    // Create transaction
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
      gatewayTransactionId: transactionId,
      paymentMethod: "UPI",
      txnRefId,
      merchantOrderId,
      transactionType: "QR",

      // // UPI info
      // upiId: `${merchantConnectorAccount.connectorAccDetails.integrationKeys?.merchantHashId}@enpay`,
      // merchantVpa: `${merchantConnectorAccount.connectorAccDetails.integrationKeys?.merchantVpa}`,

      // // Settlement
      // commissionAmount: 0,
      // netAmount: 0,
      // mid: req.user?.mid || "",
      // settlementStatus: "UNSETTLED",
    };

    // console.log("📊 Static QR Transaction Data:", transactionData);

    // Save to database
    const transaction = new Transaction(transactionData);
    savedTransaction = await transaction.save({ session });

    // console.log("✅ Static QR transaction saved:", savedTransaction._id);

    // ✅ FIX: Generate STATIC QR (no amount) for Enpay API
    // console.log("🟡 Calling Enpay STATIC QR API...");

    let qrResult;

    if (connectorName === "cashfree") {
      try {
        qrResult = await generateCashfreeQR(
          transactionData,
          merchant,
          merchantConnectorAccount.connectorAccDetails.integrationKeys
        );

        console.log(qrResult);
        // ✅ Step 6: Update Transaction with QR Data
        // console.log("🟡 Step 6: Updating transaction with QR data...", qrResult);

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

        await Transaction.findByIdAndUpdate(
          savedTransaction._id,
          updateData
        ).session(session);
      } catch (error) {
        console.log(error, "Cashfree error");
        await Transaction.findByIdAndUpdate(savedTransaction._id, {
          status: "FAILED",
          cfTransactionStatus: "FAILED",
          cfError: error.message,
          updatedAt: new Date(),
        }).session(session);
      }
    } else if (connectorName === "enpay") {
      try {
        qrResult = await generateEnpayQR(
          transactionData,
          merchantConnectorAccount.connectorAccDetails.integrationKeys
        );
        // ✅ Step 6: Update Transaction with QR Data
        // console.log("🟡 Step 6: Updating transaction with QR data...", qrResult);

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

        await Transaction.findByIdAndUpdate(
          savedTransaction._id,
          updateData
        ).session(session);
      } catch (error) {
        await Transaction.findByIdAndUpdate(savedTransaction._id, {
          status: "FAILED",
          enpayTransactionStatus: "FAILED",
          enpayError: error.message,
          updatedAt: new Date(),
        }).session(session);
      }
    } else if (connectorName === "razorpay") {
      try {
        qrResult = await generateRazorpayQR(
          transactionData,
          merchantConnectorAccount.connectorAccDetails.integrationKeys
        );
        // ✅ Step 6: Update Transaction with QR Data
        // console.log("🟡 Step 6: Updating transaction with QR data...", qrResult);

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

        await Transaction.findByIdAndUpdate(
          savedTransaction._id,
          updateData
        ).session(session);
      } catch (error) {
        await Transaction.findByIdAndUpdate(savedTransaction._id, {
          status: "FAILED",
          razorPayTransactionStatus: "FAILED",
          razorPayError: error.message,
          updatedAt: new Date(),
        }).session(session);
      }
    } else {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Unsupported connector: ${connectorName}`,
      });
    }

    // console.log("✅ Static QR Generation Result:", {
    //   success: qrResult.success,
    //   isStaticQR: qrResult.isStaticQR,
    // });

    await Merchant.findOneAndUpdate(
      { userId: user._id },
      {
        lastPayinTransactions: savedTransaction._id,
      },
      { new: true, session }
    );

    await session.commitTransaction();

    const updatedTransaction = await Transaction.findById(savedTransaction._id);

    // console.log("✅ Static QR generated successfully");

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
    await session.abortTransaction();

    // Update transaction status if it exists
    if (savedTransaction?._id) {
      try {
        await Transaction.findByIdAndUpdate(savedTransaction._id, {
          status: "FAILED",
          updatedAt: new Date(),
        });
        // console.log("✅ Updated static QR transaction as FAILED");
      } catch (updateError) {
        console.error("❌ Failed to update transaction status:", updateError);
      }
    }

    res.status(500).json({
      success: false,
      message: "Failed to generate static QR",
      error: error.message,
      details: error.response?.data || null,
      connector: savedTransaction.connectorName,
    });
  } finally {
    session.endSession();
  }
};

export const generateDefaultQRTransaction = async (req, res) => {
  console.log("🔵 ========== GENERATE DEFAULT/STATIC QR STARTED ==========");
  // console.log(req.body);
  const session = await mongoose.startSession();
  let savedTransaction = null;

  try {
    session.startTransaction();
    const authHeader =
      req.headers["authorization"] || req.headers["Authorization"];

    if (!authHeader) {
      await session.abortTransaction();
      return res
        .status(401)
        .json({ success: false, message: "No token provided" });
    }
    // console.log(authHeader);

    // Split 'Bearer TOKEN' → get the actual token
    const token = authHeader.split(" ")[1];

    if (!token) {
      await session.abortTransaction();
      return res
        .status(401)
        .json({ success: false, message: "Token malformed" });
    }

    // ✅ Check if token is in valid JWT format
    if (!isJWTFormat(token)) {
      await session.abortTransaction();
      return res.status(401).json({
        success: false,
        message: "Invalid authorization token format",
      });
    }

    // console.log("Token received:", token);

    // Now you can verify JWT
    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || "mysecretkey");
    } catch (err) {
      await session.abortTransaction();
      return res.status(401).json({
        success: false,
        message:
          err.name === "TokenExpiredError"
            ? "Token expired"
            : "Invalid authorization token",
      });
    }

    // console.log("Decoded payload:", decoded);
    let user;
    if (decoded)
      user = await User.findOne({ _id: decoded.userId }).session(session);
    if (!user) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "Merchnat Not found" });
    }
    // console.log(user);
    const isMatch = await bcrypt.compare(decoded.password, user.password);
    if (!isMatch) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "Invalid merchant token" }); // Use a generic message for security
    }

    const merchant = await Merchant.findOne({ userId: user._id }).session(
      session
    );
    // console.log(merchant);
    if (!merchant) {
      await session.abortTransaction();
      return res.status(500).json({
        success: false,
        message: "Merchant not found",
      });
    }
    const dateFilter = todayFilter();
    // console.log(dateFilter, user._id, user.transactionLimit);
    const transactionLimit = await Transaction.find({
      merchantId: user._id,
      ...dateFilter,
    }).session(session);

    // console.log(transactionLimit.length, "transactionLimit");

    const used = Number(transactionLimit?.length || 0);
    const limit = Number(user?.transactionLimit || 0);

    if (user.transactionLimit) {
      if (used >= limit) {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: "Transaction limit has been exceeded for today!",
        });
      }
    }

    const { txnRefId, txnNote = "" } = req.body;

    if (!txnRefId) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "TxnRefId cannot be blank",
      });
    }

    const merchantId = user._id;
    const merchantName =
      user.company || user?.firstname + " " + (user?.lastname || "");

    // ✅ FIX 2: Log the actual values
    // console.log("🟡 Parsed values:", {
    //   merchantId: merchantId,
    //   merchantName: merchantName,
    //   txnRefId,
    //   txnNote,
    // });

    // console.log("🔵 Generate Static QR for:", merchantId);

    // ✅ Check if txnRefId already exists
    const existingTxnRefId = await Transaction.findOne({ txnRefId }).session(
      session
    );
    if (existingTxnRefId) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "txnRefId already exists" });
    }

    const existingTransactionId = await Transaction.findOne({
      transactionId: txnRefId,
    }).session(session);

    if (existingTransactionId) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "txnRefId already exists" });
    }

    // Get merchant connector
    const merchantConnectorAccount = await getMerchantConnectorAccount(
      merchantId
    );

    if (!merchantConnectorAccount) {
      // console.log("❌ No connector account found for merchant");
      await session.abortTransaction();
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

    const transactionId = txnRefId;
    // const txnRefId = transactionId;

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
      gatewayTransactionId: transactionId,
      paymentMethod: "UPI",
      txnRefId,
      merchantOrderId: `ORDER${Date.now()}`,
      transactionType: "QR",

      // UPI info
      // upiId: `${merchantConnectorAccount.connectorAccDetails.integrationKeys?.merchantHashId}@enpay`,
      // merchantVpa: `${merchantConnectorAccount.connectorAccDetails.integrationKeys?.merchantVpa}`,

      // Settlement
      // commissionAmount: 0,
      // netAmount: 0,
      // settlementStatus: "UNSETTLED",
    };

    // console.log("📊 Static QR Transaction Data:", transactionData);

    // Save to database
    const transaction = new Transaction(transactionData);
    savedTransaction = await transaction.save({ session });

    // console.log("✅ Static QR transaction saved:", savedTransaction._id);

    // ✅ FIX: Generate STATIC QR (no amount) for Enpay API
    // console.log("🟡 Calling Enpay STATIC QR API...");

    let qrResult;

    if (connectorName === "cashfree") {
      try {
        qrResult = await generateCashfreeQR(
          transactionData,
          merchant,
          merchantConnectorAccount.connectorAccDetails.integrationKeys
        );

        console.log(qrResult);
        // ✅ Step 6: Update Transaction with QR Data
        // console.log("🟡 Step 6: Updating transaction with QR data...", qrResult);

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

        await Transaction.findByIdAndUpdate(
          savedTransaction._id,
          updateData
        ).session(session);
      } catch (error) {
        console.log(error, "Cashfree error");
        await Transaction.findByIdAndUpdate(savedTransaction._id, {
          status: "FAILED",
          cfTransactionStatus: "FAILED",
          cfError: error.message,
          updatedAt: new Date(),
        }).session(session);
      }
    } else if (connectorName === "enpay") {
      try {
        qrResult = await generateEnpayQR(
          transactionData,
          merchantConnectorAccount.connectorAccDetails.integrationKeys
        );
        // ✅ Step 6: Update Transaction with QR Data
        // console.log("🟡 Step 6: Updating transaction with QR data...", qrResult);

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

        await Transaction.findByIdAndUpdate(
          savedTransaction._id,
          updateData
        ).session(session);
      } catch (error) {
        // console.log(error, "Duplication");
        if (error.message === "Duplicate transaction reference Id.") {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: "txnRefId already exists.",
            // message: "Duplicate transaction reference Id.",
          });
        }
        await Transaction.findByIdAndUpdate(savedTransaction._id, {
          status: "FAILED",
          enpayTransactionStatus: "FAILED",
          enpayError: error.message,
          updatedAt: new Date(),
        }).session(session);
      }
    } else if (connectorName === "razorpay") {
      try {
        qrResult = await generateRazorpayQR(
          transactionData,
          merchantConnectorAccount.connectorAccDetails.integrationKeys
        );
        // ✅ Step 6: Update Transaction with QR Data
        // console.log("🟡 Step 6: Updating transaction with QR data...", qrResult);

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

        await Transaction.findByIdAndUpdate(
          savedTransaction._id,
          updateData
        ).session(session);
      } catch (error) {
        await Transaction.findByIdAndUpdate(savedTransaction._id, {
          status: "FAILED",
          razorPayTransactionStatus: "FAILED",
          razorPayError: error.message,
          updatedAt: new Date(),
        }).session(session);
      }
    } else {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Unsupported connector: ${connectorName}`,
      });
    }

    // console.log("✅ Static QR Generation Result:", {
    //   success: qrResult.success,
    //   isStaticQR: qrResult.isStaticQR,
    // });

    // Update transaction
    // const updateData = {
    //   qrCode: qrResult.qrData,
    //   paymentUrl: qrResult.paymentUrl,
    //   enpayTxnId: qrResult.enpayTxnId,
    //   enpayResponse: qrResult.enpayResponse,
    //   enpayTransactionStatus: "CREATED",
    //   enpayInitiationStatus: "ENPAY_CREATED",
    //   isStaticQR: true,
    //   isDefaultQR: true,
    //   updatedAt: new Date(),
    // };

    // await Transaction.findByIdAndUpdate(savedTransaction._id, updateData, {
    //   session,
    // });

    await Merchant.findOneAndUpdate(
      { userId: user._id },
      {
        lastPayinTransactions: savedTransaction._id,
      },
      { new: true, session }
    );

    await session.commitTransaction();
    const updatedTransaction = await Transaction.findById(savedTransaction._id);

    // console.log("✅ Static QR generated successfully");

    res.status(200).json({
      success: true,
      txnRefId: updatedTransaction.txnRefId,
      qrCode: updatedTransaction.qrCode,
      paymentUrl: updatedTransaction.paymentUrl,
      status: updatedTransaction.status,
      message: "Static QR generated successfully",
      note: "Scan this QR code and enter any amount in your UPI app",
      // isStatic: true,
      // isDefault: true,
      // connector: "enpay",
    });
  } catch (error) {
    console.error("❌ Generate Static QR Error:", error);
    await session.abortTransaction();

    // Update transaction status if it exists
    if (savedTransaction?._id) {
      try {
        await Transaction.findByIdAndUpdate(savedTransaction._id, {
          status: "FAILED",
          // enpayInitiationStatus: "ATTEMPTED_FAILED",
          // enpayError: error.message,
          updatedAt: new Date(),
        });
        // console.log("✅ Updated static QR transaction as FAILED");
      } catch (updateError) {
        console.error("❌ Failed to update transaction status:", updateError);
      }
    }

    res.status(500).json({
      success: false,
      message: "Failed to generate static QR",
      // error: error.message,
      details: error.response?.data || null,
    });
  } finally {
    session.endSession();
  }
};

function generateTxnRefId() {
  return `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

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
  //     !!connectorAccount?.connectorAccountId?.integrationKeys,
  //   connectorAccountId: connectorAccount?.connectorAccountId?._id,
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
    connectorAccount?.connectorAccountId?.integrationKeys &&
    Object.keys(connectorAccount.connectorAccountId.integrationKeys).length > 0
  ) {
    // console.log(
    //   "🎯 Found keys in connectorAccount.connectorAccountId.integrationKeys"
    // );
    integrationKeys = connectorAccount.connectorAccountId.integrationKeys;
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

    const paymentLinkPayload = {
      upi_link: "true",
      amount: Math.round(amount * 100), // paise
      currency: "INR",
      accept_partial: false,
      reference_id: txnRefId,
      description: `Payment for ${
        merchant.company || `${merchant.firstname} ${merchant.lastname || ""}`
      }`,

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
    console.error("❌ Razorpay payment link error:", error?.error || error);

    throw {
      message:
        error?.error?.description || "Razorpay payment link generation failed",
    };
  }
};

export const generatePaymentLinkTransaction = async (req, res) => {
  const startTime = Date.now();
  console.log("🚀 generatePaymentLink STARTED", req.body);
  const session = await mongoose.startSession();

  try {
    session.startTransaction();
    const authHeader =
      req.headers["authorization"] || req.headers["Authorization"];

    if (!authHeader) {
      await session.abortTransaction();
      return res
        .status(401)
        .json({ success: false, message: "No token provided" });
    }

    // Split 'Bearer TOKEN' → get the actual token
    const token = authHeader.split(" ")[1];

    if (!token) {
      await session.abortTransaction();
      return res
        .status(401)
        .json({ success: false, message: "Token malformed" });
    }
    // console.log("Token received:", token);

    // ✅ Check if token is in valid JWT format
    if (!isJWTFormat(token)) {
      await session.abortTransaction();
      return res.status(401).json({
        success: false,
        message: "Invalid authorization token format",
      });
    }

    // Now you can verify JWT
    // const decoded = jwt.verify(token, process.env.JWT_SECRET || "mysecretkey");

    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || "mysecretkey");
    } catch (err) {
      await session.abortTransaction();
      return res.status(401).json({
        success: false,
        message:
          err.name === "TokenExpiredError"
            ? "Token expired"
            : "Invalid authorization token",
      });
    }
    // console.log("Decoded payload:", decoded);
    let user;
    if (decoded)
      user = await User.findOne({ _id: decoded.userId }).session(session);
    if (!user) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "Merchnat not found" });
    }

    const isMatch = await bcrypt.compare(decoded.password, user.password);
    if (!isMatch) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "Invalid merchant token" }); // Use a generic message for security
    }

    const merchantUpdate = await Merchant.findOne({ userId: user._id }).session(
      session
    );
    // console.log(merchantUpdate);
    if (!merchantUpdate) {
      await session.abortTransaction();
      return res.status(500).json({
        success: false,
        message: "Merchant not found",
      });
    }

    const dateFilter = todayFilter();
    // console.log(dateFilter, user._id, user.transactionLimit);
    const transactionLimit = await Transaction.find({
      merchantId: user._id,
      ...dateFilter,
    }).session(session);

    // console.log(transactionLimit.length, "transactionLimit");

    const used = Number(transactionLimit?.length || 0);
    const limit = Number(user?.transactionLimit || 0);

    if (user.transactionLimit) {
      if (used >= limit) {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: "Transaction limit has been exceeded for today!",
        });
      }
    }

    // console.log("Req Body:", req.body);

    const {
      txnRefId,
      amount,
      currency = "INR",
      paymentMethod,
      paymentOption,
    } = req.body;

    // Validation
    if (!txnRefId) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "TxnRefId cannot be blank",
      });
    }

    if (!amount) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Amount cannot be blank",
      });
    }

    const existingTxnRefId = await Transaction.findOne({ txnRefId }).session(
      session
    );
    if (existingTxnRefId) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "txnRefId already exists" });
    }

    const existingTransactionId = await Transaction.findOne({
      transactionId: txnRefId,
    }).session(session);

    if (existingTransactionId) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "txnRefId already exists" });
    }

    const merchantId = user._id;
    const merchantName =
      user.company || user?.firstname + " " + (user?.lastname || "");

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid amount. Amount should be a valid number",
      });
    }
    if (amountNum < 500) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Amount should be greater than 500",
      });
    }

    // Find merchant
    const merchant = await mongoose.connection.db
      .collection("users")
      .findOne({ _id: new mongoose.Types.ObjectId(merchantId) }, { session });

    // if (!merchant) {
    //   return res.status(404).json({
    //     success: false,
    //     message: "Merchant not found",
    //   });
    // }

    // Find Active Connector Account
    const activeAccount = await mongoose.connection.db
      .collection("merchantconnectoraccounts")
      .findOne(
        {
          merchantId: new mongoose.Types.ObjectId(merchantId),
          isPrimary: true,
          status: "Active",
        },
        { session }
      );

    const connector = await mongoose.connection.db
      .collection("connectors")
      .findOne({ _id: activeAccount.connectorId }, { session });

    const connectorAccount = await mongoose.connection.db
      .collection("connectoraccounts")
      .findOne(
        { _id: activeAccount.connectorAccountId },
        {
          session,
        }
      );

    activeAccount.connectorId = connector;
    activeAccount.connectorAccountId = connectorAccount;

    if (!activeAccount) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "No payment connector configured. Please contact admin.",
        needsSetup: true,
      });
    }

    const connectorName = activeAccount.connectorId?.name.toLowerCase();
    // console.log("🎯 Using Connector:", connectorName);

    // Extract keys using helper function
    const integrationKeys = extractIntegrationKeys(activeAccount);
    // console.log("🔑 Integration Keys Extracted:", {
    //   keysCount: Object.keys(integrationKeys).length,
    //   availableKeys: Object.keys(integrationKeys),
    // });
    const accountWithKeys = {
      ...activeAccount, // Convert mongoose document to plain object
      extractedKeys: integrationKeys,
    };
    // Attach extracted keys to the account object for the generator functions
    activeAccount.extractedKeys = integrationKeys;

    let paymentResult;

    if (connectorName === "cashfree") {
      paymentResult = await generateCashfreePayment({
        merchant,
        amount: amountNum,
        paymentMethod,
        paymentOption,
        connectorAccount: accountWithKeys,
      });
    } else if (connectorName === "enpay") {
      try {
        paymentResult = await generateEnpayPayment({
          txnRefId,
          amount: amountNum,
          paymentMethod,
          paymentOption,
          connectorAccount: accountWithKeys,
        });
      } catch (error) {
        console.error(`❌ Enpay failed:`, error);

        if (error.message === "Duplicate transaction reference Id.") {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: "txnRefId already exists.",
          });
        } else if (
          error.message === "No integration keys found for Enpay connector"
        ) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: "Integration keys are missing.",
          });
        }
        await session.abortTransaction();
        return res.status(500).json({
          success: false,
          message: "Failed to generate Enpay payment link",
          details: error.response?.data || error.message || null,
        });
      }
    } else if (connectorName === "razorpay") {
      paymentResult = await generateRazorpayPayment({
        txnRefId,
        merchant,
        amount: amountNum,
        paymentMethod,
        paymentOption,
        connectorAccount: accountWithKeys,
      });
    } else {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Unsupported connector: " + connectorName,
      });
    }

    if (!paymentResult) {
      await session.abortTransaction();
      return res.status(500).json({
        success: false,
        message: "Payment gateway did not return a valid response",
      });
    }

    // Create transaction record
    const transactionData = {
      transactionId: generateTransactionId(),
      merchantOrderId: paymentResult.merchantOrderId,
      merchantHashId: integrationKeys.merchantHashId,
      // merchantHashId: merchant.mid,
      // merchantVpa: `${merchant.mid?.toLowerCase()}@skypal`,
      merchantVpa: integrationKeys.merchantVpa,
      txnRefId: paymentResult.txnRefId,
      shortLinkId: generateShortId(),

      merchantId: merchant._id,
      merchantName: merchantName,
      // merchant.company || `${merchant.firstname} ${merchant.lastname}`,
      mid: merchant.mid,

      amount: amountNum,
      currency: currency,

      status: "INITIATED",
      previousStatus: "INITIATED",
      payInApplied: false,
      paymentMethod: paymentMethod,
      paymentOption: paymentOption,
      paymentUrl: paymentResult.paymentLink,

      connectorId: activeAccount.connectorId?._id,
      connectorAccountId: activeAccount.connectorAccountId?._id,
      connectorName: connectorName,
      terminalId: activeAccount.terminalId || "N/A",

      gatewayTransactionId: paymentResult.gatewayTransactionId,
      gatewayPaymentLink: paymentResult.paymentLink,
      gatewayOrderId: paymentResult.gatewayOrderId,
      transactionType: "Link",

      customerName: `${merchant.firstname} ${merchant.lastname || ""}`,
      customerVpa: ``,
      customerContact: merchant.contact || "",
      customerEmail: merchant.email || "",

      txnNote: `Payment for ${merchant.company || merchant.firstname}`,
      source: connectorName.toLowerCase(),
    };

    if (connectorName === "enpay") {
      transactionData.enpayTxnId = paymentResult.enpayTxnId;
      transactionData.enpayPaymentLink = paymentResult.paymentLink;
      transactionData.enpayResponse = paymentResult.enpayResponse;
      transactionData.enpayTransactionStatus = "CREATED";
      transactionData.enpayInitiationStatus = "ENPAY_CREATED";
    } else if (connectorName === "razorpay") {
      transactionData.txnRefId = paymentResult.razorPayTxnId; //It is used to check the payment status
      transactionData.razorPayTxnId = paymentResult.txnRefId; //this is the Reference Id which is passed to generate Payment Link
      transactionData.razorPayPaymentLink = paymentResult.paymentLink;
      transactionData.razorPayResponse = paymentResult.razorPayResponse;
      transactionData.razorPayTransactionStatus = "CREATED";
      transactionData.razorPayInitiationStatus = "RAZORPAY_CREATED";
    }

    // Save transaction
    const newTransaction = new Transaction(transactionData);
    await newTransaction.save({ session });

    await Merchant.findOneAndUpdate(
      { userId: user._id },
      {
        lastPayinTransactions: newTransaction._id,
      },
      { new: true, session }
    );

    await session.commitTransaction();

    console.log(
      `✅ ${connectorName} payment link generated in ${
        Date.now() - startTime
      }ms`
    );

    res.json({
      success: true,
      paymentLink: paymentResult.paymentLink,
      transactionId: transactionData.transactionId,
      txnRefId: transactionData.txnRefId,
      // connectorName,
      message: `${connectorName} payment link generated successfully`,
    });
  } catch (error) {
    console.error(`❌ Payment link generation failed:`, error);
    await session.abortTransaction();

    res.status(500).json({
      success: false,
      message: "Failed to generate payment link",
      details: error.response?.data || error.message || null,
    });
  } finally {
    session.endSession();
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
