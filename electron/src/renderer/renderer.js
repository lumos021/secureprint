// DOM element references
const elements = {
  loginScreen: document.getElementById('login-screen'),
  registrationScreen: document.getElementById('registration-screen'),
  mainApp: document.getElementById('main-app'),
  loginForm: document.getElementById('login-form'),
  registrationForm: document.getElementById('registration-form'),
  logWindow: document.getElementById('logWindow'),
  statusEl: document.getElementById('status'),
  printerSelect: document.getElementById('printers'),
  setPrinterBtn: document.getElementById('setPrinter'),
  queueList: document.getElementById('queueList'),
  darkModeToggle: document.getElementById('darkModeToggle'),
  refreshPrintersBtn: document.getElementById('refreshPrinters'),
  showRegisterButton: document.getElementById('showRegister'),
  showLoginButton: document.getElementById('showLogin'),
  isShopCheckbox: document.getElementById('isShop'),
  shopDetailsDiv: document.getElementById('shop-details'),
  getLocationBtn: document.getElementById('getLocationBtn'),
  latitudeInput: document.getElementById('latitude'),
  longitudeInput: document.getElementById('longitude'),
  logoutButton: document.getElementById('logoutButton'),
  loginError: document.getElementById('loginError'),
  registrationError: document.getElementById('registrationError'),
  usernameInput: document.getElementById('username'),
  passwordInput: document.getElementById('password'),
  nameInput: document.getElementById('name'),
  emailInput: document.getElementById('email'),
  registerPasswordInput: document.getElementById('register-password'),
  addressInput: document.getElementById('address'),
  printerList: document.getElementById('printerList'),
  addPrinterBtn: document.getElementById('addPrinterBtn'),
  addPrinterModal: document.getElementById('addPrinterModal'),
  addPrinterForm: document.getElementById('addPrinterForm'),
  printerSelectModal: document.getElementById('printerSelect'),
  isColorCheckbox: document.getElementById('isColorCheckbox'),
  isBWCheckbox: document.getElementById('isBWCheckbox'),
  cancelAddPrinter: document.getElementById('cancelAddPrinter'),
  priorityInput: document.getElementById('priorityInput'),
  statusError: document.getElementById('statusError'),
};

const updatePrintStats = async () => {
  try {
    const stats = await window.electron.invoke('get-daily-stats');
    document.getElementById('totalPages').textContent = stats.totalPages || 0;
    document.getElementById('colorPages').textContent = stats.colorPages || 0;
    document.getElementById('bwPages').textContent = stats.bwPages || 0;
  } catch (error) {
    console.error('Failed to fetch print statistics:', error);
  }
};

const updatePrinterStatus = async () => {
  try {
    const { statusEl } = elements;

    if (!statusEl) {
      console.error('statusEl is undefined');
      return;
    }

    const printerStatus = await window.electron.invoke('printer-status');  // Ensure this IPC method exists

    if (printerStatus) {
      const { status } = printerStatus;
      statusEl.innerHTML = `<i class="fas fa-info-circle mr-2"></i>Printer Status: ${status}`;
    } else {
      statusEl.textContent = 'Printer Status: Unknown';
    }
  } catch (error) {
    console.error('Failed to fetch printer status:', error);
  }
};


// Helper functions
const setDarkMode = (isDark) => {
  document.documentElement.classList.toggle('dark', isDark);
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
};

const showError = (type, message) => {
  if (type === 'status') {
    // Use a different method to display status errors
    elements.statusEl.textContent = `Error: ${message}`;
    elements.statusEl.classList.add('error');
  } else {
    const errorElement = elements[`${type}Error`];
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.classList.remove('hidden');
    } else {
      console.error(`Error element for type '${type}' not found.`);
      alert(`${type} Error: ${message}`);
    }
  }
};

const clearErrors = () => {
  elements.loginError.classList.add('hidden');
  elements.registrationError.classList.add('hidden');
};

const showScreen = (screenName) => {
  ['loginScreen', 'registrationScreen', 'mainApp'].forEach(screen => {
      elements[screen].classList.toggle('hidden', screen !== screenName);
  });
  clearErrors();
};

// Event handlers
const handleLogin = async (event) => {
  event.preventDefault();
  clearErrors();
  
  const { usernameInput, passwordInput } = elements;
  
  if (!usernameInput || !passwordInput) {
    console.error('Email or password input not found');
    showError('login', 'Email or password input not found.');
    return;
  }
  
  const email = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  
  if (!email || !password) {
    showError('login', 'Please enter both email and password.');
    return;
  }
  
  try {
    const response = await window.electron.invoke('login', { 
      email, 
      password 
    });
    
    if (response.success) {
      showScreen('mainApp');
    } else {
      showError('login', `Login failed: ${response.error}`);
    }
  } catch (error) {
    console.error('Login error details:', error);  
    showError('login', 'An error occurred during login. Please try again.');
  }
};


const handleRegistration = async (event) => {
  event.preventDefault();
  clearErrors();
  const { nameInput, emailInput, registerPasswordInput, addressInput, isShopCheckbox, latitudeInput, longitudeInput } = elements;
  
  const registrationData = {
      name: nameInput.value,
      email: emailInput.value,
      password: registerPasswordInput.value,
      address: addressInput.value,
      isShop: isShopCheckbox.checked
  };

  if (registrationData.isShop) {
      registrationData.shopDetails = {
          location: {
              lat: parseFloat(latitudeInput.value),
              lng: parseFloat(longitudeInput.value)
          }
      };
  }

  try {
      const result = await window.electron.invoke('register-client', registrationData);
      if (result.success) {
          showScreen('loginScreen');
          showError('login', 'Registration successful! Please log in.');
      } else {
          showError('registration', `Registration failed: ${result.error}`);
      }
  } catch (error) {
      showError('registration', 'An error occurred during registration. Please try again.');
  }
};

const handleDarkModeToggle = () => {
  const isDarkMode = document.documentElement.classList.toggle('dark');
  setDarkMode(isDarkMode);
};

const handleRefreshPrinters = async () => {
  try {
      const printers = await window.electron.requestPrinterList();
      elements.printerSelect.innerHTML = printers.map(printer => 
          `<option value="${printer.name}">${printer.name}</option>`
      ).join('');
  } catch (error) {
      showError('status', 'Failed to refresh printer list. Please try again.');
  }
};

const handleSetPrinter = async () => {
  const selectedPrinter = elements.printerSelect.value;
  try {
      await window.electron.selectPrinter(selectedPrinter);
      elements.statusEl.textContent = `Status: ${selectedPrinter} set as default printer.`;
  } catch (error) {
      showError('status', 'Failed to set printer. Please try again.');
  }
};

const handleQueueUpdate = (queue) => {
  // console.log('Queue update received:', queue);  // Debugging log

  // Ensure the queue is an array and not undefined or null
  if (Array.isArray(queue) && queue.length > 0) {
    elements.queueList.innerHTML = queue.map(job => 
        `<li class="mb-1 p-2 bg-white dark:bg-gray-600 ">
            Job ${job.jobId} - ${job.printerName || 'Unknown Printer'} - ${job.status || 'unknown'}
        </li>`
    ).join('');
  } else {
    elements.queueList.innerHTML = '<li class="mb-1 p-2 bg-white dark:bg-gray-600 ">No jobs in the queue</li>';
  }

  updatePrintStats();
};


const handleLogMessage = (message) => {
  const logEntry = document.createElement('div');
  logEntry.textContent = message;

  const logLevel = message.match(/\[(.*?)\]/)?.[1].toLowerCase() || 'default';
  const logClasses = {
      debug: 'text-debug-light dark:text-debug-dark',
      info: 'text-info-light dark:text-info-dark',
      warn: 'text-warn-light dark:text-warn-dark',
      error: 'text-error-light dark:text-error-dark',
      default: 'text-black dark:text-white'
  };

  logEntry.className = logClasses[logLevel] || logClasses.default;
  elements.logWindow.appendChild(logEntry);
  elements.logWindow.scrollTop = elements.logWindow.scrollHeight;
};

const handleShopCheckboxChange = () => {
  const isShop = elements.isShopCheckbox.checked;
  elements.shopDetailsDiv.classList.toggle('hidden', !isShop);
  elements.latitudeInput.required = isShop;
  elements.longitudeInput.required = isShop;
  if (!isShop) {
      elements.latitudeInput.value = '';
      elements.longitudeInput.value = '';
  }
};

const handleGetLocation = () => {
  if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
          (position) => {
              elements.latitudeInput.value = position.coords.latitude;
              elements.longitudeInput.value = position.coords.longitude;
          },
          (error) => {
              const errorMessages = {
                  1: 'Permission denied. Please enable location services.',
                  2: 'Location information is unavailable.',
                  3: 'The request to get user location timed out.'
              };
              showError('registration', errorMessages[error.code] || 'An unknown error occurred.');
          },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
  } else {
      showError('registration', 'Geolocation is not supported by your browser. Please enter location manually.');
  }
};

const handleLogout = async () => {
  try {
      await window.electron.invoke('logout');
      elements.logWindow.innerHTML = '';
      elements.queueList.innerHTML = '';
      showScreen('loginScreen');
  } catch (error) {
      console.error('Logout failed:', error);
  }
};

// Event listeners
elements.loginForm.addEventListener('submit', handleLogin);
elements.registrationForm.addEventListener('submit', handleRegistration);
elements.darkModeToggle.addEventListener('click', handleDarkModeToggle);
elements.refreshPrintersBtn.addEventListener('click', handleRefreshPrinters);
elements.setPrinterBtn.addEventListener('click', handleSetPrinter);
elements.showRegisterButton.addEventListener('click', () => showScreen('registrationScreen'));
elements.showLoginButton.addEventListener('click', () => showScreen('loginScreen'));
elements.isShopCheckbox.addEventListener('change', handleShopCheckboxChange);
elements.getLocationBtn.addEventListener('click', handleGetLocation);
elements.logoutButton.addEventListener('click', handleLogout);
elements.addPrinterBtn.addEventListener('click', showAddPrinterModal);
elements.addPrinterForm.addEventListener('submit', handleAddPrinterPreference);
elements.cancelAddPrinter.addEventListener('click', hideAddPrinterModal);

async function showAddPrinterModal() {
  try {
    const printers = await window.electron.invoke('request-printer-list');
    elements.printerSelectModal.innerHTML = printers.map(printer => 
      `<option value="${printer.name}">${printer.name}${printer.isDefault ? ' (Default)' : ''}</option>`
    ).join('');
    elements.addPrinterModal.classList.remove('hidden');
  } catch (error) {
    console.error('Failed to load printer list:', error);
    elements.statusEl.textContent = 'Failed to load printer list. Please try again.';
    elements.statusEl.classList.add('error');
  }
}

function hideAddPrinterModal() {
  elements.addPrinterModal.classList.add('hidden');
}

async function handleAddPrinterPreference(event) {
  event.preventDefault();
  const printerName = elements.printerSelectModal.value;
  const isColor = elements.isColorCheckbox.checked;
  const isBW = elements.isBWCheckbox.checked;
  const priority = parseInt(elements.priorityInput.value, 10) || 0;

  try {
    await window.electron.invoke('add-printer-preference', { printerName, isColor, isBW, priority });
    hideAddPrinterModal();
    await refreshPrinterPreferences();
  } catch (error) {
    showError('status', 'Failed to add printer preference. Please try again.');
  }
}

async function refreshPrinterPreferences() {
  try {
    const preferences = await window.electron.invoke('get-printer-preferences');
    elements.printerList.innerHTML = preferences.map(pref => `
      <div class="bg-gray-100 dark:bg-gray-700 rounded-md p-4 flex justify-between items-center">
        <div>
          <h3 class="font-semibold">${pref.printerName}</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            ${pref.isColor ? 'Color' : ''}
            ${pref.isColor && pref.isBW ? ' & ' : ''}
            ${pref.isBW ? 'Black & White' : ''}
          </p>
          <p class="text-sm text-gray-500 dark:text-gray-400">Priority: ${pref.priority}</p>
        </div>
        <div>
          <button onclick="updatePrinterPriority('${pref.printerName}')" class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 mr-2">
            <i class="fas fa-edit"></i>
          </button>
          <button onclick="removePrinterPreference('${pref.printerName}')" class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    showError('status', 'Failed to refresh printer preferences. Please try again.');
  }
}

async function removePrinterPreference(printerName) {
  try {
    await window.electron.invoke('remove-printer-preference', printerName);
    await refreshPrinterPreferences();
  } catch (error) {
    showError('status', 'Failed to remove printer preference. Please try again.');
  }
}

async function updatePrinterPriority(printerName) {
  const newPriority = prompt(`Enter new priority for ${printerName}:`);
  if (newPriority !== null) {
    try {
      await window.electron.invoke('update-printer-priority', { printerName, priority: parseInt(newPriority, 10) });
      await refreshPrinterPreferences();
    } catch (error) {
      showError('status', 'Failed to update printer priority. Please try again.');
    }
  }
}




// Electron event listeners
window.electron.receive('queue-update', handleQueueUpdate);
window.electron.receive('log-message', handleLogMessage);

// Initialize app
const initializeApp = async () => {
  // Set initial dark mode
  const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
  setDarkMode(localStorage.theme === 'dark' || (!('theme' in localStorage) && prefersDarkMode));

  // Watch for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => setDarkMode(e.matches));

  // Check authentication and show appropriate screen
  const isAuthenticated = await window.electron.checkAuth();
  showScreen(isAuthenticated ? 'mainApp' : 'loginScreen');

  // Refresh printers on initial load
  await refreshPrinterPreferences();
  handleRefreshPrinters();
  updatePrinterStatus();
  updatePrintStats();

};

document.addEventListener('DOMContentLoaded', () => {
  setInterval(updatePrintStats, 60000); 
  initializeApp();
});