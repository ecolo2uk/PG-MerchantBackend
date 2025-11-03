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
  // Make these optional with default values
  txnRefId: {
    type: String,
    default: function() {
      return `TXN${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
    }
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
    default: function() {
      return `ORDER${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
    }
  },
  mid: {
    type: String,
    default: 'DEFAULT_MID' // Replace with actual default MID
  },
  "Vendor Ref ID": {
    type: String,
    default: function() {
      return `VENDOR${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
    }
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
  collection: 'transactions',
  timestamps: true
});