import axios from 'axios';

const ENPAY_CONFIG = {
  baseURL: 'https://api.enpay.in/enpay-product-service/api/v1/merchant-gateway',
  merchantKey: '0851439b-03df-4983-88d6-32399b1e4514',
  merchantSecret: 'bae97f533a594af9bf3dded47f09c34e15e053d1',
  merchantHashId: 'MERCOSHESYYCDAYOLFTZR8MF'
};

const enpayApi = axios.create({
  baseURL: ENPAY_CONFIG.baseURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'X-Merchant-Key': ENPAY_CONFIG.merchantKey,
    'X-Merchant-Secret': ENPAY_CONFIG.merchantSecret
  }
});

// Enhanced with better error handling
export const generateEnpayDynamicQR = async (transactionData) => {
  try {
    console.log('🟡 Calling Enpay Dynamic QR API...');

    const payload = {
      merchantHashId: ENPAY_CONFIG.merchantHashId,
      txnAmount: transactionData.amount.toString(),
      txnNote: transactionData.txnNote || 'Payment for Order',
      txnRefId: transactionData.transactionId
    };

    console.log('🟡 Enpay Payload:', JSON.stringify(payload, null, 2));

    const response = await enpayApi.post('/dynamicQR', payload);

    console.log('✅ Enpay Response Received:', {
      code: response.data.code,
      message: response.data.message,
      hasDetails: !!response.data.details
    });

    if (response.data.code === 0) {
      return {
        success: true,
        enpayQRCode: response.data.details,
        enpayTxnId: response.data.transactionId,
        message: response.data.message
      };
    } else {
      console.log('❌ Enpay API Error:', response.data);
      return {
        success: false,
        error: response.data.message || 'Enpay API returned error'
      };
    }

  } catch (error) {
    console.error('❌ Enpay API Call Failed:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });

    return {
      success: false,
      error: error.response?.data?.message || error.message || 'Enpay API call failed'
    };
  }
};

export const generateEnpayDefaultQR = generateEnpayDynamicQR;