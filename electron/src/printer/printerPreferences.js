class PrinterPreferences {
    constructor() {
        this.store = null;
        this.initStore();
    }

    async initStore() {
        if (!this.store) {
            const { default: Store } = await import('electron-store');
            this.store = new Store({
                name: 'printer-preferences',
                encryptionKey: 'sbdLaKdljJgsGysbaguyc*&^*&nqbytnhibgas'
            });
        }
    }

    async addPrinterPreference(printerName, isColor, isBW, priority = 0) {
        await this.initStore();
        try {
            const preferences = this.store.get('preferences') || [];
            const existingIndex = preferences.findIndex(pref => pref.printerName === printerName);
            
            if (existingIndex !== -1) {
                preferences[existingIndex] = { printerName, isColor, isBW, priority };
            } else {
                preferences.push({ printerName, isColor, isBW, priority });
            }
            
            this.store.set('preferences', preferences);
            console.log(`Printer preference added/updated for ${printerName}`);
        } catch (error) {
            console.error('Failed to add printer preference:', error);
        }
    }


    async removePrinterPreference(printerName) {
        await this.initStore();
        try {
            const preferences = this.store.get('preferences') || [];
            const updatedPreferences = preferences.filter(pref => pref.printerName !== printerName);
            this.store.set('preferences', updatedPreferences);
            console.log(`Printer preference removed for ${printerName}`);
        } catch (error) {
            console.error('Failed to remove printer preference:', error);
        }
    }

    async getPrinterPreferences() {
        await this.initStore();

        try {
            return this.store.get('preferences') || [];
        } catch (error) {
            console.error('Failed to get printer preferences:', error);
            return [];
        }
    }

    async getPrinterForJob(isColorJob) {
        await this.initStore();
        try {
            const preferences = this.getPrinterPreferences();
            console.log('Current Printer Preferences:', preferences);
            const suitablePrinters = preferences.filter(p => isColorJob ? p.isColor : p.isBW);
            suitablePrinters.sort((a, b) => b.priority - a.priority);
            const printerNames = suitablePrinters.map(p => p.printerName);
            console.log(`Suitable printers for ${isColorJob ? 'color' : 'B&W'} job:`, printerNames);
            return printerNames;
        } catch (error) {
            console.error('Failed to get printer for job:', error);
            return [];
        }
    }

    async updatePrinterPriority(printerName, newPriority) {
        await this.initStore();
        try {
            const preferences = this.store.get('preferences') || [];
            const updatedPreferences = preferences.map(pref => 
                pref.printerName === printerName ? {...pref, priority: newPriority} : pref
            );
            this.store.set('preferences', updatedPreferences);
            console.log(`Priority updated for ${printerName} to ${newPriority}`);
        } catch (error) {
            console.error('Failed to update printer priority:', error);
        }
    }
}

module.exports = new PrinterPreferences();