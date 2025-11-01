import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  // Core transaction fields
  transactionId: {
    type: String,
    required: true
  },
  merchantOrderId: {
    type: String,
    required: true
  },
  merchantHashId: {
    type: String,
    required: true
  },
  merchantId: {
    type: mongoose.Schema.Types.Mixed, // Allow both String and ObjectId
    required: true
  },
  merchantName: {
    type: String,
    required: true
  },
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
    enum: ["Pending", "Success", "Failed", "Cancelled", "Refund", "SUCCESS", "FAILED", "INITIATED"],
    default: 'Pending'
  },
  
  // UPI/Payment related fields - FIXED NAMES
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
  txnNote: { // FIXED: was txNNote
    type: String,
    default: 'Payment for Order'
  },
  txnRefId: { // FIXED: was txNbefId
    type: String
  },
  merchantVpa: {
    type: String,
    default: 'enpay1.skypal@fino'
  },
  
  // Customer information
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
  timestamps: true // This automatically creates createdAt and updatedAt
});

export default mongoose.model('Transaction', transactionSchema);