import React, { createContext, useContext, useReducer, ReactNode, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Types
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

interface State {
  filesData: FileData[];
  selectedShop: Shop | null;
  sessionId: string | null;
  shopStatus: { [key: string]: boolean };
  shops: Shop[];
  showLocationMessage: boolean;
}

type Action =
  | { type: 'SET_FILES_DATA'; payload: FileData[] }
  | { type: 'ADD_FILES'; payload: FileData[] }
  | { type: 'REMOVE_FILE'; payload: number }
  | { type: 'CLEAR_FILES' }
  | { type: 'SET_SELECTED_SHOP'; payload: Shop | null }
  | { type: 'SET_SESSION_ID'; payload: string | null }
  | { type: 'SET_SHOP_STATUS'; payload: { [key: string]: boolean } }
  | { type: 'SET_SHOPS'; payload: Shop[] }
  | { type: 'SET_SHOW_LOCATION_MESSAGE'; payload: boolean };

// Reducer
const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'SET_FILES_DATA':
      return { ...state, filesData: action.payload };
    case 'ADD_FILES':
      return { ...state, filesData: [...state.filesData, ...action.payload] };
    case 'REMOVE_FILE':
      return { ...state, filesData: state.filesData.filter((_, i) => i !== action.payload) };
    case 'CLEAR_FILES':
      return { ...state, filesData: [] };
    case 'SET_SELECTED_SHOP':
      return { ...state, selectedShop: action.payload };
    case 'SET_SESSION_ID':
      return { ...state, sessionId: action.payload };
    case 'SET_SHOP_STATUS':
      return { ...state, shopStatus: action.payload };
    case 'SET_SHOPS':
      return { ...state, shops: action.payload };
    case 'SET_SHOW_LOCATION_MESSAGE':
      return { ...state, showLocationMessage: action.payload };
    default:
      return state;
  }
};

// Context
interface FileContextProps extends State {
  setFilesData: (files: FileData[]) => void;
  addFiles: (files: FileData[]) => void;
  removeFile: (index: number) => void;
  clearFiles: () => void;
  setSelectedShop: (shop: Shop | null) => void;
  setSessionId: (id: string | null) => void;
  setShopStatus: (status: { [key: string]: boolean }) => void;
  setShops: (shops: Shop[]) => void;
  setShowLocationMessage: (show: boolean) => void;
}

const FileContext = createContext<FileContextProps | undefined>(undefined);

export const useFileData = () => {
  const context = useContext(FileContext);
  if (!context) {
    throw new Error('useFileData must be used within a FileProvider');
  }
  return context;
};

// Provider
export const FileProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const initialState: State = {
    filesData: [],
    selectedShop: null,
    sessionId: null,
    shopStatus: {},
    shops: [],
    showLocationMessage: false,
  };

  const [state, dispatch] = useReducer(reducer, initialState);
  const shopHandledRef = useRef(false);
  const router = useRouter();

  const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  // Functions to dispatch actions
  const setFilesData = (files: FileData[]) => dispatch({ type: 'SET_FILES_DATA', payload: files });
  const addFiles = (files: FileData[]) => dispatch({ type: 'ADD_FILES', payload: files });
  const removeFile = (index: number) => dispatch({ type: 'REMOVE_FILE', payload: index });
  const clearFiles = () => dispatch({ type: 'CLEAR_FILES' });
  const setSelectedShop = (shop: Shop | null) => dispatch({ type: 'SET_SELECTED_SHOP', payload: shop });
  const setSessionId = (id: string | null) => dispatch({ type: 'SET_SESSION_ID', payload: id });
  const setShopStatus = (status: { [key: string]: boolean }) => dispatch({ type: 'SET_SHOP_STATUS', payload: status });
  const setShops = (shops: Shop[]) => dispatch({ type: 'SET_SHOPS', payload: shops });
  const setShowLocationMessage = (show: boolean) => dispatch({ type: 'SET_SHOW_LOCATION_MESSAGE', payload: show });

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
            setShopStatus({ [shopResponse.data.userId]: shopResponse.data.status });
            router.replace(router.pathname, undefined, { shallow: true });
            shopHandledRef.current = true;
            return;
          }

          if (shopResponse.data.message) {
            toast.error(shopResponse.data.message);
            shopHandledRef.current = false;
            await fetchShopsBasedOnLocation();
          }
        } else {
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
    
          setShopStatus(newShopStatus);
        }
      } catch (error) {
        console.error('Error fetching shops:', error);
      }
    };
    
    const fetchDefaultLocation = async () => {
      try {
        const response = await axios.get('https://ipapi.co/json/');
        return {
          lat: response.data.latitude,
          lng: response.data.longitude
        };
      } catch (error) {
        console.error('Error fetching default location:', error);
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

    fetchShopStatus();
    const interval = setInterval(fetchShopStatus, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <FileContext.Provider value={{ 
      ...state, 
      setFilesData,
      addFiles,
      removeFile,
      clearFiles,
      setSelectedShop,
      setSessionId,
      setShopStatus,
      setShops,
      setShowLocationMessage
    }}>
      {children}
    </FileContext.Provider>
  );
};