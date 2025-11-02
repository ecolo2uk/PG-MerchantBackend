// models/QrTransaction.js
import mongoose from 'mongoose';

const qrTransactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: true
  },
  merchantId: {
    type: String,
    required: true
  },
  merchantName: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    default: 'INITIATED',
    enum: ['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'] // Add more statuses if needed
  },
  qrCode: {
    type: String
  },
  paymentUrl: {
    type: String
  },
  txnNote: {
    type: String,
    default: 'Payment for Order'
  },
  txnRefId: {
    type: String
  },
  upiId: {
    type: String,
    default: 'enpay1.skypal@fino'
  },
  merchantVpa: {
    type: String,
    default: 'enpay1.skypal@fino'
  },
  merchantOrderId: { // Added for Enpay
    type: String,
    unique: true, // Should be unique for Enpay
    sparse: true // Allows nulls, but if present must be unique
  },
  enpayTxnId: { // To store Enpay's internal transaction ID if they provide one
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  customerName: { type: String }, // Add for webhook data
  customerVpa: { type: String },   // Add for webhook data
  customerContact: { type: String }, // Add for webhook data
  settlementStatus: {
    type: String,
    enum: ["Settled", "Unsettled", "NA"],
    default: "Unsettled"
  }
}, {
  collection: 'qr_transactions',
  timestamps: true // Let Mongoose manage createdAt and updatedAt
});

export default mongoose.model('QrTransaction', qrTransactionSchema);