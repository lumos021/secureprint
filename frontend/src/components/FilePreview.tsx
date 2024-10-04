import React, { useEffect } from 'react';
import { FaTimes } from 'react-icons/fa';
import dynamic from 'next/dynamic';
import LoadingSpinner from './ui/LoadingSpinner';

// Dynamically import react-pdf components without SSR
const Document = dynamic(() => import('react-pdf').then(mod => mod.Document), { ssr: false });
const Page = dynamic(() => import('react-pdf').then(mod => mod.Page), { ssr: false });

interface FilePreviewProps {
  url: string;
  index: number;
  totalPages: number[];
  handleRemoveFile: (index: number) => void;
}

const FilePreview: React.FC<FilePreviewProps> = React.memo(({ url, index, totalPages, handleRemoveFile }) => {
  useEffect(() => {
    const loadPdfjs = async () => {
      const { pdfjs } = await import('react-pdf');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    };

    loadPdfjs();
  }, []);

  return (
    <div className="self-start flex flex-col gap-1 items-center mt-5 mb-3 first:ml-auto pl-6">
      <div className="preview-container p-1 relative bg-white rounded-lg shadow-md">
        <Document file={url} loading={<LoadingSpinner />}>
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
  );
});

export default FilePreview;
