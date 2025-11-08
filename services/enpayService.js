// services/enpayService.js - COMPLETELY FIXED
import axios from 'axios';

const ENPAY_CONFIG = {
  baseURL: 'https://api.enpay.in/enpay-product-service/api/v1/merchant-gateway/dynamicQR', // ✅ CORRECT URL
  merchantKey: '0851439b-03df-4983-88d6-32399b1e4514',
  merchantSecret: 'bae97f533a594af9bf3dded47f09c34e15e053d1', 
  merchantHashId: 'MERCDSH51Y7CD4YJLFIZR8NF' // ✅ Verify this with Enpay
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

export const generateEnpayDynamicQR = async (transactionData) => {
  try {
    console.log('🟡 Calling Enpay API for Dynamic QR...');

    // ✅ CORRECT Payload structure
    const payload = {
      merchantHashId: ENPAY_CONFIG.merchantHashId,
      txnAmount: transactionData.amount.toString(),
      txnNote: transactionData.txnNote || 'Payment for Order',
      txnRefId: transactionData.transactionId
    };

    console.log('🟡 Enpay API Payload:', JSON.stringify(payload, null, 2));

    const response = await enpayApi.post('/dynamicQR', payload);

    console.log('✅ Enpay API Response:', {
      status: response.status,
      data: response.data
    });

    // ✅ CORRECT Response handling
    if (response.data && response.data.code === 0) {
      return {
        success: true,
        enpayQRCode: response.data.details?.qrCode || response.data.details,
        enpayTxnId: response.data.transactionId,
        message: response.data.message
      };
    } else {
      console.error('❌ Enpay API Business Error:', response.data);
      return {
        success: false,
        error: response.data?.message || `Enpay API error: ${response.data?.code}`
      };
    }

  } catch (error) {
    console.error('❌ Enpay API Network Error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });

    return {
      success: false,
      error: error.response?.data || error.message
    };
  }
};

export const generateEnpayDefaultQR = generateEnpayDynamicQR;

// export const generateEnpayDefaultQR = async (transactionData) => {
//   try {
//     console.log('🟡 Calling Enpay API for Default QR...');

//     const payload = {
//       merchantHashId: ENPAY_CONFIG.merchantHashId,
//       // FIX 2: Use the amount passed from the controller, which now defaults to 100
//       txnAmount: transactionData.amount,
//       txnNote: transactionData.txnNote || 'Default QR Code',
//       txnRefId: transactionData.transactionId
//     };

//     console.log('🟡 Enpay Default QR Payload:', payload);

//     const response = await enpayApi.post('/dynamicQR', payload);

//     console.log('✅ Enpay Default QR Response:', response.data);

//     if (response.data.code === 0) {
//       return {
//         success: true,
//         enpayQRCode: response.data.details,
//         enpayTxnId: response.data.transactionId,
//         message: response.data.message
//       };
//     } else {
//       return {
//         success: false,
//         error: response.data.message || 'Enpay API error'
//       };
//     }

//   } catch (error) {
//     console.error('❌ Enpay Default QR API Error:', error.response?.data || error.message);

//     return {
//       success: false,
//       error: error.response?.data?.message || error.message || 'Enpay API call failed'
//     };
//   }
// };