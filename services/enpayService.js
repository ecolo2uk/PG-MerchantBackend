// services/enpayService.js
import axios from 'axios';
import crypto from 'crypto'; // Although not used in your current methods, good to keep if needed

class EnpayService {
  constructor() {
    this.baseURL = 'https://api.enpay.in/enpay-product-service/api/v1'; // Enpay Base URL
    this.merchantKey = '0851439b-03df-4983-88d6-32399b1e4514'; // <<< REPLACE WITH YOUR ACTUAL MERCHANT KEY
    this.merchantSecret = 'bae97f533a594af9bf3dded47f09c34e15e053d1'; // <<< REPLACE WITH YOUR ACTUAL MERCHANT SECRET
    this.merchantHashId = 'MERCDSH51Y7CD4YJLFIZR8NF'; // <<< REPLACE WITH YOUR ACTUAL MERCHANT HASH ID

    // --- LOCALHOST URLs for development ---
    // IMPORTANT: For Enpay to reach these, you'll need to expose your localhost
    // using a tool like ngrok for the webhookURL and potentially for return/success URLs
    // if Enpay makes server-side calls to them.
    this.returnURL = 'http://localhost:3000/api/transactions/enpay-return'; // For browser redirect after payment
    this.successURL = 'http://localhost:3000/api/transactions/enpay-success'; // For browser redirect after payment
    this.webhookURL = 'http://localhost:3000/api/transactions/webhook'; // For server-to-server callback from Enpay
  }

  // No change to generateChecksum as it's not used in your provided methods

  async initiateCollectRequest({ amount, merchantOrderId, transactionId, txnNote, merchantVpa = "enpay1.skypal@fino" }) {
    try {
      console.log('🟡 Initiating Enpay collect request:', { amount, merchantOrderId, transactionId, txnNote, merchantVpa });

      const payload = {
        "amount": parseFloat(amount).toFixed(2), // Ensure amount is float and 2 decimal places
        "merchantHashId": this.merchantHashId,
        "merchantOrderId": merchantOrderId,
        "merchantTrnId": transactionId, // Your internal transaction ID, passed as merchantTrnId to Enpay
        "merchantVpa": merchantVpa,
        "returnURL": this.returnURL,
        "successURL": this.successURL,
        "txnNote": txnNote || "Payment for Order",
        "webhookURL": this.webhookURL // Register your webhook here
      };

      const headers = {
        'Content-Type': 'application/json',
        'X-Merchant-Key': this.merchantKey,    // Updated header name
        'X-Merchant-Secret': this.merchantSecret // Updated header name
      };

      const response = await axios.post(
        `${this.baseURL}/merchant-gateway/initiateCollectRequest`, // Updated endpoint
        payload,
        {
          headers,
          timeout: 30000 // 30 seconds timeout
        }
      );

      console.log('✅ Enpay API Response:', response.data);

      if (response.data && response.data.status === 'SUCCESS') { // Assuming Enpay responds with a 'status' field
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
      console.error('❌ EnpayService initiateCollectRequest Error:', error.response ? error.response.data : error.message);
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
        `${this.baseURL}/merchant-gateway/transactionStatus/${merchantOrderId}`, // Updated endpoint
        {
          headers,
          timeout: 30000
        }
      );

      console.log('✅ Enpay Status Check Response:', response.data);

      if (response.data && response.data.status === 'SUCCESS') { // Assuming Enpay responds with a 'status' field
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