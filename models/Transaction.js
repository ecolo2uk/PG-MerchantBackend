import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  // Core transaction identifiers
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  merchantOrderId: {
    type: String,
    required: true
  },
  merchantHashId: {
    type: String,
    required: true,
    default: "MERCDSH51Y7CD4YJLFIZR8NF"
  },
  
  // Merchant information
  merchantId: {
    type: String,
    required: true
  },
  merchantName: {
    type: String,
    required: true
  },
  merchantVpa: {
    type: String,
    default: 'enpay1.skypal@fino'
  },
  
  // Payment details
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  status: {
    type: String,
    enum: ["Pending", "Success", "Failed", "Cancelled", "Refunded", "Initiated"],
    default: 'Initiated'
  },
  
  // UPI/Payment fields
  upiId: {
    type: String,
    default: 'enpay1.skypal@fino'
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
  
  // Customer information (optional)
  customerName: {
    type: String,
    default: null
  },
  customerVpa: {
    type: String,
    default: null
  },
  customerContact: {
    type: String,
    default: null
  },
  
  // Commission and settlement
  commissionAmount: {
    type: Number,
    default: 0
  },
  settlementStatus: {
    type: String,
    enum: ["Settled", "Unsettled", "NA"],
    default: "Unsettled"
  },
  settlementDate: {
    type: Date,
    default: null
  }
}, {
  timestamps: true // creates createdAt and updatedAt automatically
});

// Add index for better query performance
transactionSchema.index({ merchantId: 1, createdAt: -1 });
transactionSchema.index({ transactionId: 1 });
transactionSchema.index({ status: 1 });

export default mongoose.model('Transaction', transactionSchema);