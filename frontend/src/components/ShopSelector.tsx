import React, { useState, useEffect } from 'react';
import { useFileData, Shop } from '../context/FileContext';
import { FaSearch, FaMapMarkerAlt } from 'react-icons/fa';

const ShopSelector: React.FC = () => {
  const { selectedShop, setSelectedShop, shopStatus, shops } = useFileData();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (shops.length === 1) {
      setSelectedShop(shops[0]);
    }
  }, [shops, setSelectedShop]);

  const handleShopSelect = (shop: Shop) => {
    setSelectedShop(shop);
  };

  if (shops.length === 0) {
    return <p className="text-gray-600">No shops available.</p>;
  }

  return (
    <div className="mb-8">
      <h2 className="text-2xl font-bold mb-4 text-indigo-600">Select a Shop</h2>
      {shops.length > 1 && (
        <div className="relative mb-4">
          <input
            type="text"
            placeholder="Search for shops..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <FaSearch className="absolute right-3 top-3 text-gray-400" />
        </div>
      )}
      <ul className="mt-4 max-h-60 overflow-y-auto bg-white rounded-lg shadow-md">
        {shops
          .filter(shop => shop.name.toLowerCase().includes(searchQuery.toLowerCase()))
          .map((shop) => (
            <li
              key={shop.userId}
              onClick={() => handleShopSelect(shop)}
              className={`px-4 py-3 cursor-pointer hover:bg-indigo-50 flex items-center justify-between ${selectedShop?.userId === shop.userId ? 'bg-indigo-100' : ''}`}
            >
              <div className="flex items-center">
                <FaMapMarkerAlt className="text-indigo-500 mr-2" />
                <span className="font-medium text-gray-900">{shop.name}</span>
                <span className="ml-2 text-sm text-gray-600">{shop.address}</span>
              </div>
              <div
                className={`w-3 h-3 rounded-full ml-4 ${shopStatus[shop.userId] ? 'bg-green-500' : 'bg-red-500'}`}
                title={shopStatus[shop.userId] ? 'Online' : 'Offline'}
              ></div>
            </li>
          ))}
      </ul>
    </div>
  );
};

export default ShopSelector;