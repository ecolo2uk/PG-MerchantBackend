const express = require("express");
const router = express.Router();
const User = require("../models/User");
const jwt = require("jsonwebtoken");

// ================== REGISTER ==================
router.post("/register", async (req, res) => {
  try {
    const { firstname, lastname, company, email, password } = req.body;

    // ✅ Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // ✅ Save user directly (no bcrypt)
    const newUser = new User({
      firstname,
      lastname,
      company,
      email,
      password,   // plain text password
    });

    await newUser.save();

    // ✅ Generate token
    const token = jwt.sign({ id: newUser._id }, "secretkey", { expiresIn: "1d" });

    res.status(201).json({ message: "User registered successfully", token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error registering user", error });
  }
});

// ================== LOGIN ==================
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // ✅ Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // ✅ Plain text password check
    if (user.password !== password) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // ✅ Generate token
    const token = jwt.sign({ id: user._id }, "secretkey", { expiresIn: "1d" });

    // ✅ Send token + user details
    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        firstname: user.firstname,
        lastname: user.lastname,
        company: user.company,
        email: user.email,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error });
  }
});

module.exports = router;
