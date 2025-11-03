// middleware/validationMiddleware.js
export const validateTransactionData = (req, res, next) => {
  const { amount } = req.body;
  
  if (!amount || isNaN(amount)) {
    return res.status(400).json({
      code: 400,
      message: 'Valid amount is required'
    });
  }
  
  if (amount < 0) {
    return res.status(400).json({
      code: 400,
      message: 'Amount must be positive'
    });
  }
  
  next();
};

// In your routes:
