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
  
  const getNearestShops = async (req, res) => {
    try {
      const { lat, lng } = req.query;
      if (!lat || !lng) {
        return res.status(400).json({ message: 'Latitude and Longitude are required' });
      }
  
      const userLocation = [parseFloat(lng), parseFloat(lat)]; // Coordinates for geospatial query
      const limit = 5; // Limit the number of shops to return
  
      // Use $geoNear as the first stage in the aggregation pipeline
      const shops = await User.aggregate([
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: userLocation
            },
            distanceField: "distance",
            spherical: true,
            maxDistance: 5000, // 5km radius
          }
        },
        {
          $match: { isShop: true } // Match only shops
        },
        {
          $limit: limit // Limit to top 5 shops
        },
        {
          $project: {
            userId: 1,
            name: 1,
            address: 1,
            location: "$shopDetails.location",
            distance: 1 // Keep the distance field for sorting
          }
        }
      ]);
  
      // Use local cache to check the online status of shops
      const shopsWithStatus = shops.map(shop => {
        const isOnline = getShopStatus(shop.userId); // Check status from local cache
        return {
          ...shop,
          status: isOnline ? 'online' : 'offline' // Add the status to the shop details
        };
      });
  
      // Return the shops with their status
      res.status(200).json({ shops: shopsWithStatus });
    } catch (error) {
      console.error('Error fetching shops:', error.message);
      res.status(500).json({ message: 'Error fetching shops', error: error.message });
    }
  };
  

router.get('/shops', getNearestShops);
router.get('/shop', getShopById);
router.get('/shop-status', getstatus);

module.exports = router;