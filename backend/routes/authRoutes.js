// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const logger = require('../utils/logger');

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, address, isShop, shopDetails } = req.body;
    const userId = crypto.randomBytes(16).toString('hex');
    const userData = {
      userId,
      email,
      password,
      name,
      address,
      isShop: isShop || false
    };

    if (isShop && shopDetails) {
      userData.shopDetails = {
        location: shopDetails.location
      };
    }
    const user = new User(userData);

    await user.save();

    const token = jwt.sign({ userId, email }, process.env.JWT_SECRET, { expiresIn: '7d' });

    logger.info('New user registered', { userId, name, email, isShop });
    res.status(201).json({ userId, token });
  } catch (error) {
    logger.error('Error registering user', { error: error.message });
    res.status(500).json({ message: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user.userId, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, userId: user.userId });
  } catch (error) {
    logger.error('Error during login', { error: error.message });
    res.status(500).json({ message: 'Login failed' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { token } = req.body;
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
    const user = await User.findOne({ userId: decoded.userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const newToken = jwt.sign({ userId: user.userId, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token: newToken });
  } catch (error) {
    logger.error('Error refreshing token', { error: error.message });
    res.status(401).json({ message: 'Invalid token' });
  }
});



module.exports = router;
