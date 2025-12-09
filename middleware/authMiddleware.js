// middleware/authMiddleware.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const authenticateMerchant = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res
        .status(401)
        .json({ message: "Access denied. No token provided." });
    }
    // console.log("Authenticated user");
    const decoded = jwt.verify(
      token,
      process.env.JWT_MERCHANT_SECRET || "mysecretkey"
      // process.env.JWT_MERCHANT_SECRET || "your_merchant_secret_key"
    );

    const user = await User.findById(decoded.id);
    if (!user || user.role !== "merchant" || user.status !== "Active") {
      return res.status(401).json({ message: "Access denied. Invalid token." });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};
