import React from 'react';
import { useFileData } from '../context/FileContext';

const LocationAccessMessage: React.FC = () => {
  const { showLocationMessage } = useFileData();

  if (!showLocationMessage) return null;

  return (
    <div className="bg-indigo-100 border-l-4 border-indigo-500 text-indigo-700 p-4 mb-4 rounded-lg shadow-md">
      <p className="font-medium">Location Access Required</p>
      <p className="text-sm">Please grant location access to serve you the neearest shops</p>
    </div>
  );
};

export default LocationAccessMessage;