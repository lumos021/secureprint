// shopStatusCache.js
const shopStatusCache = {};

function updateShopStatus(shopId, status) {
  shopStatusCache[shopId] = status;
  console.log(`Updated status of ${shopId}: ${status}`);
}

function getShopStatus(shopId = null) {
  if (shopId) {
    return shopStatusCache[shopId] || false; 
  }
  return shopStatusCache;
}

module.exports = {
  updateShopStatus,
  getShopStatus
};