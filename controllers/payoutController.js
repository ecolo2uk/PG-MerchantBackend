import mongoose from "mongoose";
import Merchant from "../models/Merchant.js";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import { isJWTFormat } from "../utils/isJWTFormat.js";
import bcrypt from "bcryptjs";
import { todayFilter } from "../utils/todayFilter.js";
import Transaction from "../models/Transaction.js";
import PayoutTransaction from "../models/PayoutTransaction.js";
import axios from "axios";

const encryptData = async (reqBody) => {
  try {
    const encrypt_key = process.env.PAYOUT_ENCRYPTION_KEY;

    if (!encrypt_key) {
      throw new Error("Encryption key not found.");
    }
    // console.log("🔐 Req data:", reqBody);

    const response = await axios.post(
      "https://pg-rest-api.jodetx.com/v1/api/aes/generateEnc",
      reqBody,
      {
        headers: {
          "Content-Type": "application/json",
          apiKey: encrypt_key,
        },
      }
    );

    return {
      success: true,
      data: response.data,
    };
  } catch (err) {
    console.error(
      "❌ Encryption API Error:",
      err.response?.data || err.message
    );

    throw err || "Encryption error";
  }
};

const decryptData = async (encData) => {
  try {
    const encrypt_key = process.env.PAYOUT_ENCRYPTION_KEY;

    if (!encrypt_key) {
      throw new Error("Decryption key not found.");
    }

    // console.log("🔐 Enc data:", encData);

    if (!encData || typeof encData !== "string") {
      throw new Error("decData must be a string");
    }

    const payload = {
      encryptedData: encData,
    };

    // console.log("🔐 Decrypt payload:", payload);

    const response = await axios.post(
      "https://pg-rest-api.jodetx.com/v1/api/aes/decryptData",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          apiKey: encrypt_key,
        },
      }
    );

    return {
      success: true,
      data: response.data,
    };
  } catch (err) {
    console.error(
      "❌ Decryption API Error:",
      err.response?.data || err.message
    );
    throw err || "Decryption error";
  }
};

export const payoutInitiate = async (encryptedData) => {
  try {
    const header_key = process.env.PAYOUT_HEADER_KEY;
    if (!header_key) {
      throw new Error("Header key not found");
    }

    if (!encryptedData) {
      throw new Error("encryptedData is required");
    }
    // console.log("Data:", encryptedData);
    const requestParams = encryptedData;

    const response = await axios.post(
      "https://pg-rest-api.jodetx.com/v1/api/payout/initiate-transaction",
      {
        request: requestParams,
      },
      {
        headers: {
          token: header_key,
          "Content-Type": "application/json",
        },
      }
    );

    // console.log("Payout Initiated:", response.data);

    return {
      success: true,
      data: response.data,
    };
  } catch (err) {
    console.error("❌ Payout Initiation Error:", err.message);
    // return {
    //   success: false,
    //   error: err.message,
    // };
    throw err || "Payout Initiation Error";
    // throw new Error(err.message || "Payout Initiation Error");
  }
};

export const payoutTransactionStatus = async (encryptedData) => {
  try {
    const header_key = process.env.PAYOUT_HEADER_KEY;
    if (!header_key) {
      throw new Error("Header key not found");
    }

    if (!encryptedData) {
      throw new Error("encryptedData is required");
    }
    // console.log("Data:", encryptedData);
    const requestParams = encryptedData;

    const response = await axios.post(
      "https://pg-rest-api.jodetx.com/v1/api/payout/transaction-status",
      {
        request: requestParams,
      },
      {
        headers: {
          token: header_key,
          "Content-Type": "application/json",
        },
      }
    );

    // console.log("Payout Status:", response.data);

    return {
      success: true,
      data: response.data,
    };
  } catch (err) {
    console.error("❌ Payout Status Error:", err.message);
    // return {
    //   success: false,
    //   error: err.message,
    // };
    throw err || "Payout Status Update Error";
  }
};

const failTransaction = async (
  payoutId,
  merchantId,
  error,
  balanceBlocked,
  amount,
  session
) => {
  const update = {
    status: "FAILED",
    error: error?.message || String(error),
    updatedAt: new Date(),
  };

  await PayoutTransaction.findByIdAndUpdate(payoutId, update, { session });

  if (balanceBlocked && typeof amount == "number") {
    await Merchant.findOneAndUpdate(
      { userId: merchantId },
      {
        $inc: {
          availableBalance: amount,
          blockedBalance: -amount,
          totalTransactions: 1,
          payoutTransactions: 1,
          failedTransactions: 1,
        },
        $set: { lastPayoutTransactions: payoutId },
      },
      { session }
    );
  } else {
    await Merchant.findOneAndUpdate(
      { userId: merchantId },
      {
        $inc: {
          totalTransactions: 1,
          payoutTransactions: 1,
          failedTransactions: 1,
        },
        $set: { lastPayoutTransactions: payoutId },
      },
      { session }
    );
  }
};

export const initiatePayoutTransaction = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  let savedTransaction = null;
  let balanceBlocked = false;
  let payoutAmount = 0;
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      await session.abortTransaction();
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

    const merchantId = new mongoose.Types.ObjectId(decoded.userId);

    const [user, merchant] = await Promise.all([
      User.findById(merchantId).lean(),
      Merchant.findOne({ userId: merchantId }).lean(),
    ]);

    if (!user || !merchant) {
      await session.abortTransaction();
      return res
        .status(404)
        .json({ success: false, message: "Merchant not found" });
    }

    /* ===================== BCRYPT ===================== */
    const passwordMatch = await bcrypt.compare(decoded.password, user.password);
    if (!passwordMatch) {
      await session.abortTransaction();
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
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: "Transaction limit has been exceeded for today!",
        });
      }
    }

    const merchantName =
      user.company || user?.firstname + " " + (user?.lastname || "");

    if (!req.body) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Request is empty",
      });
    }

    const payoutId = `P${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const {
      requestId,
      beneficiary_account_number,
      beneficiary_bank_ifsc,
      beneficiary_bank_name,
      beneficiary_name,
      payment_mode,
      txn_note = "",
      amount,
    } = req.body || {};

    // console.log("📦 Creating payout with data:", req.body);
    payoutAmount = amount;
    // Create Payout Transaction with ALL required fields
    const newPayout = {
      // Required unique identifiers
      payoutId,
      requestId,

      // Merchant information
      merchantId,
      merchantName,
      merchantEmail: merchant.email || "",
      mid: merchant.mid || "",

      // Settlement information
      settlementAmount: payoutAmount,

      // Recipient bank details
      recipientBankName: beneficiary_bank_name,
      recipientAccountNumber: beneficiary_account_number,
      recipientIfscCode: beneficiary_bank_ifsc,
      recipientAccountHolderName: beneficiary_name,
      // recipientAccountType: accountType || "",

      // Transaction details
      amount: payoutAmount,
      currency: "INR",
      paymentMode: payment_mode || "",
      transactionType: "Debit",
      status: "INITIATED",
      remark: txn_note || "",
    };

    // savedTransaction = await PayoutTransaction.create(newPayout);
    [savedTransaction] = await PayoutTransaction.create([newPayout], {
      session,
    });

    // console.log("✅ Payout created successfully:", savedTransaction._id);

    if (!amount) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "Amount cannot be blank",
        balanceBlocked,
        payoutAmount,
        session
      );
      await session.commitTransaction();
      return res.status(400).json({
        success: false,
        message: "Amount cannot be blank",
      });
    }

    payoutAmount = Number(amount);

    if (isNaN(payoutAmount) || payoutAmount < 1000) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "Amount must be a number and greater than or equal to 1000",
        balanceBlocked,
        payoutAmount,
        session
      );
      await session.commitTransaction();
      return res.status(400).json({
        success: false,
        message: "Amount must be a number and greater than or equal to 1000",
      });
    }

    const blockResult = await Merchant.updateOne(
      {
        userId: merchantId,
        availableBalance: { $gte: payoutAmount },
      },
      {
        $inc: {
          availableBalance: -payoutAmount,
          blockedBalance: payoutAmount,
        },
      },
      { session }
    );

    if (blockResult.modifiedCount === 0) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "Insufficient balance",
        balanceBlocked,
        payoutAmount,
        session
      );
      await session.commitTransaction();
      return res.status(400).json({
        success: false,
        message: "Insufficient balance",
      });
    }
    balanceBlocked = true;

    /* ===================== VALIDATION ===================== */

    if (!requestId) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "RequestId cannot be blank",
        balanceBlocked,
        payoutAmount,
        session
      );
      await session.commitTransaction();
      return res.status(400).json({
        success: false,
        message: "RequestId cannot be blank",
      });
    }
    const [existingPayoutId] = await Promise.all([
      PayoutTransaction.findOne({
        requestId,
        _id: { $ne: savedTransaction._id },
      }).lean(),
    ]);

    if (existingPayoutId) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "RequestId already exists",
        balanceBlocked,
        payoutAmount,
        session
      );
      await session.commitTransaction();
      return res.status(400).json({
        success: false,
        message: "RequestId already exists",
      });
    }
    if (!beneficiary_account_number) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "Beneficiary Account Number cannot be blank",
        balanceBlocked,
        payoutAmount,
        session
      );
      await session.commitTransaction();
      return res.status(400).json({
        success: false,
        message: "Beneficiary Account Number cannot be blank",
      });
    }
    if (!beneficiary_bank_ifsc) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "Beneficiary Bank IFSC cannot be blank",
        balanceBlocked,
        payoutAmount,
        session
      );
      await session.commitTransaction();
      return res.status(400).json({
        success: false,
        message: "Beneficiary Bank IFSC cannot be blank",
      });
    }
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    if (!ifscRegex.test(beneficiary_bank_ifsc)) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "Invalid IFSC format",
        balanceBlocked,
        payoutAmount,
        session
      );
      await session.commitTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid IFSC format",
      });
    }
    if (!beneficiary_bank_name) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "Beneficiary Bank Name cannot be blank",
        balanceBlocked,
        payoutAmount,
        session
      );
      await session.commitTransaction();
      return res.status(400).json({
        success: false,
        message: "Beneficiary Bank Name cannot be blank",
      });
    }
    if (!beneficiary_name) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "Beneficiary Name cannot be blank",
        balanceBlocked,
        payoutAmount,
        session
      );
      await session.commitTransaction();
      return res.status(400).json({
        success: false,
        message: "Beneficiary Name cannot be blank",
      });
    }
    if (!payment_mode) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "Payment Mode cannot be blank",
        balanceBlocked,
        payoutAmount,
        session
      );
      await session.commitTransaction();
      return res.status(400).json({
        success: false,
        message: "Payment Mode cannot be blank",
      });
    }

    const encryptedResponse = await encryptData({
      requestId,
      beneficiary_account_number,
      beneficiary_bank_ifsc,
      beneficiary_bank_name,
      beneficiary_name,
      payment_mode,
      txn_note,
      amount: payoutAmount,
    });
    // console.log(encryptedResponse.data, "Enc res");

    const encryptedPayload = encryptedResponse.data;
    // console.log("Enc err:", encryptedResponse.data.description);

    if (
      !encryptedResponse.success ||
      encryptedResponse.data.responseCode !== "0"
    ) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        encryptedPayload?.data?.description || "Encryption failed",
        balanceBlocked,
        payoutAmount,
        session
      );
      await session.commitTransaction();
      return res.status(400).json({
        success: false,
        message: encryptedPayload?.data?.description || "Encryption failed",
      });
    }

    const encData = encryptedPayload.data.encData;

    const payoutResponse = await payoutInitiate(encData);
    // console.log(payoutResponse, "Payout res");

    if (!payoutResponse.success || payoutResponse.data.responseCode !== "0") {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        payoutResponse?.data?.description || "Payout Initiation error",
        balanceBlocked,
        payoutAmount,
        session
      );
      await session.commitTransaction();
      return res.status(400).json({
        success: false,
        message: payoutResponse?.data?.description || "Payout Initiation error",
      });
    }

    const payoutData = payoutResponse.data;
    // console.log("✅ Payout data:", payoutData);

    const decryptedResponse = await decryptData(payoutData.data);
    // console.log(decryptedResponse.data, "Dec res");

    if (
      !decryptedResponse.success ||
      decryptedResponse.data.responseCode !== "0"
    ) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        decryptedResponse?.data?.description || "Decryption failed",
        balanceBlocked,
        payoutAmount,
        session
      );
      await session.commitTransaction();
      return res.status(400).json({
        success: false,
        message: decryptedResponse?.data?.description || "Decryption failed",
      });
    }

    const decData = decryptedResponse.data;
    // console.log("✅ Decrypted data:", decData);

    if (!decData.data) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        "Invalid response",
        balanceBlocked,
        payoutAmount,
        session
      );
      await session.commitTransaction();
      return res.status(500).json({
        success: false,
        message: "Invalid response",
      });
    }

    const data = decData.data;

    const encryptedStatusResponse = await encryptData({
      requestId,
      txnId: data.txnId,
      enquiryId: "",
    });
    // console.log(encryptedStatusResponse.data, "Enc res");

    const encryptedStatusPayload = encryptedStatusResponse.data;

    if (
      !encryptedStatusResponse.success ||
      encryptedStatusPayload.responseCode !== "0"
    ) {
      // console.log("Enc err:", encryptedStatusResponse.data.description);
      await failTransaction(
        savedTransaction._id,
        merchantId,
        encryptedStatusPayload.data.description || "Encryption failed",
        balanceBlocked,
        payoutAmount,
        session
      );
      await session.commitTransaction();
      return res.status(400).json({
        success: false,
        message: encryptedStatusPayload.data.description || "Encryption failed",
      });
    }

    const encStatusData = encryptedStatusPayload.data.encData;

    const checkStatusRes = await payoutTransactionStatus(encStatusData);
    // console.log(checkStatusRes.data, "Payout res");

    if (checkStatusRes.data.responseCode !== "0") {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        checkStatusRes.data.description || "Check status failed",
        balanceBlocked,
        payoutAmount,
        session
      );
      await session.commitTransaction();
      return res.status(400).json({
        success: false,
        message: checkStatusRes.data.description || "Check status failed",
      });
    }

    // console.log("✅ Check Status data:", checkStatusRes.data);

    const statusData = checkStatusRes.data;

    const decryptedStatusResponse = await decryptData(statusData.data);
    // console.log(decryptedResponse.data, "Dec res");

    if (
      !decryptedStatusResponse.success ||
      decryptedStatusResponse.data.responseCode !== "0"
    ) {
      await failTransaction(
        savedTransaction._id,
        merchantId,
        decryptedStatusResponse.data.description || "Decryption failed",
        balanceBlocked,
        payoutAmount,
        session
      );
      await session.commitTransaction();
      return res.status(400).json({
        success: false,
        message:
          decryptedStatusResponse.data.description || "Decryption failed",
      });
    }

    const decStatusData = decryptedStatusResponse.data.data;

    if (decStatusData.txnStatus === "SUCCESS") {
      await Promise.all([
        PayoutTransaction.updateOne(
          { _id: savedTransaction._id },
          {
            transactionId: decStatusData.txnId,
            payoutEnquiryId: decStatusData.enquiryId,
            utr: decStatusData.utrNo,
            status: decStatusData.txnStatus,
            completedAt: decStatusData.txnDate,
          },
          { session }
        ),
        Merchant.updateOne(
          { userId: merchantId },
          {
            $inc: {
              blockedBalance: -payoutAmount,
              totalTransactions: 1,
              payoutTransactions: 1,
              successfulTransactions: 1,
            },
            $set: { lastPayoutTransactions: savedTransaction._id },
          },
          { session }
        ),
        User.updateOne(
          {
            _id: merchantId,
          },
          {
            $inc: {
              balance: -payoutAmount,
            },
          },
          { session }
        ),
      ]);
    } else if (["FAILED", "REVERSED"].includes(decStatusData.txnStatus)) {
      await Promise.all([
        PayoutTransaction.updateOne(
          { _id: savedTransaction._id },
          {
            transactionId: decStatusData.txnId,
            payoutEnquiryId: decStatusData.enquiryId,
            utr: decStatusData.utrNo,
            status: decStatusData.txnStatus,
            completedAt: decStatusData.txnDate,
          },
          { session }
        ),
        Merchant.updateOne(
          { userId: merchantId },
          {
            $inc: {
              availableBalance: payoutAmount,
              blockedBalance: -payoutAmount,
              totalTransactions: 1,
              payoutTransactions: 1,
              failedTransactions: 1,
            },
            $set: { lastPayoutTransactions: savedTransaction._id },
          },
          { session }
        ),
      ]);
    } else {
      await Promise.all([
        PayoutTransaction.updateOne(
          { _id: savedTransaction._id },
          {
            transactionId: decStatusData.txnId,
            status: decStatusData.txnStatus,
          },
          { session }
        ),
        Merchant.updateOne(
          { userId: merchantId },
          {
            $inc: {
              availableBalance: payoutAmount,
              blockedBalance: -payoutAmount,
              totalTransactions: 1,
              payoutTransactions: 1,
            },
            $set: { lastPayoutTransactions: savedTransaction._id },
          },
          { session }
        ),
      ]);
    }
    await session.commitTransaction();
    return res.status(201).json({
      success: true,
      message: "Payout initiated successfully",
      payoutTransaction: {
        requestId,
        status: decStatusData.txnStatus,
        utr: decStatusData.utrNo,
        transactionId: decStatusData.txnId,
      },
    });
  } catch (error) {
    console.error("❌ Payout error:", error);
    if (!savedTransaction?._id) {
      await session.abortTransaction(); // nothing to save
    } else {
      await failTransaction(
        savedTransaction._id,
        savedTransaction.merchantId,
        error.message || "Payout transaction failed",
        balanceBlocked,
        payoutAmount,
        session
      );
      await session.commitTransaction();
    }

    return res.status(500).json({
      success: false,
      message: "Payout transaction failed",
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

export const checkPayoutTransactionStatus = async (req, res) => {
  // console.log(
  //   "Checking Payout Transaction Status"
  // );
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
        .status(404)
        .json({ success: false, message: "Merchant Not found" });
    }

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
        message: "Merchant Not found",
      });
    }

    if (!req.body) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Request is empty",
      });
    }

    const { requestId, txnId, enquiryId } = req.body;

    // console.log("Transaction Req:", req.body);

    // Validate required fields
    if (!requestId) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "RequestId cannot be blank",
      });
    }

    if (!txnId) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Transaction Id cannot be blank",
      });
    }

    const encryptedResponse = await encryptData(req.body);
    // console.log(encryptedResponse.data, "Enc res");

    if (!encryptedResponse.success) {
      throw new Error("Encryption failed");
    }

    const encryptedPayload = encryptedResponse.data;

    // console.log("Enc err:", encryptedResponse.data.description);
    if (encryptedPayload.responseCode !== "0") {
      throw new Error(encryptedPayload.data.description || "Encryption failed");
    }
    const encData = encryptedPayload.data.encData;

    const checkStatusRes = await payoutTransactionStatus(encData);
    // console.log(checkStatusRes.data, "Payout res");

    if (checkStatusRes.data.responseCode !== "0") {
      throw new Error(checkStatusRes.data.description || "Check status failed");
    }

    // console.log("✅ Status data:", checkStatusRes.data);

    const statusData = checkStatusRes.data;

    const decryptedResponse = await decryptData(statusData.data);
    // console.log(decryptedResponse.data, "Dec res");

    if (!decryptedResponse.success) {
      throw new Error("Decryption failed");
    }

    // console.log("Dec err:", decryptedResponse.data);
    if (decryptedResponse.data.responseCode !== "0") {
      throw new Error(
        decryptedResponse.data.description || "Decryption failed"
      );
    }

    // console.log("✅ Decrypted data:", decryptedResponse.data);

    const decData = decryptedResponse.data.data;

    return res.json({
      success: true,
      data: decData,
    });
  } catch (error) {
    console.error("❌ Error fetching payout status:", error);
    await session.abortTransaction();

    // More detailed error information
    res.status(500).json({
      success: false,
      message: error.message,
    });
  } finally {
    session.endSession();
  }
};

export const checkBalance = async (req, res) => {
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
        .json({ success: false, message: "Merchant Not found" });
    }

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
      return res.status(404).json({
        success: false,
        message: "Merchant Not found",
      });
    }

    return res.json({
      success: true,
      data: {
        walletBalance: user.balance,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching payout status:", error);
    await session.abortTransaction();

    // More detailed error information
    res.status(500).json({
      success: false,
      message: error.message,
    });
  } finally {
    session.endSession();
  }
};
