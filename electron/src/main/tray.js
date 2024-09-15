const { Tray, Menu, app } = require('electron');
const path = require('path');

function createTray(mainWindow) {
  const tray = new Tray(path.join(__dirname, 'icon.ico'));
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Show App', 
      click: () => mainWindow.show() 
    },
    { 
      label: 'Quit', 
      click: () => app.quit() 
    }
  ]);
  
  tray.setToolTip('Secureprint App');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });

  return tray;
}

module.exports = { createTray };