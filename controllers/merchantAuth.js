import User from "../models/User.js"; // Use consistent casing for filename
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

// ================== LOGIN MERCHANT ==================
export const loginMerchant = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Crucial check: Only allow users with the 'merchant' role to log in here.
    if (user.role !== "merchant") {
      return res.status(403).json({
        message:
          "Access denied. Only merchants can log in through this portal.",
      });
    }

    // Crucial check: Only allow 'Active' merchants to log in.
    if (user.status !== "Active") {
      return res.status(403).json({
        message:
          "Your account is not active. Please contact support or your administrator.",
      });
    }

    // Compare the provided password with the hashed password in the database
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" }); // Use a generic message for security
    }

    // const payload = {
    //   userId: user._id,
    //   password: password,
    // };
    // // console.log(headerConcat);
    // const headerKey = jwt.sign(
    //   payload,
    //   process.env.JWT_MERCHANT_SECRET || "your_merchant_secret_key" // Use environment variable for secret
    //   // { expiresIn: "365d" }
    // );
    // console.log(headerKey, "HEADERKEY");
    // await User.updateOne(
    //   { _id: user._id },
    //   {
    //     $set: {
    //       headerKey: headerKey,
    //     },
    //   }
    // );

    // If all checks pass, generate a JWT token
    const token = jwt.sign(
      { id: user._id, role: user.role, mid: user.mid }, // Include mid in token if needed
      process.env.JWT_MERCHANT_SECRET || "mysecretkey", // Use environment variable for secret
      // process.env.JWT_MERCHANT_SECRET || "your_merchant_secret_key",
      { expiresIn: "1d" }
    );

    // Send success response with token and user details
    res.json({
      message: "Merchant login successful",
      token,
      user: {
        id: user._id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        role: user.role,
        status: user.status,
        company: user.company,
        mid: user.mid,
      },
    });
  } catch (error) {
    console.error("Error during merchant login:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getUser = async (req, res) => {
  // Optional: handle search params (state, rank, date...)
  try {
    // console.log(req.query, "User");
    const { id } = req.query;
    const user = await User.find({ _id: id });
    return res.json(user);
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Failed to fetch holidays", error: err.message });
  }
};
