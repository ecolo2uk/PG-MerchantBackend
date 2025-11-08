// services/enpayService.js मध्ये
const ENPAY_CONFIG = {
  // ✅ TRY DIFFERENT ENDPOINTS:
  baseURL: 'https://api.enpay.in/enpay-product-service/api/v1/merchant-gateway',
  // OR
  // baseURL: 'https://api.enpay.in/enpay-product-service/api/v1',
  // OR  
  // baseURL: 'https://api.enpay.in/api/v1/merchant-gateway',
  
  merchantKey: '0851439b-03df-4983-88d6-32399b1e4514',
  merchantSecret: 'bae97f533a594af9bf3dded47f09c34e15e053d1',
  merchantHashId: 'MERCDSH51Y7CD4YJLFIZR8NF'
};

// ✅ TRY DIFFERENT ENDPOINT PATHS:
export const generateEnpayDynamicQR = async (transactionData) => {
  try {
    // const payload = {
    //   merchantHashId: ENPAY_CONFIG.merchantHashId,
    //   txnAmount: transactionData.amount.toString(),
    //   txnNote: transactionData.txnNote || 'Payment for Order',
    //   txnRefId: transactionData.transactionId
    // };

    // console.log('🟡 Trying Enpay API endpoint...');

    // ✅ TRY DIFFERENT PATHS:
    let response;
    
    // Option 1: Original path
    try {
      response = await enpayApi.post('/dynamicQR', payload);
      console.log('✅ Success with /dynamicQR');
    } catch (error1) {
      console.log('❌ Failed with /dynamicQR, trying alternatives...');
      
      // Option 2: Without leading slash
      try {
        response = await enpayApi.post('dynamicQR', payload);
        console.log('✅ Success with dynamicQR');
      } catch (error2) {
        // Option 3: Different endpoint name
        try {
          response = await enpayApi.post('/generate-dynamic-qr', payload);
          console.log('✅ Success with /generate-dynamic-qr');
        } catch (error3) {
          // Option 4: Completely different path
          try {
            response = await enpayApi.post('/qr/generate', payload);
            console.log('✅ Success with /qr/generate');
          } catch (error4) {
            throw new Error('All endpoint attempts failed');
          }
        }
      }
    }

    // ... rest of response handling

  } catch (error) {
    console.error('❌ All Enpay API endpoints failed');
    return {
      success: false,
      error: 'Enpay API endpoint not found. Please check API documentation.'
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