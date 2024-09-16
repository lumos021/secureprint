import React, { useRef, useState } from 'react';
import { useFileData } from '../context/FileContext';
import axios from 'axios';
import { FaCloudUploadAlt } from 'react-icons/fa';
import { useRouter } from 'next/router';
import { toast } from 'react-toastify';

const UploadForm: React.FC = () => {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setFilesData, selectedShop, setSessionId } = useFileData();
  const router = useRouter();
  const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  const isShopOffline = selectedShop ? selectedShop.status === false : true;

  const handleButtonClick = () => {
    if (selectedShop && fileInputRef.current && !isShopOffline) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0 && selectedShop) {
      setIsUploading(true);
      const formData = new FormData();
      Array.from(event.target.files).forEach(file => {
        formData.append('files', file);
      });
      formData.append('userId', selectedShop.userId);

      try {
        const response = await axios.post(`${apiUrl}/api/files/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setFilesData(response.data.files);

        if (response.data.sessionId) {
          setSessionId(response.data.sessionId);
        }

        router.push('/preview');
      } catch (error) {
        toast.error("Failed to upload files,try again later")
        // Show error message to user
      } finally {
        setIsUploading(false);
      }
    }
  };

  return (
    <div className="mt-8">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        multiple
        accept=".pdf,.jpg,.jpeg,.png"
      />
      <button
        onClick={handleButtonClick}
        disabled={!selectedShop || isUploading || isShopOffline}
        className={`w-full py-3 px-4 flex items-center justify-center text-white rounded-lg transition ${
          selectedShop && !isUploading && !isShopOffline
            ? 'bg-indigo-600 hover:bg-indigo-700'
            : 'bg-gray-400 cursor-not-allowed'
        }`}
      >
        <FaCloudUploadAlt className="mr-2" size={24} />
        {!selectedShop
          ? 'Select a Shop'
          : isUploading
            ? 'Uploading...'
            : isShopOffline
              ? 'Shop Offline'
              : 'Upload Files'}
      </button>
      <p className="text-sm text-gray-600 mt-2">
        Max file size: 100MB • Supported formats: PDF, JPG, PNG
      </p>
    </div>
  );
};

export default UploadForm;