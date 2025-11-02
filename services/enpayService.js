// services/enpayService.js - UPDATED
import axios from 'axios';

class EnpayService {
  constructor() {
    this.baseURL = 'https://api.enpay.in/enpay-product-service/api/v1';
    this.merchantKey = '0851439b-03df-4983-88d6-32399b1e4514';
    this.merchantSecret = 'bae97f533a594af9bf3dded47f09c34e15e053d1';
    this.merchantHashId = 'MERCDSH51Y7CD4YJLFIZR8NF';
  }

  // FIXED: Use dynamicQR endpoint instead of initiateCollectRequest
  async generateDynamicQR({ amount, txnNote = "Payment for Order", txnRefId }) {
    try {
      console.log('🟡 Generating Enpay Dynamic QR:', { amount, txnNote, txnRefId });

      const payload = {
        "merchantHashId": this.merchantHashId,
        "txnAmount": parseFloat(amount),
        "txnNote": txnNote,
        "txnRefId": txnRefId
      };

      const headers = {
        'Content-Type': 'application/json',
        'X-Merchant-Key': this.merchantKey,
        'X-Merchant-Secret': this.merchantSecret
      };

      const response = await axios.post(
        `${this.baseURL}/merchant-gateway/dynamicQR`, // CORRECT ENDPOINT
        payload,
        {
          headers,
          timeout: 30000
        }
      );

      console.log('✅ Enpay Dynamic QR Response:', response.data);

      if (response.data && response.data.code === 0) { // Success code is 0
        return {
          success: true,
          data: response.data,
          qrCode: response.data.details, // Base64 QR code
          statusCode: response.status
        };
      } else {
        return {
          success: false,
          error: response.data || { message: "Unknown Enpay API error" },
          statusCode: response.status || 500
        };
      }

    } catch (error) {
      console.error('❌ EnpayService Dynamic QR Error:', error.response ? error.response.data : error.message);
      return {
        success: false,
        error: error.response?.data || error.message,
        statusCode: error.response?.status || 500
      };
    }
  }

  async checkTransactionStatus(merchantOrderId) {
    try {
      console.log('🟡 Checking Enpay transaction status for merchantOrderId:', merchantOrderId);

      const headers = {
        'X-Merchant-Key': this.merchantKey,
        'X-Merchant-Secret': this.merchantSecret
      };

      const response = await axios.get(
        `${this.baseURL}/merchant-gateway/transactionStatus/${merchantOrderId}`,
        {
          headers,
          timeout: 30000
        }
      );

      console.log('✅ Enpay Status Check Response:', response.data);

      if (response.data && response.data.status === 'SUCCESS') {
        return {
          success: true,
          data: response.data,
          statusCode: response.status
        };
      } else {
        return {
          success: false,
          error: response.data || { message: "Unknown Enpay API error" },
          statusCode: response.status || 500
        };
      }

    } catch (error) {
      console.error('❌ Enpay Status Check Error:', error.response ? error.response.data : error.message);
      return {
        success: false,
        error: error.response?.data || error.message,
        statusCode: error.response?.status || 500
      };
    }
  }
}

export default new EnpayService();