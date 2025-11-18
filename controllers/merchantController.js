// controllers/merchantController.js
import mongoose from 'mongoose';

export const getMerchantConnector = async (req, res) => {
  try {
    const merchantId = req.user.id;
    
    console.log('🔧 Fetching merchant connector for:', merchantId);
    
    const connectorAccount = await mongoose.connection.db.collection('merchantconnectoraccounts')
      .findOne({ 
        merchantId: new mongoose.Types.ObjectId(merchantId),
        status: "Active"
      });

    if (!connectorAccount) {
      return res.status(404).json({
        success: false,
        message: 'No active connector account found'
      });
    }

    // Get connector details
    const connector = await mongoose.connection.db.collection('connectors')
      .findOne({ _id: connectorAccount.connectorId });

    res.json({
      success: true,
      connectorAccount: {
        terminalId: connectorAccount.terminalId,
        connectorName: connector?.name || 'Unknown',
        connectorType: connector?.connectorType || 'UPI',
        industry: connectorAccount.industry,
        percentage: connectorAccount.percentage,
        isPrimary: connectorAccount.isPrimary,
        integrationKeys: connectorAccount.integrationKeys || {}
      }
    });

  } catch (error) {
    console.error('Error fetching merchant connector:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};