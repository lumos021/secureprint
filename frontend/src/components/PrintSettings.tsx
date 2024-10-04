import React from 'react';

interface PrintSettingsProps {
  printSettings: {
    copies: number;
    color: string;
    orientation: string;
  };
  setPrintSettings: React.Dispatch<React.SetStateAction<{
    copies: number;
    color: string;
    orientation: string;
  }>>;
  calculateTotalCost: () => number;
}

const PrintSettings: React.FC<PrintSettingsProps> = React.memo(({ printSettings, setPrintSettings, calculateTotalCost }) => {
  const handlePrintSettingsChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setPrintSettings(prevSettings => ({
      ...prevSettings,
      [name]: value,
    }));
  };

  const handleCopiesChange = (delta: number) => {
    setPrintSettings(prevSettings => ({
      ...prevSettings,
      copies: Math.max(1, prevSettings.copies + delta),
    }));
  };

  return (
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
        <p className="text-xl font-bold text-green-500">₹{calculateTotalCost()}</p>
      </div>
    </div>
  );
});

export default PrintSettings;