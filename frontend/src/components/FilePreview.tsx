import React, { useEffect, useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import dynamic from 'next/dynamic';
import LoadingSpinner from './ui/LoadingSpinner';

const Document = dynamic(() => import('react-pdf').then(mod => mod.Document), { ssr: false });
const Page = dynamic(() => import('react-pdf').then(mod => mod.Page), { ssr: false });

interface FilePreviewProps {
  url: string;
  index: number;
  totalPages: number[];
  handleRemoveFile: (index: number) => void;
  pagesPerSheet: string;  // Add this prop
}

const FilePreview: React.FC<FilePreviewProps> = React.memo(({ url, index, totalPages, handleRemoveFile, pagesPerSheet }) => {
  const [numPages, setNumPages] = useState<number | null>(null);

  useEffect(() => {
    const loadPdfjs = async () => {
      const { pdfjs } = await import('react-pdf');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    };

    loadPdfjs();
  }, []);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  // Conditional rotation and size for landscape layout
  const isLandscape = pagesPerSheet === "2";
  const pageWidth = isLandscape ? 275 : 194;
  const pageHeight = isLandscape ? 275 : 275;

  return (
    <div className="flex flex-col gap-1 items-center m-2">
      <div
        className={`preview-container p-1 relative bg-white rounded-lg shadow-md ${pagesPerSheet === "2" ? 'landscape-preview-container' : ''
          }`}
      >

        <Document file={url} onLoadSuccess={onDocumentLoadSuccess} loading={<LoadingSpinner />}>
          <div className="flex items-center justify-center" style={{ height: '100%' }}>
          <Page 
              pageNumber={1} 
              width={pageWidth} 
              height={pageHeight} 
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
        <p className="text-md font-medium text-gray-900">File {index + 1} ({numPages || 'Loading...'} pages)</p>
      </div>
    </div>
  );
});

FilePreview.displayName = 'FilePreview';

export default FilePreview;
