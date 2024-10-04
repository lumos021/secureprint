import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';  // Import router here
import axios from 'axios';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css'; 

export interface FileData { 
  filename: string;
  originalname: string;
  path: string;
  size: number;
  mimetype: string;
  uploadDate: Date;
}

export interface Shop {
  userId: string;
  name: string;
  address: string;
  status: boolean;
  shopDetails: {
    location: { lat: number; lng: number };
  };
}

interface FileContextProps {
  filesData: FileData[];
  setFilesData: React.Dispatch<React.SetStateAction<FileData[]>>;
  addFiles: (files: FileData[]) => void;
  removeFile: (index: number) => void;
  clearFiles: () => void;
  selectedShop: Shop | null;
  setSelectedShop: React.Dispatch<React.SetStateAction<Shop | null>>;
  shopStatus: { [key: string]: boolean };
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  shops: Shop[];
  showLocationMessage:boolean
}

const FileContext = createContext<FileContextProps | undefined>(undefined);

export const useFileData = () => {
  const context = useContext(FileContext);
  if (!context) {
    throw new Error('useFileData must be used within a FileProvider');
  }
  return context;
};

export const FileProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [filesData, setFilesData] = useState<FileData[]>([]);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [shopStatus, setShopStatus] = useState<{ [key: string]: boolean }>({});
  const [shops, setShops] = useState<Shop[]>([]);
  const shopHandledRef = useRef(false);
  const router = useRouter();
  const [showLocationMessage, setShowLocationMessage] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  const addFiles = (files: FileData[]) => {
    setFilesData((prevFiles) => [...prevFiles, ...files]);
  };

  const removeFile = (index: number) => {
    setFilesData((prevFiles) => prevFiles.filter((_, i) => i !== index));
  };

  const clearFiles = () => {
    setFilesData([]);
  };

  useEffect(() => {
    if (!router.isReady) return;

    const fetchShopsAndStatus = async () => {
      try {
        const { shopId } = router.query;

        if (shopId) {
          const shopResponse = await axios.get(`${apiUrl}/api/shop`, { params: { shopId } });

          if (shopResponse.data && !shopResponse.data.message) {
            setSelectedShop(shopResponse.data);
            setShops([shopResponse.data]);  
            setShopStatus((prevStatus) => ({
              ...prevStatus,
              [shopResponse.data.userId]: shopResponse.data.status,
            }));
            router.replace(router.pathname, undefined, { shallow: true });
            shopHandledRef.current = true; // Mark that shop was handled
            return;  
          }

          // Handle case when the shopId is invalid or not found
          if (shopResponse.data.message) {
            toast.error(shopResponse.data.message);
            shopHandledRef.current = false; // Mark that shop was not handled
            await fetchShopsBasedOnLocation(); // Fetch shops based on location
          }
        } else {
          // If no shopId is present, fetch shops based on location
          await fetchShopsBasedOnLocation();
        }
      } catch (error) {
        console.log('Failed to fetch shops');
      }
    };

    const fetchShopsBasedOnLocation = async () => {
      try {
        if (!shopHandledRef.current) {
          let userLocation = null;
          if ('geolocation' in navigator) {
            try {
              const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                  timeout: 10000,
                  maximumAge: 0,
                  enableHighAccuracy: true
                });
              });
              userLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
              };
              setShowLocationMessage(false);
            } catch (geoError) {
              console.error('Geolocation error:', geoError);
              if (geoError.code === 1) {
                setShowLocationMessage(true);
              } else {
                console.log('Failed to fetch location. Using default location.');
              }
              userLocation = await fetchDefaultLocation();
            }
          } else {
            toast.warn('Geolocation not supported. Using default location.');
            userLocation = await fetchDefaultLocation();
          }
    
          const shopsResponse = await axios.get(`${apiUrl}/api/shops`, {
            params: userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : {}
          });
          setShops(shopsResponse.data.shops);
          const newShopStatus = shopsResponse.data.shops.reduce((statusObj, shop) => {
            statusObj[shop.userId] = shop.status;
            return statusObj;
          }, {});
    
          setShopStatus((prevStatus) => ({
            ...prevStatus,
            ...newShopStatus,
          }));
        }
      } catch (error) {
        console.error('Error fetching shops:', error);
      }
    };
    
    // Function to fetch a default location (e.g., based on IP)
    const fetchDefaultLocation = async () => {
      try {
        const response = await axios.get('https://ipapi.co/json/');
        return {
          lat: response.data.latitude,
          lng: response.data.longitude
        };
      } catch (error) {
        console.error('Error fetching default location:', error);
        // Return a hardcoded default location as a last resort
        return { lat: 0, lng: 0 };
      }
    };

    if (router.pathname === '/') {
      fetchShopsAndStatus();
    }
  }, [router.isReady, router.query]);

  useEffect(() => {
    const fetchShopStatus = async () => {
      try {
        const response = await axios.get(`${apiUrl}/api/shop-status`);
        setShopStatus(response.data);
      } catch (error) { 
        console.log('Failed to fetch shop status');
      }
    };

    fetchShopStatus(); // Initial fetch
    const interval = setInterval(fetchShopStatus, 30000); // Poll every 30 seconds

    return () => clearInterval(interval); // Cleanup on unmount
  }, []);

  return (
    <FileContext.Provider value={{ 
      filesData, 
      setFilesData, 
      addFiles, 
      removeFile, 
      clearFiles, 
      selectedShop, 
      setSelectedShop, 
      sessionId, 
      setSessionId, 
      shopStatus,
      shops,
      showLocationMessage,
    }}>
      {children}
    </FileContext.Provider>
  );
};
