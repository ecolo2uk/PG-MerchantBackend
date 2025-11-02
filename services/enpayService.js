import axios from 'axios';

class EnpayService {
  constructor() {
    this.baseURL = 'https://api.enpay.in/enpay-product-service/api/v1';
    this.merchantKey = '0851439b-03df-4983-88d6-32399b1e4514';
    this.merchantSecret = 'bae97f533a594af9bf3dded47f09c34e15e053d1';
    this.merchantHashId = 'MERCDSH51Y7CD4YJLFIZR8NF';
  }

  async initiateCollectRequest(transactionData) {
    try {
      console.log('🟡 Initiating Enpay collect request:', transactionData);

      const payload = {
        "amount": transactionData.amount.toFixed(2),
        "merchantHashId": this.merchantHashId,
        "merchantOrderId": transactionData.merchantOrderId,
        "merchantTrnId": transactionData.transactionId,
        "merchantVpa": "enpay1.skypal@fino",
        "returnURL": "https://yourdomain.com/return",
        "successURL": "https://yourdomain.com/success", 
        "txnNote": transactionData.txnNote || "Payment for Order"
      };

      const response = await axios.post(
        `${this.baseURL}/merchant-gateway/initiateCollectRequest`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Merchant-Key': this.merchantKey,
            'X-Merchant-Secret': this.merchantSecret
          },
          timeout: 30000
        }
      );

      console.log('✅ Enpay API Response:', response.data);
      return {
        success: true,
        data: response.data,
        statusCode: response.status
      };

    } catch (error) {
      console.error('❌ Enpay API Error:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data || error.message,
        statusCode: error.response?.status || 500
      };
    }
  }

  async checkTransactionStatus(merchantOrderId) {
    try {
      const response = await axios.get(
        `${this.baseURL}/merchant-gateway/transactionStatus/${merchantOrderId}`,
        {
          headers: {
            'X-Merchant-Key': this.merchantKey,
            'X-Merchant-Secret': this.merchantSecret
          }
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('❌ Enpay Status Check Error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }
}

export default new EnpayService();