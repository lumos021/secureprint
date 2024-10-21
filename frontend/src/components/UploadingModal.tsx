// components/UploadingModal.tsx
import React from 'react';
import { FaSpinner } from 'react-icons/fa';

interface UploadingModalProps {
  isOpen: boolean;
  progress: number;
}

const UploadingModal: React.FC<UploadingModalProps> = ({ isOpen, progress }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-sm w-full">
        <h2 className="text-2xl font-bold mb-4">Uploading Files</h2>
        <div className="flex items-center mb-4">
          <FaSpinner className="animate-spin mr-2 text-indigo-600" size={24} />
          <span>Uploading... {progress.toFixed(0)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-indigo-600 h-2.5 rounded-full"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
};

export default UploadingModal;