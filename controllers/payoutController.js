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

    const response = await axios.post(
      "https://pg-rest-api.jodetx.com/v1/api/aes/generateEnc",
      {
        apiKey: encrypt_key,
        data: reqBody,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000,
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

export const initiatePayoutTransaction = async (req, res) => {
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
        .json({ success: false, message: "Merchnat Not found" });
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

    const dateFilter = todayFilter();
    // console.log(dateFilter, user._id, user.transactionLimit);
    let totalTransactionsCount = 0;

    let PayinCount = await Transaction.find({
      merchantId: user._id,
      ...dateFilter,
    }).session(session);
    console.log(PayinCount.length, "payin count");
    totalTransactionsCount += PayinCount.length;
    console.log(totalTransactionsCount, "transaction Count");

    let PayoutCount = await PayoutTransaction.find({
      merchantId: user._id,
      ...dateFilter,
    }).session(session);

    console.log(PayoutCount.length, "payout count");
    totalTransactionsCount += PayoutCount.length;
    console.log(totalTransactionsCount, "transaction Count");

    const used = Number(totalTransactionsCount);
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

    const {
      requestId,
      beneficiary_account_number,
      beneficiary_bank_ifsc,
      beneficiary_bank_name,
      beneficiary_name,
      payment_mode,
      txn_note = "",
      amount,
    } = req.body;

    console.log("📦 Creating payout to merchant with data:", req.body);

    // Validate required fields
    if (!requestId) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "RequestId cannot be blank",
      });
    }
    if (!beneficiary_account_number) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Beneficiary Account Number cannot be blank",
      });
    }
    if (!beneficiary_bank_ifsc) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Beneficiary Bank IFSC cannot be blank",
      });
    }
    if (!beneficiary_bank_name) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Beneficiary Bank Name cannot be blank",
      });
    }
    if (!beneficiary_name) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Beneficiary Name cannot be blank",
      });
    }
    if (!payment_mode) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Payment Mode cannot be blank",
      });
    }
    if (!amount) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Amount cannot be blank",
      });
    }

    const existingPayoutId = await PayoutTransaction.findOne({
      payoutId: requestId,
    }).session(session);

    if (existingPayoutId) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "RequestId already exists" });
    }

    const merchantId = user._id;
    const merchantName =
      user.company || user?.firstname + " " + (user?.lastname || "");

    const payoutAmount = parseFloat(amount);

    if (isNaN(payoutAmount)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid amount. Amount should be a valid number",
      });
    }
    if (payoutAmount < 100) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Amount should be greater than 100",
      });
    }

    merchant.payoutTransactions = merchant.payoutTransactions || 0;
    merchant.totalLastNetPayOut = merchant.totalLastNetPayOut || 0;
    merchant.totalCredits = merchant.totalCredits || 0;
    merchant.availableBalance = merchant.availableBalance || 0;
    merchant.totalTransactions = merchant.totalTransactions || 0;
    merchant.successfulTransactions = merchant.successfulTransactions || 0;
    merchant.failedTransactions = merchant.failedTransactions || 0;

    if (merchant.availableBalance < payoutAmount) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Insufficient balance. Available: ₹${merchant.availableBalance}, Required: ₹${payoutAmount}`,
      });
    }
    const encryptedResponse = await encryptData(req.body);

    if (encryptedResponse.description !== "SUCCESS") {
      throw new Error("Encryption failed");
    }

    // Example usage
    const encryptedPayload = encryptedResponse.data;

    return res.json({ success: true });
    // Create Payout Transaction with ALL required fields
    const newPayout = new PayoutTransaction({
      // Required unique identifiers
      payoutId: requestId,

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
      status: "Success",
      remark: txn_note || "",
    });

    // console.log("✅ Payout created successfully:", newPayout);
    const savedPayout = await newPayout.save({ session });

    merchant.lastPayoutTransactions = savedPayout._id;
    merchant.totalTransactions += 1;
    merchant.payoutTransactions += 1;
    merchant.availableBalance -= payoutAmount;
    merchant.totalDebits += payoutAmount;
    merchant.totalLastNetPayOut += payoutAmount;
    merchant.successfulTransactions += 1;
    await merchant.save({ session });

    await User.findByIdAndUpdate(merchantId, {
      $inc: { balance: -payoutAmount },
    }).session(session);

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: "Payout initiated successfully",
      payoutTransaction: savedPayout,
      newBalance: user.balance,
    });
  } catch (error) {
    console.error("❌ Error creating payout to merchant:", error);
    await session.abortTransaction();

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Duplicate transaction detected",
      });
    }

    // More detailed error information
    res.status(500).json({
      success: false,
      message: "Server error during payout creation",
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  } finally {
    session.endSession();
  }
};
