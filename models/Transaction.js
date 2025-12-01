import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  // Required fields
  transactionId: {
    type: String,
    required: true,
    unique: true
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
    required: false, // ✅ Not required for default QR
    default: null
  },
  
  status: {
    type: String,
    required: true,
    default: 'INITIATED',
    enum: ['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'CANCELLED', 'EXPIRED']
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
  upiId: { 
    type: String, 
    default: 'enpay1.skypal@fino' 
  },
  
  isDefaultQR: {
    type: Boolean,
    default: false
  },
  
  qrGeneratedAt: {
    type: Date,
    default: Date.now
  },

  // Enpay integration - UPDATED
  enpayInitiationStatus: {
    type: String,
    enum: ['NOT_ATTEMPTED', 'ATTEMPTED_SUCCESS', 'ATTEMPTED_FAILED', 'ENPAY_CREATED', 'ENPAY_FAILED'],
    default: 'NOT_ATTEMPTED'
  },
  
  enpayQRCode: String,
  enpayTxnId: String,
  enpayError: mongoose.Schema.Types.Mixed,
  enpayResponse: mongoose.Schema.Types.Mixed,
  enpayTransactionStatus: String,
  
  // Connector Info
  connectorUsed: String,
  connectorAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MerchantConnectorAccount'
  },
  
  connectorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Connector'
  },
  
  terminalId: String,
  merchantHashId: String,
  
  // Payment Gateway Info
  paymentGateway: String,
  gatewayTransactionId: String,
  gatewayReferenceId: String,
  
  isEnpayTransaction: {
    type: Boolean,
    default: false
  },
  
  // UPI Details
  upiId: String,
  merchantVpa: String,
  
  // Optional fields with defaults
  "Commission Amount": { 
    type: Number, 
    default: 0 
  },
  
  "Commission Percentage": {
    type: Number,
    default: 0
  },
  
  "Net Amount": {
    type: Number,
    default: 0
  },
  
  mid: { 
    type: String, 
    default: 'DEFAULT_MID' 
  },
  
  "Settlement Status": { 
    type: String, 
    default: "UNSETTLED",
    enum: ["UNSETTLED", "SETTLED", "PROCESSING", "FAILED", "REVERSED"]
  },
  
  "Settlement Date": Date,
  
  "Vendor Ref ID": String,
  merchantVpa: { 
    type: String, 
    default: 'enpay1.skypal@fino' 
  },
  
  merchantOrderId: String,
  txnRefId: String,
  
  // Customer fields
  "Customer Name": String,
  "Customer VPA": String,
  "Customer Contact No": String,
  
  // Payment method
  paymentMethod: {
    type: String,
    default: 'UPI',
    enum: ['UPI', 'CARD', 'NETBANKING', 'WALLET']
  },
  
  // Transaction timing
  initiatedAt: {
    type: Date,
    default: Date.now
  },
  
  completedAt: Date,
  
  // Refund fields
  isRefunded: {
    type: Boolean,
    default: false
  },
  
  refundAmount: Number,
  refundReason: String,
  refundedAt: Date,
  
  // Additional metadata
  metadata: mongoose.Schema.Types.Mixed,
  
  // IP and location info
  ipAddress: String,
  userAgent: String,
  
  // Bank details (for settlements)
  bankName: String,
  accountNumber: String,
  ifscCode: String,
  
  // Webhook tracking
  webhookReceived: {
    type: Boolean,
    default: false
  },
  
  webhookData: mongoose.Schema.Types.Mixed,
  webhookReceivedAt: Date,
  
  // Retry logic
  retryCount: {
    type: Number,
    default: 0
  },
  
  lastRetryAt: Date

}, {
  collection: 'transactions',
  timestamps: true, // ✅ Added timestamps for createdAt and updatedAt
  strict: false, // Allow extra fields during development
  
  // Virtuals
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for formatted amount
transactionSchema.virtual('formattedAmount').get(function() {
  return this.amount ? `₹${this.amount.toLocaleString('en-IN')}` : 'Any Amount';
});

// Virtual for transaction age
transactionSchema.virtual('ageInMinutes').get(function() {
  if (!this.createdAt) return 0;
  const created = new Date(this.createdAt);
  const now = new Date();
  return Math.floor((now - created) / (1000 * 60));
});

// Pre-save middleware to calculate net amount
transactionSchema.pre('save', function(next) {
  if (this.amount && this.isModified('amount')) {
    const commission = (this.amount * (this["Commission Percentage"] || 0)) / 100;
    this["Net Amount"] = this.amount - commission;
  }
  next();
});

// Create indexes for better performance
transactionSchema.index({ merchantId: 1, createdAt: -1 });
transactionSchema.index({ transactionId: 1 });
transactionSchema.index({ txnRefId: 1 });
transactionSchema.index({ status: 1, createdAt: -1 });
transactionSchema.index({ "Settlement Status": 1 });
transactionSchema.index({ enpayTxnId: 1 });
transactionSchema.index({ merchantHashId: 1 });
transactionSchema.index({ connectorUsed: 1, createdAt: -1 });
transactionSchema.index({ createdAt: -1 }); // For time-based queries

// Static methods
transactionSchema.statics.findByMerchantId = function(merchantId, limit = 50) {
  return this.find({ merchantId })
    .sort({ createdAt: -1 })
    .limit(limit);
};

transactionSchema.statics.findByStatus = function(status, days = 7) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  
  return this.find({
    status: status,
    createdAt: { $gte: date.toISOString() }
  }).sort({ createdAt: -1 });
};

transactionSchema.statics.getDailyStats = async function(merchantId, date) {
  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);
  
  const endDate = new Date(date);
  endDate.setHours(23, 59, 59, 999);
  
  return this.aggregate([
    {
      $match: {
        merchantId: new mongoose.Types.ObjectId(merchantId),
        createdAt: {
          $gte: startDate.toISOString(),
          $lte: endDate.toISOString()
        }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    }
  ]);
};

// Instance methods
transactionSchema.methods.markAsSuccess = function(customerData = {}) {
  this.status = 'SUCCESS';
  this.completedAt = new Date();
  
  if (customerData.name) this["Customer Name"] = customerData.name;
  if (customerData.vpa) this["Customer VPA"] = customerData.vpa;
  if (customerData.contact) this["Customer Contact No"] = customerData.contact;
  
  return this.save();
};

transactionSchema.methods.markAsFailed = function(reason) {
  this.status = 'FAILED';
  this.completedAt = new Date();
  this.enpayError = reason;
  return this.save();
};

transactionSchema.methods.canRetry = function() {
  const maxRetries = 3;
  const retryWindow = 5 * 60 * 1000; // 5 minutes
  
  if (this.retryCount >= maxRetries) {
    return false;
  }
  
  if (this.lastRetryAt) {
    const timeSinceLastRetry = Date.now() - new Date(this.lastRetryAt).getTime();
    return timeSinceLastRetry > retryWindow;
  }
  
  return true;
};

// Export the model
export default mongoose.model('Transaction', transactionSchema);