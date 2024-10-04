import React from 'react';
import { GetServerSideProps } from 'next';
import UploadForm from '../components/UploadForm';
import ShopSelector from '../components/ShopSelector';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import axios from 'axios';
import { Shop } from '../context/FileContext';

interface HomeProps {
  initialShops: Shop[];
}

const Home: React.FC<HomeProps> = ({ initialShops }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 to-indigo-200">
      <div className="container mx-auto px-4 py-12">
        <header className="text-center mb-12">
          <h1 className="text-5xl font-bold text-indigo-600 mb-4">Secureprint</h1>
          <p className="text-xl text-gray-700">Safe & Secure printouts at your fingertips</p>
        </header>

        <div className="bg-white rounded-lg shadow-md p-8 max-w-2xl mx-auto">
          <ShopSelector initialShops={initialShops} />
          <UploadForm />
          <ToastContainer />
        </div>
      </div>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = async () => {
  const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  
  try {
    const response = await axios.get(`${apiUrl}/api/shops`);
    const initialShops = response.data.shops;

    return {
      props: {
        initialShops,
      },
    };
  } catch (error) {
    console.error('Error fetching initial shops:', error);
    return {
      props: {
        initialShops: [],
      },
    };
  }
};

export default Home;