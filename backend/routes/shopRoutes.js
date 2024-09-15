const express = require('express');
const router = express.Router();
const User = require('../models/userModel');
const { getShopStatus } = require('../utils/shopStatusCache');

// Include your distance calculation function
const getDistance = (location1, location2) => {
  if (!location2) return Infinity;

  const R = 6371; // Radius of the Earth in km
  const dLat = deg2rad(location2.lat - location1.lat);
  const dLon = deg2rad(location2.lng - location1.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(location1.lat)) * Math.cos(deg2rad(location2.lat)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
};

const deg2rad = (deg) => {
  return deg * (Math.PI / 180);
};

const getstatus = async (req, res) => {
  const shopStatus = getShopStatus();
  res.json(shopStatus);
};

// Route to get a single shop based on shopId
const getShopById = async (req, res) => {
    try {
      const { shopId } = req.query;
  
      if (!shopId) {
        return res.status(400).json({ message: 'shopId is required' });
      }
  
      // Find the shop by shopId
      const shop = await User.findOne({ userId: shopId, isShop: true }).select('userId name address shopDetails.location');
      if (!shop) {
        // Shop not found
        return res.status(200).json({ message: 'Shop not found based on ID' });
      }
  
      // Shop found, get status and return
      const status = getShopStatus(shopId);
      res.status(200).json({ ...shop.toObject(), status: status === 'online' });
    } catch (error) {
      console.error('Error fetching shop:', error.message);
      res.status(500).json({ message: 'Error fetching shop', error: error.message });
    }
  };
  
  // Route to get the nearest shops or the first 5 shops
  const getNearestShops = async (req, res) => {
    try {
      const { lat, lng } = req.query;
  
      // Fetch all shops
      let shops = await User.find({ isShop: true }).select('userId name address shopDetails.location');
      const shopStatus = getShopStatus();
  
      const formatShop = (shop) => ({
        ...shop.toObject(),
        status: shopStatus[shop.userId] === 'online',
        shopDetails: {
          location: shop.shopDetails?.location || null
        }
      });
  
      let shopsWithStatus = shops.map(formatShop);
  
      // If lat and lng are provided, sort by distance
      if (lat && lng) {
        const userLocation = { lat: parseFloat(lat), lng: parseFloat(lng) };
        shopsWithStatus = shopsWithStatus.filter(shop => shop.shopDetails.location);
        shopsWithStatus.forEach(shop => {
          shop.distance = getDistance(userLocation, shop.shopDetails.location);
        });
        shopsWithStatus.sort((a, b) => a.distance - b.distance);
      }
  
      // Limit to 5 shops
      const limitedShops = shopsWithStatus.slice(0, 5);
  
      res.status(200).json({ shops: limitedShops });
    } catch (error) {
      console.error('Error fetching shops:', error.message);
      res.status(500).json({ message: 'Error fetching shops', error: error.message });
    }
  };
  
  

router.get('/shops', getNearestShops);
router.get('/shop', getShopById);
router.get('/shop-status', getstatus);

module.exports = router;