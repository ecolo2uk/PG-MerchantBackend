// routes/webhook.js - Add this file
import express from 'express';
import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';

const router = express.Router();

// Enpay Webhook
router.post('/enpay-webhook', async (req, res) => {
  try {
    console.log('🟡 Enpay Webhook Received:', req.body);
    
    const { 
      txnRefId, 
      status, 
      amount, 
      customerName, 
      customerVPA,
      merchantHashId 
    } = req.body;
    
    if (!txnRefId) {
      return res.status(400).json({ error: 'txnRefId is required' });
    }
    
    // Find transaction
    const transaction = await Transaction.findOne({
      $or: [
        { transactionId: txnRefId },
        { txnRefId: txnRefId },
        { enpayTxnId: txnRefId }
      ]
    });
    
    if (!transaction) {
      console.log('❌ Transaction not found:', txnRefId);
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    // Update transaction
    transaction.status = status === 'SUCCESS' ? 'SUCCESS' : 
                        status === 'FAILED' ? 'FAILED' : 
                        status === 'PENDING' ? 'PENDING' : 'INITIATED';
    
    transaction.enpayTransactionStatus = status;
    
    if (customerName) {
      transaction.customerName = customerName;
    }
    
    if (customerVPA) {
      transaction.customerVPA = customerVPA;
    }
    
    if (amount) {
      transaction.amount = parseFloat(amount);
      transaction.netAmount = parseFloat(amount);
    }
    
    transaction.updatedAt = new Date();
    
    await transaction.save();
    
    console.log('✅ Enpay webhook processed:', {
      transactionId: transaction.transactionId,
      status: transaction.status,
      enpayStatus: status
    });
    
    res.json({ success: true, message: 'Webhook processed' });
    
  } catch (error) {
    console.error('❌ Enpay webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;