import mongoose from 'mongoose';

// MAIN Transaction Schema (for completed transactions)
const transactionSchema = new mongoose.Schema({
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
    required: true
  },
  merchantId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  merchantName: {
    type: String,
    required: true
  },
  mid: {
    type: String,
    required: true
  },
  "Settlement Status": {
    type: String,
    required: true,
    default: "Unsettled"
  },
  status: {
    type: String,
    required: true,
    enum: ['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'],
    default: 'INITIATED'
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
  // Optional fields
  "Customer Contact No": {
    type: mongoose.Schema.Types.Mixed,
    required: false
  },
  "Customer Name": {
    type: String,
    required: false
  },
  "Customer VPA": {
    type: String,
    required: false
  },
  "Failure Reasons": {
    type: String,
    required: false
  },
  "Vendor Txn ID": {
    type: String,
    required: false
  },
  merchantOrderId: {
    type: String,
    required: false
  },
  txnNote: {
    type: String,
    required: false
  },
  txnRefId: {
    type: String,
    required: false
  },
  upiId: {
    type: String,
    required: false
  },
  merchantVpa: {
    type: String,
    required: false
  },
  qrCode: {
    type: String,
    required: false
  },
  paymentUrl: {
    type: String,
    required: false
  },
  enpayTxnId: {
    type: String,
    required: false
  },
  updatedAt: {
    type: String,
    required: false
  }
}, {
  collection: 'transactions',
  timestamps: false
});

// QR Transaction Schema (for QR generation)
const qrTransactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  merchantId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  merchantName: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    default: 0
  },
  status: {
    type: String,
    required: true,
    enum: ['GENERATED', 'INITIATED', 'PENDING', 'SUCCESS', 'FAILED'],
    default: 'GENERATED'
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
    type: String,
    default: function() {
      return `REF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    }
  },
  upiId: {
    type: String,
    default: 'enpay1.skypal@fino'
  },
  merchantVpa: {
    type: String,
    default: 'enpay1.skypal@fino'
  },
  merchantOrderId: {
    type: String,
    default: function() {
      return `ORDER${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
    }
  },
  mid: {
    type: String,
    default: 'DEFAULT_MID'
  },
  "Vendor Ref ID": {
    type: String,
    default: function() {
      return `VENDOR${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    }
  },
  "Commission Amount": {
    type: Number,
    default: 0
  },
  "Settlement Status": {
    type: String,
    default: "NA"
  },
  enpayInitiationStatus: {
    type: String,
    enum: ['NOT_ATTEMPTED', 'ATTEMPTED_SUCCESS', 'ATTEMPTED_FAILED'],
    default: 'NOT_ATTEMPTED'
  },
  enpayError: {
    type: mongoose.Schema.Types.Mixed
  },
  enpayQRCode: {
    type: String
  },
  enpayTxnId: {
    type: String
  },
  customerName: {
    type: String
  },
  customerVpa: {
    type: String
  },
  customerContact: {
    type: String
  }
}, {
  collection: 'qr_transactions', // DIFFERENT COLLECTION
  timestamps: true
});

// Export BOTH models
export const Transaction = mongoose.model('Transaction', transactionSchema);
export const QrTransaction = mongoose.model('QrTransaction', qrTransactionSchema);