import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useFileData, FileData } from '../context/FileContext';
import axios from 'axios';
import { FaPlus } from 'react-icons/fa';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import PrintStatusModal from '../components/PrintStatusModal';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import FilePreview from '../components/FilePreview';
import PrintSettings from '../components/PrintSettings';

const Preview: React.FC = () => {
  const router = useRouter();
  const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const { filesData, addFiles, removeFile, clearFiles, selectedShop, sessionId, setSessionId, shopStatus } = useFileData();
  const [processedFileUrls, setProcessedFileUrls] = useState<string[]>([]);
  const [totalPages, setTotalPages] = useState<number[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [printStatus, setPrintStatus] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [printSettings, setPrintSettings] = useState({
    copies: 1,
    color: 'b&w',
    orientation: 'portrait',
  });

  const pricePerPage = useMemo(() => ({
    'b&w': 3,
    'color': 10,
  }), []);

  const axiosInstance = useMemo(() => axios.create({
    baseURL: apiUrl,
    headers: {
      'X-Session-ID': sessionId || '',
    },
  }), [sessionId, apiUrl]);

  useEffect(() => {
    if (filesData.length > 0) {
      const fetchTotalPages = async () => {
        try {
          const pages = await Promise.all(
            filesData.map(async file => {
              if (file.mimetype === 'application/pdf') {
                const response = await axiosInstance.get(`/api/files/info?filename=${file.filename}`);
                return response.data.pages;
              } else {
                return 1;
              }
            })
          );
          setTotalPages(pages);
        } catch (error) {
          setError('Error fetching file info');
        }
      };

      fetchTotalPages();
    } else {
      router.push('/');
    }
  }, [filesData, router, axiosInstance]);

  useEffect(() => {
    let isMounted = true;

    const processFiles = async () => {
      if (filesData.length === 0) return;
      setLoading(true);
      try {
        const responses = await Promise.all(
          filesData.map(file =>
            axiosInstance.post('/api/files/process', {
              filename: file.filename,
              printSettings,
            })
          )
        );

        if (isMounted) {
          const processedUrls = responses.map(response => `${apiUrl}/api/files/download/${response.data.processedFilePath}`);
          setProcessedFileUrls(processedUrls);
          setLoading(false);
        }
      } catch (error) {
        setError('Error processing files');
        setLoading(false);
      }
    };

    processFiles();

    return () => {
      isMounted = false;
    };
  }, [filesData, printSettings, axiosInstance, apiUrl]);

  const handleRemoveFile = useCallback(async (index: number) => {
    const file = filesData[index];
    try {
      await axiosInstance.delete(`/api/files/delete/${file.filename}`);
      removeFile(index);
      setTotalPages(prevTotalPages => prevTotalPages.filter((_, i) => i !== index));
      setProcessedFileUrls(prevUrls => prevUrls.filter((_, i) => i !== index));
    } catch (error) {
      setError('Error deleting file');
    }
  }, [filesData, removeFile, axiosInstance]);

  const handleAddFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      try {
        const formData = new FormData();
        Array.from(files).forEach(file => formData.append('files', file));

        const response = await axiosInstance.post('/api/files/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });

        const newFilesData = response.data.files as FileData[];
        addFiles(newFilesData);
      } catch (error) {
        setError('Error uploading files');
      }
    }
  }, [addFiles, axiosInstance]);

  const handleFinalizePrint = useCallback(async () => {
    if (!selectedShop) {
      alert('Please select a shop before finalizing the print job.');
      return;
    }
    setPrintStatus('send');
    try {
      const response = await axiosInstance.post('/api/files/finalize', {
        printSettings,
        clientId: selectedShop.userId,
      });

      if (response.status === 200) {
        setPrintStatus('process');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        setPrintStatus('shopSend');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        setPrintStatus('print');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        setPrintStatus('delete');
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        toast.success('Files printed successfully and securely deleted from server!');
      } else {
        toast.info(response.data.message);
      }
    } catch (error) {
      toast.error('Error finalizing print job');
    } finally {
      clearFiles();
      setSessionId(null);
      router.push('/');
    }
  }, [filesData, printSettings, selectedShop, axiosInstance, clearFiles, setSessionId, router]);

  const isShopOffline = useMemo(() => {
    return selectedShop && shopStatus[selectedShop.userId] === false;
  }, [selectedShop, shopStatus]);

  return (
    <div className="container mx-auto py-10 px-4">
      <h2 className="text-3xl font-bold mb-8 text-center text-indigo-600">Printout Preview</h2>
      <div className="w-full overflow-x-scroll flex items-center gap-6 justify-start pb-6 bg-gray-100 rounded-lg no-scrollbar">
        {loading ? (
          <div className="w-full flex justify-center">
            <LoadingSpinner />
          </div>
        ) : (
          processedFileUrls.length > 0 ? (
            processedFileUrls.map((url, index) => (
              <FilePreview
                key={index}
                url={url}
                index={index}
                totalPages={totalPages}
                handleRemoveFile={handleRemoveFile}
              />
            ))
          ) : (
            <p className="text-center text-gray-600">No files to preview</p>
          )
        )}
        <div className="self-start last:mr-auto flex flex-col items-center mt-5 pr-6">
          <label className="dropzone m-7 flex items-center justify-center bg-green-500 text-white p-4 rounded-lg cursor-pointer hover:bg-green-600 transition-colors shadow-sm">
            <FaPlus size={24} className="mr-2" />
            Add files
            <input accept=".jpg,.jpeg,.png,.pdf" type="file" multiple className="hidden" onChange={handleAddFile} />
          </label>
        </div>
      </div>
      <PrintSettings
        printSettings={printSettings}
        setPrintSettings={setPrintSettings}
        calculateTotalCost={() => {
          const costPerPage = pricePerPage[printSettings.color];
          const totalPagesSum = totalPages.reduce((sum, pages) => sum + pages, 0);
          return printSettings.copies * totalPagesSum * costPerPage;
        }}
      />
      <button
        className={`w-full py-2 px-4 rounded-lg font-bold mt-4 transition
          ${loading || filesData.length === 0 || isShopOffline
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
        onClick={handleFinalizePrint}
        disabled={loading || filesData.length === 0 || isShopOffline}
      >
        {isShopOffline ? "Shop is Offline" : "Finalize My Print"}
      </button>
      <ToastContainer position="top-right" autoClose={5000} />
      <PrintStatusModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        currentStatus={printStatus}
      />
      {error && <p className="text-red-500 mt-4">{error}</p>}
    </div>
  );
};

export default Preview;