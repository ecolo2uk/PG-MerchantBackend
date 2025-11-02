import mongoose from 'mongoose';

const mainTransactionSchema = new mongoose.Schema({
  _id: { // Matches your $jsonSchema's _id
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
  createdAt: { // Ensure this matches your expected format
    type: Date,
    default: Date.now
  },
  merchantId: {
    type: mongoose.Schema.Types.ObjectId, // Assuming merchantId is ObjectId in main
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
    // default: function() { return `MID${Date.now()}`; } // Removed function for direct assignment
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
    enum: ['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'],
    default: 'INITIATED'
  },
  transactionId: { // Your unique internal transaction ID
    type: String,
    required: true,
    unique: true
  },
  "Vendor Ref ID": {
    type: String,
    required: true,
    // default: function() { return this.txnRefId || `VENDORREF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`; }
  },
  // Optional fields from schema
  "Customer Contact No": { // Changed type to String as it's often stored as string
    type: String
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
  // Additional fields not in $jsonSchema but in your Mongoose schema
  merchantOrderId: { // For Enpay tracking
    type: String,
    unique: true,
    sparse: true
  },
  txnNote: {
    type: String,
    default: 'Payment for Order'
  },
  txnRefId: { // Your internal transaction reference ID
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
  }
}, {
  collection: 'transactions', // Explicitly set to your main transactions collection
  timestamps: { createdAt: false, updatedAt: true } // Mongoose will manage createdAt (explicitly defined) and updatedAt
});

export default mongoose.model('Transaction', mainTransactionSchema);