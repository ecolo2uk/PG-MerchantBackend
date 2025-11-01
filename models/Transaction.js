// // models/Transaction.js
// import mongoose from "mongoose";

// const TransactionSchema = new mongoose.Schema(
//   {
//     transactionId: { 
//       type: String, 
//       required: true, 
//       unique: true,
//       index: true
//     },
//     merchantOrderId: { 
//       type: String, 
//       required: true 
//     },
//     merchantHashId: { 
//       type: String, 
//       required: true
//     },
//     // NEW: Merchant Reference
//     merchantId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'User',
//       required: true
//     },
//     merchantName: {
//       type: String,
//       required: true
//     },
//     amount: { 
//       type: Number, 
//       required: true,
//       min: 0
//     },
//     currency: { 
//       type: String, 
//       default: "INR" 
//     },
//    status: { 
//       type: String, 
//       enum: ["Pending", "Success", "Failed", "Cancelled", "Refund"],
//       default: "Pending" 
//     },
//     upiId: { 
//       type: String,
//       default: "enpay1.skypal@fino"
//     },
//     qrCode: { 
//       type: String 
//     },
//     paymentUrl: { 
//       type: String 
//     },
//     txnNote: { 
//       type: String,
//       default: "Payment for Order"
//     },
//     txnRefId: { 
//       type: String, 
//       unique: true,
//       sparse: true
//     },
//     merchantVpa: { 
//       type: String,
//       default: "enpay1.skypal@fino"
//     },
//      customerName: {
//       type: String
//     },
//     customerVpa: {
//       type: String
//     },
//     customerContact: {
//       type: String
//     }
//   },
  
//   { 
//     timestamps: true
//   }
// );

// export default mongoose.model("Transaction", TransactionSchema);




import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  // Core transaction fields
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
    required: true
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
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  status: {
    type: String,
    enum: ["Pending", "Success", "Failed", "Cancelled", "Refund"],
    default: 'Pending'
  },
  
  // UPI/Payment related fields
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
  timestamps: true
});

// Remove any unique index that might be causing issues with txnRefId
transactionSchema.index({ txnRefId: 1 }, { unique: false, sparse: true });

export default mongoose.model('Transaction', transactionSchema);