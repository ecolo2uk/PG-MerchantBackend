// controllers/merchantController.js
import mongoose from "mongoose";

// controllers/merchantController.js
export const getMerchantConnector = async (req, res) => {
  try {
    const merchantId = req.user.id;

    // console.log('🔧 Fetching merchant connector for merchantId:', merchantId);
    // console.log('🔧 User object from request:', req.user);

    // ✅ VALIDATE MERCHANT ID
    if (!merchantId || !mongoose.Types.ObjectId.isValid(merchantId)) {
      console.error("❌ Invalid merchantId:", merchantId);
      return res.status(400).json({
        success: false,
        message: "Invalid merchant ID",
      });
    }

    const connectorAccount = await mongoose.connection.db
      .collection("merchantconnectoraccounts")
      .findOne({
        merchantId: new mongoose.Types.ObjectId(merchantId),
        status: "Active",
      });

    // console.log("🔍 Database query result:", connectorAccount);

    if (!connectorAccount) {
      // console.log(
      //   "❌ No active connector account found for merchant:",
      //   merchantId
      // );
      return res.status(404).json({
        success: false,
        message: "No active connector account found",
      });
    }

    // Get connector details
    const connector = await mongoose.connection.db
      .collection("connectors")
      .findOne({ _id: connectorAccount.connectorId });

    // console.log("🔍 Connector details:", connector);

    const responseData = {
      success: true,
      connectorAccount: {
        _id: connectorAccount._id,
        terminalId: connectorAccount.terminalId,
        connectorName: connector?.name || "Unknown",
        connectorType: connector?.connectorType || "UPI",
        industry: connectorAccount.industry,
        percentage: connectorAccount.percentage,
        isPrimary: connectorAccount.isPrimary,
        integrationKeys: connectorAccount.integrationKeys || {},
        hasIntegrationKeys: !!connectorAccount.integrationKeys,
      },
    };

    // console.log("✅ Sending response:", responseData);

    res.json(responseData);
  } catch (error) {
    console.error("❌ Error fetching merchant connector:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
