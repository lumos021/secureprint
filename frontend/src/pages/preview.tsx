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
import { debounce } from 'lodash';

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
  const [processingFiles, setProcessingFiles] = useState(new Set());
  const [mergedFileUrl, setMergedFileUrl] = useState<string | null>(null);
  const [printSettings, setPrintSettings] = useState({
    copies: 1,
    color: 'b&w',
    orientation: 'portrait',
    pagesPerSheet: '1'
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

  const processFiles = useCallback(debounce(async () => {
    if (filesData.length === 0) return;

    setLoading(true);

    try {
      const pagesPerSheetValue = parseInt(printSettings.pagesPerSheet, 10);

      const response = await axiosInstance.post('/api/files/process', {
        filenames: filesData.map(file => file.filename),
        printSettings: {
          ...printSettings,
          pagesPerSheet: pagesPerSheetValue,
        },
      });

      if (response.data.processedFiles && response.data.processedFiles.length > 0) {
        const processedUrls = response.data.processedFiles.map(filename =>
          `${apiUrl}/api/files/download/${filename}`
        );
        setProcessedFileUrls(processedUrls);
        setMergedFileUrl(null);
      } else {
        throw new Error('No processed files returned');
      }
    } catch (error) {
      setError('Error processing files: ' + error.message);
    } finally {
      setLoading(false);
      setProcessingFiles(new Set());
    }
  }, 300), [filesData, printSettings, axiosInstance, apiUrl]);



  useEffect(() => {
    // We only want to trigger this effect when filesData or printSettings change
    if (filesData.length > 0) {
      processFiles();
    }

    // Cleanup function to avoid repeated triggers
    return () => {
      processFiles.cancel();
    };
  }, [filesData, printSettings]);


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
        setLoading(true); // Set loading state while uploading
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
        console.error('Error uploading files:', error);
        setError('Error uploading files: ' + (error.response?.data?.message || error.message));
      } finally {
        setLoading(false);
      }
    }
  }, [addFiles, axiosInstance]);

  const handleFinalizePrint = useCallback(async () => {
    if (!selectedShop) {
      toast.error('Please select a shop before finalizing the print job.');
      return;
    }
    setPrintStatus('send');
    try {
      const pagesPerSheetValue = parseInt(printSettings.pagesPerSheet, 10);

      if (isNaN(pagesPerSheetValue) || ![1, 2, 4, 9].includes(pagesPerSheetValue)) {
        throw new Error('Invalid pagesPerSheet value. Supported values are 1, 2, 4, 9.');
      }

      const response = await axiosInstance.post('/api/files/finalize', {
        printSettings: {
          ...printSettings,
          pagesPerSheet: pagesPerSheetValue,
        },
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
      console.error('Error finalizing print job:', error);
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
    <div className="container mx-auto py-10 px-4 relative pb-20">
      <h2 className="text-3xl font-bold mb-8 text-center text-indigo-600">Printout Preview</h2>
      <div className="w-full flex overflow-x-auto whitespace-nowrap gap-4 pb-6 bg-gray-100 rounded-lg no-scrollbar">
        {loading ? (
          <div className="w-full flex justify-center">
            <LoadingSpinner />
          </div>
        ) : processedFileUrls.length > 0 ? (
          processedFileUrls.map((url, index) => (
            <div key={index} className="inline-block">
              <FilePreview
                url={url}
                index={index}
                totalPages={totalPages}
                handleRemoveFile={handleRemoveFile}
              />
            </div>
          ))
        ) : (
          <p className="text-center text-gray-600 w-full py-8">No files to preview</p>
        )}
      </div>


      {/* Desktop "Add files" button */}
      <div className="mt-4 hidden md:flex justify-center">
        <label className="flex items-center justify-center bg-indigo-600 text-white px-6 py-3 rounded-full cursor-pointer hover:bg-indigo-700 transition-colors shadow-md">
          <FaPlus size={20} className="mr-2" />
          Add files
          <input accept=".jpg,.jpeg,.png,.pdf" type="file" multiple className="hidden" onChange={handleAddFile} />
        </label>
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

      <div className="fixed bottom-6 right-6 z-50 md:hidden flex flex-col items-center">
        <div className="relative">
          <label className="fab relative bg-indigo-600 text-white rounded-full w-16 h-16 flex items-center justify-center shadow-lg transition-transform duration-300 ease-out active:scale-95 active:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400">
            <FaPlus size={28} />
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              multiple
              className="hidden"
              onChange={handleAddFile}
            />
            <span className="sr-only">Add files</span>
          </label>

          <span className="absolute top-16 left-1/2 transform -translate-x-1/2 mt-2 text-sm font-medium text-gray-800 bg-white px-3 py-1 rounded-full shadow-md opacity-0 transition-opacity duration-300 group-hover:opacity-100 active:opacity-100">
            Add files
          </span>
        </div>
      </div>




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
