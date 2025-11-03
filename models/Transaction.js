// models/Transaction.js - FIXED SCHEMA
import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  // Required fields
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    auto: true
  },
  amount: {
    type: Number,
    required: true
  },
  "Commission Amount": {
    type: Number,
    required: true,
    default: 0
  },
  createdAt: {
    type: String,
    required: true,
    default: () => new Date().toISOString()
  },
  merchantId: {
    type: mongoose.Schema.Types.Mixed, // CHANGED: Accept both ObjectId and String
    required: true
  },
  merchantName: {
    type: String,
    required: true
  },
  mid: {
    type: String,
    required: true,
    default: 'DEFAULT_MID'
  },
  "Settlement Status": {
    type: String,
    required: true,
    default: "NA"
  },
  status: {
    type: String,
    required: true,
    enum: ['GENERATED', 'INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'],
    default: 'GENERATED'
  },
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  "Vendor Ref ID": {
    type: String,
    required: true
  },
  
  // QR specific fields
  qrCode: { type: String },
  paymentUrl: { type: String },
  txnNote: { type: String, default: 'Payment for Order' },
  txnRefId: { type: String },
  upiId: { type: String, default: 'enpay1.skypal@fino' },
  merchantVpa: { type: String, default: 'enpay1.skypal@fino' },
  merchantOrderId: { type: String },
  
  // Customer fields (optional)
  "Customer Contact No": { type: mongoose.Schema.Types.Mixed },
  "Customer Name": { type: String },
  "Customer VPA": { type: String },
  "Failure Reasons": { type: String },
  "Vendor Txn ID": { type: String },
  enpayTxnId: { type: String },
  updatedAt: { type: String },
  
    enpayInitiationStatus: {
    type: String,
    enum: ['NOT_ATTEMPTED', 'ATTEMPTED_SUCCESS', 'ATTEMPTED_FAILED'],
    default: 'NOT_ATTEMPTED'
  },
  enpayError: {
    type: mongoose.Schema.Types.Mixed
  },
  enpayQRCode: {
    type: String // Store QR from Enpay API
  },
  enpayTxnId: {
    type: String // Transaction ID from Enpay
  },
  merchantHashId: {
    type: String,
    default: 'MERCDSH51Y7CD4YJLFIZR8NF'
  },
  txnRefId: {
    type: String // Reference ID for Enpay
  }

}, {
  collection: 'transactions',
  timestamps: false,
  strict: false // Allow extra fields
});

export default mongoose.model('Transaction', transactionSchema);