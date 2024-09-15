import React from 'react';
import { FaFileAlt } from 'react-icons/fa';

const LoadingScreen: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center p-6 bg-white border rounded-lg shadow-md max-w-md mx-auto">
      <div className="mb-4">
        <FaFileAlt className="text-green-500 text-6xl" />
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
        <div className="bg-green-500 h-2.5 rounded-full w-3/4"></div>
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Uploading your file on a secure network</h2>
      <p className="text-gray-600 mb-6">Your uploaded files are securely deleted after printing.</p>
      <button className="text-red-500 font-bold hover:text-red-600 transition-colors">Cancel upload</button>
    </div>
  );
};

export default LoadingScreen;