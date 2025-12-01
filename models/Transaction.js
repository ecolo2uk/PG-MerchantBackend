// models/Transaction.js - COMPLETE UPDATED SCHEMA
import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  // Basic Info
  transactionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  merchantId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  merchantName: {
    type: String,
    required: true
  },
  
  amount: {
    type: Number,
    required: false,
    default: null
  },
  
  status: {
    type: String,
    required: true,
    default: 'INITIATED',
    enum: ['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'CANCELLED']
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  },

  // QR & Payment Info
  qrCode: String,
  paymentUrl: String,
  txnNote: String,
  isDefaultQR: {
    type: Boolean,
    default: false
  },
  
  // Enpay Specific Fields - UPDATED
  enpayInitiationStatus: {
    type: String,
    enum: ['NOT_ATTEMPTED', 'ATTEMPTED_SUCCESS', 'ATTEMPTED_FAILED', 'ENPAY_CREATED'],
    default: 'NOT_ATTEMPTED'
  },
  
  enpayQRCode: String,
  enpayTxnId: String,
  enpayError: String,
  enpayResponse: mongoose.Schema.Types.Mixed,
  enpayTransactionStatus: String,
  
  // Connector Info
  connectorUsed: String,
  connectorAccountId: mongoose.Schema.Types.ObjectId,
  connectorId: mongoose.Schema.Types.ObjectId,
  terminalId: String,
  merchantHashId: String,
  
  // Payment Gateway Info
  paymentGateway: String,
  gatewayTransactionId: String,
  
  // UPI Details
  upiId: String,
  merchantVpa: String,
  
  // Settlement Info
  commissionAmount: {
    type: Number,
    default: 0
  },
  
  netAmount: {
    type: Number,
    default: 0
  },
  
  mid: {
    type: String,
    default: 'DEFAULT_MID'
  },
  
  settlementStatus: {
    type: String,
    default: 'UNSETTLED',
    enum: ['UNSETTLED', 'SETTLED', 'PROCESSING']
  },
  
  vendorRefId: String,
  
  // Customer Info
  customerName: String,
  customerVPA: String,
  customerContact: String,
  
  // Payment Info
  paymentMethod: {
    type: String,
    default: 'UPI'
  },
  
  merchantOrderId: String,
  txnRefId: String

}, {
  collection: 'transactions',
  timestamps: true
});

// Indexes
transactionSchema.index({ merchantId: 1, createdAt: -1 });
transactionSchema.index({ transactionId: 1 });
transactionSchema.index({ txnRefId: 1 });
transactionSchema.index({ enpayTxnId: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ createdAt: -1 });

export default mongoose.model('Transaction', transactionSchema);