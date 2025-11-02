// models/Transaction.js
import mongoose from 'mongoose';

const mainTransactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  merchantOrderId: {
    type: String,
    unique: true,
    sparse: true
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
  qrCode: {
    type: String
  },
  paymentUrl: {
    type: String
  },
  enpayTxnId: {
    type: String,
    default: null
  },
  customerName: { type: String, default: null },
  customerVpa: { type: String, default: null },
  customerContact: { type: String, default: null },
  "Commission Amount": {
    type: Number,
    required: true,
    default: 0
  },
  mid: { // This is the ONLY mid definition now
    type: String,
    required: true,
    default: function() { return `MID${Date.now()}`; }
  },
  "Settlement Status": {
    type: String,
    required: true,
    enum: ["Settled", "Unsettled", "NA"],
    default: "Unsettled"
  },
  "Vendor Ref ID": {
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
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  collection: 'transactions',
  timestamps: true
});

export default mongoose.model('Transaction', mainTransactionSchema);