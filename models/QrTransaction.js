// models/QrCodeTransaction.js - FOR QR SPECIFIC DATA (if needed)
import mongoose from 'mongoose';

const qrCodeTransactionSchema = new mongoose.Schema({
  qrTransactionId: { // Renamed to avoid confusion with main transactionId
    type: String,
    required: true,
    unique: true
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
    default: 'INITIATED',
    enum: ['INITIATED', 'PENDING', 'GENERATED', 'FAILED_ENPAY_INITIATION']
  },
  qrCodeUrl: { // URL to the generated QR code image
    type: String
  },
  upiPaymentUrl: { // The raw UPI deep link
    type: String
  },
  txnNote: {
    type: String,
    default: 'Payment for Order'
  },
  txnRefId: { // Your internal reference ID
    type: String,
    unique: true // Should be unique
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
  enpayInitiationStatus: { // Track if Enpay initiation was attempted/successful
    type: String,
    enum: ['NOT_ATTEMPTED', 'ATTEMPTED_SUCCESS', 'ATTEMPTED_FAILED'],
    default: 'NOT_ATTEMPTED'
  },
  enpayError: { // Store Enpay error message if initiation failed
    type: String
  }
}, {
  collection: 'qr_code_transactions', // New collection name for QR specific data
  timestamps: true
});

export default mongoose.model('QrCodeTransaction', qrCodeTransactionSchema);