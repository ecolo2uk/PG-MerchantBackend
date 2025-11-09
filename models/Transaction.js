import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  // Required fields
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  merchantId: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  merchantName: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: false, // ✅ CHANGED: Not required for default QR
    default: null
  },
  status: {
    type: String,
    required: true,
    default: 'INITIATED',
    enum: ['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED']
  },
  createdAt: {
    type: String,
    required: true,
    default: () => new Date().toISOString()
  },

  // QR related fields
  qrCode: String,
  paymentUrl: String,
  txnNote: String,
  upiId: { type: String, default: 'enpay1.skypal@fino' },
    isDefaultQR: {
    type: Boolean,
    default: false
  },
  

  // Enpay integration
  enpayInitiationStatus: {
    type: String,
    enum: ['NOT_ATTEMPTED', 'ATTEMPTED_SUCCESS', 'ATTEMPTED_FAILED'],
    default: 'NOT_ATTEMPTED'
  },
  enpayQRCode: String,
  enpayTxnId: String,
  enpayError: mongoose.Schema.Types.Mixed,

  // Optional fields with defaults
  "Commission Amount": { type: Number, default: 0 },
  mid: { type: String, default: 'DEFAULT_MID' },
  "Settlement Status": { type: String, default: "UNSETTLED" },
  "Vendor Ref ID": String,
  merchantVpa: { type: String, default: 'enpay1.skypal@fino' },
  merchantOrderId: String,
  txnRefId: String,

  // Customer fields
  "Customer Name": String,
  "Customer VPA": String,
  "Customer Contact No": String

}, {
  collection: 'transactions',
  timestamps: false,
  strict: false // Allow extra fields during development
});

// Create index for better performance
transactionSchema.index({ merchantId: 1, createdAt: -1 });
transactionSchema.index({ transactionId: 1 });

export default mongoose.model('Transaction', transactionSchema);