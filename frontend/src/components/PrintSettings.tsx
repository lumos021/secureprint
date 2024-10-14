import React from 'react';

interface PrintSettingsProps {
    printSettings: {
        copies: number;
        color: string;
        orientation: string;
        pagesPerSheet: string;
    };
    setPrintSettings: React.Dispatch<React.SetStateAction<{
        copies: number;
        color: string;
        orientation: string;
        pagesPerSheet: string;
    }>>;
    calculateTotalCost: () => number;
}

const PrintSettings: React.FC<PrintSettingsProps> = React.memo(({ printSettings, setPrintSettings, calculateTotalCost }) => {
    const handlePrintSettingsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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

    const isOrientationDisabled = printSettings.pagesPerSheet !== "1";

    return (
        <div className="mt-10 bg-white shadow-lg rounded-xl p-6 max-w-xl mx-auto transition-all duration-200">
            <h3 className="text-2xl font-bold mb-6 text-gray-800">Print Settings</h3>

            {/* Copies */}
            <div className="flex justify-between items-center mb-6">
                <label htmlFor="copies" className="text-base font-medium text-gray-700">Copies</label>
                <div className="flex items-center bg-gray-100 rounded-md overflow-hidden">
                    <button
                        onClick={() => handleCopiesChange(-1)}
                        className="px-3 py-1 bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors focus:outline-none active:scale-95"
                        aria-label="Decrease copies"
                    >
                        -
                    </button>
                    <input
                        id="copies"
                        type="number"
                        name="copies"
                        min="1"
                        value={printSettings.copies}
                        readOnly
                        className="w-12 text-center bg-transparent font-medium focus:outline-none"
                        aria-label="Number of copies"
                    />
                    <button
                        onClick={() => handleCopiesChange(1)}
                        className="px-3 py-1 bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors focus:outline-none active:scale-95"
                        aria-label="Increase copies"
                    >
                        +
                    </button>
                </div>
            </div>

            {/* Print Type */}
            <div className="mb-6">
                <fieldset>
                    <legend className="text-base font-medium text-gray-700 mb-2">Print Type</legend>
                    <div className="flex space-x-3">
                        {[
                            {
                                value: "b&w", label: "B&W", icon: (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                )
                            },
                            {
                                value: "color", label: "Color", icon: (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                                    </svg>
                                )
                            }
                        ].map(({ value, label, icon }) => (
                            <label key={value} className="flex-1">
                                <input
                                    type="radio"
                                    name="color"
                                    value={value}
                                    checked={printSettings.color === value}
                                    onChange={handlePrintSettingsChange}
                                    className="sr-only"
                                />
                                <div className={`flex items-center justify-center p-2 rounded-md transition-all cursor-pointer ${printSettings.color === value ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-blue-300'}`}>
                                    {icon}
                                    <span className="ml-2 font-medium text-sm">{label}</span>
                                </div>
                            </label>
                        ))}
                    </div>
                </fieldset>
            </div>

            {/* Orientation */}
            <div className="mb-6">
                <fieldset>
                    <legend className="text-base font-medium text-gray-700 mb-2">Orientation</legend>
                    <div className="flex space-x-3">
                        {[
                            {
                                value: "portrait", label: "Portrait", icon: (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                        <rect x="5" y="3" width="14" height="18" rx="2" strokeWidth="2" />
                                    </svg>
                                )
                            },
                            {
                                value: "landscape", label: "Landscape", icon: (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                        <rect x="3" y="5" width="18" height="14" rx="2" strokeWidth="2" />
                                    </svg>
                                )
                            }
                        ].map(({ value, label, icon }) => (
                            <label key={value} className={`flex-1 ${isOrientationDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                <input
                                    type="radio"
                                    name="orientation"
                                    value={value}
                                    checked={printSettings.orientation === value}
                                    onChange={handlePrintSettingsChange}
                                    disabled={isOrientationDisabled}
                                    className="sr-only"
                                />
                                <div className={`flex items-center justify-center p-2 rounded-md transition-all ${printSettings.orientation === value ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-green-300'}`}>
                                    {icon}
                                    <span className="ml-2 font-medium text-sm">{label}</span>
                                </div>
                            </label>
                        ))}
                    </div>
                </fieldset>
            </div>

            {/* Pages per Sheet */}
            <div className="mb-6">
                <fieldset>
                    <legend className="text-base font-medium text-gray-700 mb-2">Pages per Sheet</legend>
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            {
                                value: "1", label: "Normal", icon: (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                        <rect x="3" y="3" width="18" height="18" rx="2" />
                                    </svg>
                                )
                            },
                            {
                                value: "2", label: "2-in-1", icon: (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                        <rect x="3" y="3" width="18" height="8.5" rx="1" />
                                        <rect x="3" y="12.5" width="18" height="8.5" rx="1" />
                                    </svg>
                                )
                            },
                            {
                                value: "4", label: "4-in-1", icon: (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                        <rect x="3" y="3" width="8" height="8" rx="1" />
                                        <rect x="13" y="3" width="8" height="8" rx="1" />
                                        <rect x="3" y="13" width="8" height="8" rx="1" />
                                        <rect x="13" y="13" width="8" height="8" rx="1" />
                                    </svg>
                                )
                            },
                            {
                                value: "9", label: "9-in-1", icon: (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                        <rect x="3" y="3" width="5" height="5" rx="1" />
                                        <rect x="9.5" y="3" width="5" height="5" rx="1" />
                                        <rect x="16" y="3" width="5" height="5" rx="1" />
                                        <rect x="3" y="9.5" width="5" height="5" rx="1" />
                                        <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
                                        <rect x="16" y="9.5" width="5" height="5" rx="1" />
                                        <rect x="3" y="16" width="5" height="5" rx="1" />
                                        <rect x="9.5" y="16" width="5" height="5" rx="1" />
                                        <rect x="16" y="16" width="5" height="5" rx="1" />
                                    </svg>
                                )
                            }
                        ].map(({ value, label, icon }) => (
                            <label key={value}>
                                <input
                                    type="radio"
                                    name="pagesPerSheet"
                                    value={value}
                                    checked={printSettings.pagesPerSheet === value}
                                    onChange={handlePrintSettingsChange}
                                    className="sr-only"
                                />
                                <div className={`flex flex-col items-center p-2 rounded-md transition-all ${printSettings.pagesPerSheet === value ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                    {icon}
                                    <span className="mt-1 font-medium text-xs">{label}</span>
                                </div>
                            </label>
                        ))}
                    </div>
                </fieldset>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-800">Total cost:</h3>
                <p className="text-xl font-bold text-green-500">₹{calculateTotalCost()}</p>
            </div>
        </div>
    );
});

PrintSettings.displayName = 'PrintSettings';

export default PrintSettings;