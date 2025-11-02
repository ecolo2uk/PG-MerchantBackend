// models/QrTransaction.js - NEW FILE
import mongoose from 'mongoose';

// Simple schema without strict validation for QR transactions
const qrTransactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: true
  },
  merchantId: {
    type: String,
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
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  collection: 'qr_transactions' // Different collection name
});

export default mongoose.model('QrTransaction', qrTransactionSchema);