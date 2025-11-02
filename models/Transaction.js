import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  // REQUIRED FIELDS - Match your database schema exactly
  transactionId: {
    type: String,
    required: true,
    unique: true
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
    type: String, // Change to String to match your data
    required: true
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
  "Vendor Ref ID": {
    type: String,
    required: true,
    default: function() {
      return `VENDORREF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    }
  },

  // OPTIONAL FIELDS - Make them truly optional
  "Customer Contact No": {
    type: String,
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

  // QR FIELDS
  merchantOrderId: {
    type: String,
    default: function() {
      return `ORDER${Date.now()}`;
    }
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
  timestamps: false, // We're using custom createdAt
  strict: false // Allow additional fields that don't match schema
});

export default mongoose.model('Transaction', transactionSchema);