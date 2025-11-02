// models/Transaction.js - EXACT SCHEMA MATCH
import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  // REQUIRED FIELDS from your schema validation
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    auto: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
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
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  merchantName: {
    type: String,
    required: true,
    default: "SKYPAL SYSTEM PRIVATE LIMITED"
  },
  mid: {
    type: String,
    required: true,
    default: function() {
      return `MID${Date.now()}`;
    }
  },
  "Settlement Status": {
    type: String,
    required: true,
    enum: ["Settled", "Unsettled", "NA"],
    default: "Unsettled"
  },
  status: {
    type: String,
    required: true,
    enum: ["SUCCESS", "FAILED", "PENDING", "INITIATED"],
    default: "INITIATED"
  },
  transactionId: {
    type: String,
    required: true
  },
  "Vendor Ref ID": {
    type: String,
    required: true,
    default: function() {
      return `VENDORREF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    }
  },

  // OPTIONAL FIELDS from your schema
  "Customer Contact No": {
    type: Map,
    of: Number,
    default: null
  },
  "Customer Name": {
    type: String,
    default: null
  },
  "Customer VPA": {
    type: String,
    default: null
  },
  "Failure Reasons": {
    type: String,
    default: null
  },
  "Vendor Txn ID": {
    type: String,
    default: null
  },

  // ADDITIONAL FIELDS for QR functionality (optional)
  merchantOrderId: {
    type: String,
    default: function() {
      return `ORDER${Date.now()}`;
    }
  },
  merchantHashId: {
    type: String,
    default: "MERCDSH51Y7CD4YJLFIZR8NF"
  },
  currency: {
    type: String,
    default: 'INR'
  },
  upiId: {
    type: String,
    default: 'enpay1.skypal@fino'
  },
  qrCode: {
    type: String,
    default: null
  },
  paymentUrl: {
    type: String,
    default: null
  },
  txnNote: {
    type: String,
    default: 'Payment for Order'
  },
  txnRefId: {
    type: String,
    default: null
  },
  merchantVpa: {
    type: String,
    default: 'enpay1.skypal@fino'
  }
}, {
  timestamps: false // We're using custom createdAt field to match schema
});

// Indexes
transactionSchema.index({ merchantId: 1, createdAt: -1 });
transactionSchema.index({ transactionId: 1 });
transactionSchema.index({ status: 1 });

export default mongoose.model('Transaction', transactionSchema);