import mongoose from 'mongoose';

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
    required: true
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
    required: true
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
  collection: 'qr_transactions',
  timestamps: true
});

export default mongoose.model('QrTransaction', qrTransactionSchema);