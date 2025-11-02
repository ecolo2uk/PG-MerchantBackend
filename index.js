import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./config/db.js";
import merchantAuthRoutes from './routes/merchantAuthRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';

dotenv.config();

const app = express();

// FIXED: Add proper body parser configuration
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb'
}));

// FIXED: Enhanced CORS configuration
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Handle preflight requests
app.options('*', cors());

connectDB();

// Add request logging middleware
app.use((req, res, next) => {
  if (req.method === 'POST') {
    console.log(`🟡 ${req.method} ${req.path}`);
    console.log('🔍 Request Body:', req.body);
    console.log('🔍 Content-Type:', req.get('Content-Type'));
  }
  next();
});

app.use('/api/merchant/auth', merchantAuthRoutes);
app.use("/api/transactions", transactionRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Test endpoint for body parsing
app.post('/api/test-body', (req, res) => {
  console.log('🧪 Test Body Received:', req.body);
  res.json({
    success: true,
    body: req.body,
    amount: req.body.amount,
    amountType: typeof req.body.amount
  });
});

app.get('/', (req, res) => {
  res.send('Welcome to the PG-Merchant Backend API!');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));