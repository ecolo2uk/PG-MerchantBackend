// db.js
import mongoose from "mongoose";

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB Connected");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

export default connectDB; // Changed to named export

// import mongoose from "mongoose";

// const connectDB = async () => {
//   if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not defined");

//   try {
//     if (mongoose.connection.readyState === 1) {
//       // already connected
//       return;
//     }

//     await mongoose.connect(process.env.MONGO_URI, {
//       serverSelectionTimeoutMS: 10000, // 10s timeout
//     });

//     console.log("✅ MongoDB Connected");

//     mongoose.connection.on("error", (err) => {
//       console.error("🔥 MongoDB runtime error:", err);
//     });
//   } catch (err) {
//     console.error("❌ MongoDB connection failed:", err);
//     throw err; // propagate to API route
//   }
// };

// export default connectDB;

// export const handleMongoError = (err) => {
//   // Default response
//   let status = 500;
//   let message = "Internal Server Error";

//   // Connection / network errors
//   if (
//     err.name === "MongoNetworkError" ||
//     err.message.includes("ECONNREFUSED") ||
//     err.message.includes("ENOTFOUND")
//   ) {
//     message = "Cannot connect to database. Please try again later.";
//   }

//   // Timeout
//   if (err.name === "MongoServerSelectionError") {
//     message = "Database connection timed out.";
//   }

//   // Validation errors
//   if (err.name === "ValidationError") {
//     message = Object.values(err.errors)
//       .map((e) => e.message)
//       .join(", ");
//     status = 400;
//   }

//   // Duplicate key
//   if (err.code === 11000) {
//     const field = Object.keys(err.keyValue);
//     message = `Duplicate value for field: ${field}`;
//     status = 400;
//   }

//   // Cast error (invalid ObjectId)
//   if (err.name === "CastError") {
//     message = `Invalid ${err.path}: ${err.value}`;
//     status = 400;
//   }

//   return { status, message };
// };

// utils/withDB.js
// import connectDB, { handleMongoError } from "../db";

// export default function withDB(handler) {
//   return async (req, res) => {
//     try {
//       await connectDB(); // ensure DB is connected
//       await handler(req, res); // run the actual API logic
//     } catch (err) {
//       const { status, message } = handleMongoError(err);
//       res.status(status).json({ error: message });
//     }
//   };
// }

// // pages/api/payment-link.js
// import withDB from "../../utils/withDB";
// import PaymentModel from "../../models/Payment";

// async function handler(req, res) {
//   // No try/catch needed here!
//   const payment = await PaymentModel.create({ amount: 100 });
//   res.status(200).json({ payment });
// }

// export default withDB(handler);

// import express from "express";
// import * as rawControllers from "../controllers/transactionController.js";
// import { authenticateMerchant } from "../middleware/authMiddleware.js";
// import withDB from "../utils/withDB.js";

// const router = express.Router();

// // Wrap controllers with withDB
// const getTransactions = withDB(rawControllers.getTransactions);
// const getSalesTransactions = withDB(rawControllers.getSalesTransactions);
// const exportSalesToExcel = withDB(rawControllers.exportSalesToExcel);
// const generateDynamicQRTransaction = withDB(rawControllers.generateDynamicQRTransaction);
// const generateDefaultQRTransaction = withDB(rawControllers.generateDefaultQRTransaction);
// const generatePaymentLinkTransaction = withDB(rawControllers.generatePaymentLinkTransaction);
// const generateDynamicQR = withDB(rawControllers.generateDynamicQR);
// const generateDefaultQR = withDB(rawControllers.generateDefaultQR);
// const getMerchantConnector = withDB(rawControllers.getMerchantConnector);
// const createDefaultConnectorAccount = withDB(rawControllers.createDefaultConnectorAccount);
// const debugEndpoint = withDB(rawControllers.debugEndpoint);

// // Routes
// router.get("/", authenticateMerchant, getTransactions);
// router.get("/sales", authenticateMerchant, getSalesTransactions);
// router.get("/exportSales", authenticateMerchant, exportSalesToExcel);

// router.post("/generate-static-qr", generateDefaultQRTransaction);
// router.post("/generate-dynamic-qr", generateDynamicQRTransaction);
// router.post("/generate-payment-link", generatePaymentLinkTransaction);
// router.post("/generate-qr", authenticateMerchant, generateDynamicQR);
// router.post("/default-qr", authenticateMerchant, generateDefaultQR);
// router.get("/connector", authenticateMerchant, getMerchantConnector);
// router.post("/create-connector", authenticateMerchant, createDefaultConnectorAccount);
// router.get("/debug", authenticateMerchant, debugEndpoint);

// export default router;
