// models/userModel.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  userId: { type: String, unique: true, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  address: String,
  isShop: { type: Boolean, default: false },
  shopDetails: {
    location: {
      lat: Number,
      lng: Number
    },
    qrCode: String
  },
  createdAt: { type: Date, default: Date.now },
});

userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  if (this.isShop && !this.shopDetails.qrCode) {
    // Generate QR code for shop
    const QRCode = require('qrcode');
    try {
      this.shopDetails.qrCode = await QRCode.toDataURL(`http://localhost:3000/shop/${this.userId}`);
    } catch (error) {
      console.error('Error generating QR code:', error);
    }
  }
  next();
});

userSchema.methods.comparePassword = async function(password) {
  return bcrypt.compare(password, this.password);
};


module.exports = mongoose.model('User', userSchema);