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
    type: Date,
    required: true,
    default: Date.now
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
    type: mongoose.Schema.Types.Mixed // Can be Object or String
  },
  "Customer Name": {
    type: String
  },
  "Customer VPA": {
    type: String
  },
  "Failure Reasons": {
    type: String
  },
  "Vendor Txn ID": {
    type: String
  },
  // Additional fields for functionality
  merchantOrderId: {
    type: String
  },
  txnNote: {
    type: String
  },
  txnRefId: {
    type: String
  },
  upiId: {
    type: String
  },
  merchantVpa: {
    type: String
  },
  qrCode: {
    type: String
  },
  paymentUrl: {
    type: String
  },
  enpayTxnId: {
    type: String
  }
}, {
  collection: 'transactions',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

export default mongoose.model('Transaction', transactionSchema);