import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import bodyParser from 'body-parser';
import connectDB from "./config/db.js"; // ✅ ही line add करा

import merchantAuthRoutes from './routes/merchantAuthRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';

dotenv.config();

const app = express();



// Middleware
app.use(bodyParser.json());
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));


connectDB();



app.use('/api/merchant/auth', merchantAuthRoutes);
app.use("/api/transactions", transactionRoutes);
app.use('/api/dashboard', dashboardRoutes);



app.get('/', (req, res) => {
  res.send('Welcome to the PG-Merchant Backend API!');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));