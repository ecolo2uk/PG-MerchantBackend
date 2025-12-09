import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    company: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },

    headerKey: {
      type: String,
    },
    role: {
      type: String,
      required: true,
      enum: ["admin", "merchant", "psp"],
    },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
    contact: { type: String },
    mid: { type: String, unique: true, sparse: true },
    pspId: { type: String, unique: true, sparse: true },
    documents: [
      {
        documentName: { type: String },
        documentType: { type: String },
        fileUrl: { type: String },
      },
    ],
    balance: {
      type: Number,
      default: 0,
    },
    unsettleBalance: {
      type: Number,
      default: 0,
    },
    bankDetails: {
      bankName: { type: String },
      accountNumber: { type: String },
      ifscCode: { type: String },
      accountHolderName: { type: String },
      accountType: { type: String, enum: ["Saving", "Current"] },
    },
    merchantRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Merchant",
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", UserSchema);
export default User;
