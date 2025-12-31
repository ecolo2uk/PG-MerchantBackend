import express from "express";
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import bodyParser from "body-parser";
import connectDB from "./config/db.js"; // ✅ ही line add करा

import merchantAuthRoutes from "./routes/merchantAuthRoutes.js";
import transactionRoutes from "./routes/transactionRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import webhookRoutes from "./routes/webhook.js";
import merchantRoutes from "./routes/merchant.js";
import payoutRoutes from "./routes/payoutRoutes.js";

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors());
// app.use(express.urlencoded({ extended: true }));
// connectDB();

// const startServer = async () => {
//   try {
//     await connectDB();
//     const PORT = process.env.PORT || 5000;
//     app.listen(PORT, () => {
//       console.log("🚀 Server running");
//     });
//   } catch (err) {
//     process.exit(1);
//   }
// };
// startServer();

app.use("/api/merchant/auth", merchantAuthRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/merchant", merchantRoutes);
app.use("/api/payout", payoutRoutes);
app.use("/api", webhookRoutes);

export default async function handler(req, res) {
  try {
    await connectDB(); // 🔥 THIS fixes Postman
    return app(req, res); // hand over to Express
  } catch (err) {
    console.error("Vercel handler error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
}

app.get("/", (req, res) => {
  res.send("Welcome to the PG-Merchant Backend API!");
});

// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
