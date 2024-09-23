const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const uploadDir = path.join(__dirname, '..', 'uploads');

cron.schedule('0 */12 * * *', () => {
    console.log('Running cleanup of upload directory...');

    fs.readdir(uploadDir, (err, files) => {
        if (err) {
            console.error(`Failed to read directory: ${err.message}`);
            return;
        }

        files.forEach(file => {
            if (file !== 'blank.js') {
                const filePath = path.join(uploadDir, file);
                fs.unlink(filePath, (err) => {
                    if (err) {
                        console.error(`Failed to delete file: ${filePath}. Error: ${err.message}`);
                    } else {
                        console.log(`Deleted: ${filePath}`);
                    }
                });
            }
        });
    });

}, {
    timezone: "Asia/Kolkata"  
});

console.log('Cleanup cron job scheduled.');
