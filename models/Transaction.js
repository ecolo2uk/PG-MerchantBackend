// models/Transaction.js - YOUR MAIN TRANSACTION SCHEMA
import mongoose from 'mongoose';

const mainTransactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true // Assuming transactionId should be unique in the main table
  },
  merchantOrderId: {
    type: String,
    unique: true,
    sparse: true // Allow nulls, but if present, must be unique
  },
  merchantId: {
    type: String,
    required: true
  },
  merchantName: {
    type: String,
    required: true,
    default: "SKYPAL SYSTEM PRIVATE LIMITED"
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    required: true,
    enum: ['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'],
    default: 'INITIATED'
  },
  txnNote: {
    type: String,
    default: 'Payment for Order'
  },
  txnRefId: { // Your internal reference ID
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
  qrCode: { // URL to the generated QR code image
    type: String
  },
  paymentUrl: { // The raw UPI deep link
    type: String
  },
  enpayTxnId: { // Enpay's internal transaction ID
    type: String,
    default: null
  },
  customerName: { type: String, default: null },
  customerVpa: { type: String, default: null },
  customerContact: { type: String, default: null },
  "Commission Amount": { // From your original schema, ensure it's here
    type: Number,
    required: true,
    default: 0
  },
  mid: { // From your original schema
    type: String,
    required: true,
    default: function() { return `MID${Date.now()}`; }
  },
  "Settlement Status": { // From your original schema
    type: String,
    required: true,
    enum: ["Settled", "Unsettled", "NA"],
    default: "Unsettled"
  },
  "Vendor Ref ID": { // From your original schema
    type: String,
    required: true,
    default: function() { return this.txnRefId || `VENDORREF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`; }
  },
  "Failure Reasons": {
    type: String,
    default: null
  },
  "Vendor Txn ID": {
    type: String,
    default: null
  },
  createdAt: { // Ensure this matches your expected format
    type: Date,
    default: Date.now
  }
}, {
  collection: 'transactions', // Explicitly set to your main transactions collection
  timestamps: true // Mongoose will manage `createdAt` and `updatedAt`
});

export default mongoose.model('Transaction', mainTransactionSchema);