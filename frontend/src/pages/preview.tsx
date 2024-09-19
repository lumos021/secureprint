import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useFileData, FileData } from '../context/FileContext';
import axios from 'axios';
// import { Document, Page, pdfjs } from 'react-pdf';
import { FaTimes, FaPlus } from 'react-icons/fa';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import PrintStatusModal from '../components/PrintStatusModal';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import dynamic from 'next/dynamic';
const Document = dynamic(() => import('react-pdf').then(mod => mod.Document), { ssr: false });
const Page = dynamic(() => import('react-pdf').then(mod => mod.Page), { ssr: false });

// pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const Preview: React.FC = () => {
  const router = useRouter();
  const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const { filesData, addFiles, removeFile, clearFiles, selectedShop, sessionId, setSessionId, shopStatus } = useFileData();
  const [fileUrls, setFileUrls] = useState<string[]>([]);
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
    baseURL: 'http://localhost:5000',
    headers: {
      'X-Session-ID': sessionId || '',
    },
  }), [sessionId]);
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setPrintStatus(null);
  };

  useEffect(() => {
    if (printStatus) {
      setIsModalOpen(true);
    }
  }, [printStatus]);


useEffect(() => {
  if (typeof Promise.withResolvers === 'undefined') {
    // @ts-expect-error This does not exist outside of polyfill which this is doing
    window.Promise.withResolvers = function () {
      let resolve, reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }
}, []);


  useEffect(() => {
    const loadPdfjs = async () => {
      const { pdfjs } = await import('react-pdf');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    };

    loadPdfjs();
  }, []);

  useEffect(() => {
    if (filesData.length > 0) {
      const urls = filesData.map(file => `${apiUrl}/${file.path}`);
      setFileUrls(urls);
      setTotalPages(Array(filesData.length).fill(0));

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

    const debouncedProcessFiles = debounce(processFiles, 500);

    debouncedProcessFiles();

    return () => {
      isMounted = false;
      debouncedProcessFiles.cancel();
    };
  }, [filesData, printSettings, axiosInstance]);

  const handlePrintSettingsChange = useCallback((event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setPrintSettings(prevSettings => ({
      ...prevSettings,
      [name]: value,
    }));
  }, []);

  const handleCopiesChange = useCallback((delta: number) => {
    setPrintSettings(prevSettings => ({
      ...prevSettings,
      copies: Math.max(1, prevSettings.copies + delta),
    }));
  }, []);

  const calculateTotalCost = useMemo(() => {
    const costPerPage = pricePerPage[printSettings.color];
    const totalPagesSum = totalPages.reduce((sum, pages) => sum + pages, 0);
    return printSettings.copies * totalPagesSum * costPerPage;
  }, [printSettings, totalPages, pricePerPage]);

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

        // We don't need to set the sessionId here anymore, as it's set in the UploadForm
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
        // const finalFilename = response.data.finalFilename;
        // alert('Print job successfully finalized and files cleaned up');
        setPrintStatus('process');
      // Simulate server processing time
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setPrintStatus('shopSend');
      // Simulate sending to shop time
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setPrintStatus('print');
      // Simulate printing time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      setPrintStatus('delete');
      // Simulate secure deletion time
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      toast.success('Files printed successfully and securely deleted from server!');
      } else {
        // alert('Error finalizing print job');
        toast.info(response.data.message);

      }
    } catch (error) {
      toast.error('Error finalizing print job');
    } finally {
      clearFiles();
      setSessionId(null);  // Clear the session ID
      router.push('/');
    }
  }, [filesData, printSettings, selectedShop, axiosInstance, clearFiles, setSessionId, router]);

  const debounce = (func: Function, delay: number): (() => void) & { cancel: () => void } => {
    let timer: NodeJS.Timeout;
    const debouncedFunction = (...args: any[]) => {
      clearTimeout(timer);
      timer = setTimeout(() => func.apply(this, args), delay);
    };

    debouncedFunction.cancel = () => {
      clearTimeout(timer);
    };

    return debouncedFunction;
  };
  // Check if the selected shop is offline
  const isShopOffline = useMemo(() => {
    return selectedShop && shopStatus[selectedShop.userId] === false;
  }, [selectedShop, shopStatus]);

  return (
    <div className="container mx-auto py-10 px-4">
      <h2 className="text-3xl font-bold mb-8 text-center text-indigo-600">Printout Preview</h2>
      <div className="w-full overflow-x-scroll flex items-center gap-6 justify-start pb-6 bg-gray-100 rounded-lg no-scrollbar">
        {loading ? (
          <p className="text-center text-gray-600">Loading file preview...</p>
        ) : (
          processedFileUrls.length > 0 ? (
            processedFileUrls.map((url, index) => (
              <div key={index} className="self-start flex flex-col gap-1 items-center mt-5 mb-3 first:ml-auto pl-6">
                <div className="preview-container p-1 relative bg-white rounded-lg shadow-md">
                  <Document
                    file={url}
                    onLoadSuccess={({ numPages }) => {
                      const newTotalPages = [...totalPages];
                      newTotalPages[index] = numPages;
                      setTotalPages(newTotalPages);
                    }}
                    onLoadError={(error) => {
                      setError('Error loading document');
                    }}
                  >
                    <div className="flex items-center justify-center" style={{ height: '100%' }}>
                      <Page
                        pageNumber={1}
                        width={194}
                        height={275}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />
                    </div>
                  </Document>
                  <button
                    className="absolute top-1 right-1 p-1 cursor-pointer bg-gray-200 text-gray-600 rounded-full shadow-sm hover:bg-gray-300"
                    onClick={() => handleRemoveFile(index)}
                  >
                    <FaTimes size={16} />
                  </button>
                </div>
                <div className="w-full text-center">
                  <p className="text-md font-medium text-gray-900">File {index + 1} ({totalPages[index] || 'Loading...'} pages)</p>
                </div>
              </div>
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
      <div className="mt-10 bg-white shadow-md rounded-lg p-6 max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold mb-4 text-indigo-600">Print Settings</h3>
        <div className="mb-4 flex justify-between items-center">
          <label htmlFor="copies" className="block mb-2 font-medium">Copies</label>
          <div className="flex items-center">
            <button onClick={() => handleCopiesChange(-1)} className="bg-gray-300 text-black px-3 py-2 rounded hover:bg-gray-400 transition-colors">-</button>
            <input
              type="number"
              id="copies"
              name="copies"
              min="1"
              value={printSettings.copies}
              onChange={handlePrintSettingsChange}
              readOnly
              className="mx-2 border rounded w-16 text-center"
            />
            <button onClick={() => handleCopiesChange(1)} className="bg-gray-300 text-black px-3 py-2 rounded hover:bg-gray-400 transition-colors">+</button>
          </div>
        </div>
        <div className="mb-4 flex justify-between items-center">
          <label htmlFor="color" className="block mb-2 font-medium">Print Type</label>
          <select
            id="color"
            name="color"
            value={printSettings.color}
            onChange={handlePrintSettingsChange}
            className="border rounded p-2 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <option value="b&w">Black & White</option>
            <option value="color">Color</option>
          </select>
        </div>
        <div className="mb-4 flex justify-between items-center">
          <label htmlFor="orientation" className="block mb-2 font-medium">Orientation</label>
          <select
            id="orientation"
            name="orientation"
            value={printSettings.orientation}
            onChange={handlePrintSettingsChange}
            className="border rounded p-2 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </div>
        <div className="border-t border-gray-200 pt-4 mt-4 flex justify-between items-center">
          <h3 className="text-lg font-bold text-gray-900">Total cost:</h3>
          <p className="text-xl font-bold text-green-500">₹{calculateTotalCost}</p>
        </div>
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
          onClose={handleCloseModal}
          currentStatus={printStatus}
        />
        {error && <p className="text-red-500 mt-4">{error}</p>}
      </div>
    </div>
  );
};

export default Preview;