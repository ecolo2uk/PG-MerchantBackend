// models/Transaction.js
import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    auto: true
  },
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
    enum: ['GENERATED', 'INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'], // Added 'GENERATED' for initial QR state
    default: 'INITIATED'
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
    required: true,
    unique: true // Ensure uniqueness for transaction reference ID
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
    required: true // Making this required as it seems important for QR transactions
  },
  mid: {
    type: String,
    required: true
  },
  "Vendor Ref ID": {
    type: String,
    required: true
  },
  "Commission Amount": {
    type: Number,
    default: 0
  },
  "Settlement Status": {
    type: String,
    default: "Unsettled" // Changed default to Unsettled as per your main schema
  },
  // Fields that were previously in the main Transaction schema
  createdAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  "Customer Contact No": {
    type: String // Changed to String as it's often stored as such
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
  // Fields from QrTransaction for internal tracking if needed
  enpayInitiationStatus: {
    type: String,
    enum: ['NOT_ATTEMPTED', 'ATTEMPTED_SUCCESS', 'ATTEMPTED_FAILED'],
    default: 'NOT_ATTEMPTED'
  },
  enpayError: {
    type: mongoose.Schema.Types.Mixed
  },
  enpayQRCode: { // Renamed from qrCode if you need to store two different QR codes
    type: String
  },
  enpayTxnId: {
    type: String
  },
  // Fields for customer details directly
  customerName: {
    type: String // Redundant with "Customer Name" but keeping for clarity if different sources use different keys
  },
  customerVpa: {
    type: String // Redundant with "Customer VPA"
  },
  customerContact: {
    type: String // Redundant with "Customer Contact No"
  }
}, {
  collection: 'transactions', // Explicitly set collection name
  timestamps: true // Adds createdAt and updatedAt automatically
});

export default mongoose.model('Transaction', transactionSchema);