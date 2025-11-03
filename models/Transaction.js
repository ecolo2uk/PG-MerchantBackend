// models/Transaction.js
import mongoose from 'mongoose';

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
    type: String, // ⚠️ IMPORTANT: MongoDB schema expects string, not Date
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
  // Optional fields - make them truly optional
  "Customer Contact No": {
    type: mongoose.Schema.Types.Mixed,
    required: false // Explicitly set to false
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
  // Additional optional fields
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
  // Remove timestamps since we're handling dates manually to match MongoDB schema
  timestamps: false
});

export default mongoose.model('Transaction', transactionSchema);