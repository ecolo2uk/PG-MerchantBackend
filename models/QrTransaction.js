import mongoose from 'mongoose';

const qrTransactionSchema = new mongoose.Schema({
  transactionId: { // Use transactionId for consistency, as it's the internal ref
    type: String,
    required: true,
    unique: true
  },
  merchantId: {
    type: String, // Keep as String as it comes from req.user.id
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
    enum: ['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'GENERATED', 'REFUNDED'] // Added SUCCESS, FAILED, REFUNDED
  },
  qrCode: { // Consistent with main Transaction model
    type: String
  },
  paymentUrl: { // Consistent with main Transaction model (raw UPI deep link)
    type: String
  },
  txnNote: {
    type: String,
    default: 'Payment for Order'
  },
  txnRefId: { // Your internal transaction reference ID
    type: String,
    unique: true
  },
  upiId: {
    type: String,
    default: 'enpay1.skypal@fino'
  },
  merchantVpa: {
    type: String,
    default: 'enpay1.skypal@fino'
  },
  merchantOrderId: { // Unique ID sent to Enpay
    type: String,
    unique: true,
    sparse: true
  },
  enpayInitiationStatus: {
    type: String,
    enum: ['NOT_ATTEMPTED', 'ATTEMPTED_SUCCESS', 'ATTEMPTED_FAILED'],
    default: 'NOT_ATTEMPTED'
  },
  enpayError: {
    type: String
  },
  // Fields to store customer info from webhook
  customerName: { type: String, default: null },
  customerVpa: { type: String, default: null },
  customerContact: { type: String, default: null },
  settlementStatus: { // Added for webhook updates
    type: String,
    enum: ["Settled", "Unsettled", "NA"],
    default: "Unsettled"
  },
  "Commission Amount": { // Added from main schema for consistency if needed here
    type: Number,
    default: 0
  },
  mid: { // Added from main schema
    type: String
  },
  "Vendor Ref ID": { // Added from main schema
    type: String
  },
  "Vendor Txn ID": { // Added from main schema
    type: String
  },
  "Failure Reasons": { // Added from main schema
    type: String,
    default: null
  }
}, {
  collection: 'qr_transactions', // Use this collection for QR-specific data
  timestamps: true // Mongoose will manage createdAt and updatedAt
});

export default mongoose.model('QrTransaction', qrTransactionSchema);