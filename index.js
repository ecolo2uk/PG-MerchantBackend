import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./config/db.js";
import merchantAuthRoutes from './routes/merchantAuthRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());

connectDB();

app.use('/api/merchant/auth', merchantAuthRoutes);
app.use("/api/transactions", transactionRoutes);

app.get('/', (req, res) => {
  res.send('Welcome to the PG-Merchant Backend API!');
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));