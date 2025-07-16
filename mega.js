const mega = require('megajs');
const fs = require('fs-extra');
const pino = require('pino');

const logger = pino({
    level: 'info',
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard'
        }
    }
});

async function upload(filePath, fileName) {
    try {
        const storage = await new mega.Storage({
            email: process.env.MEGA_EMAIL,
            password: process.env.MEGA_PASSWORD
        }).ready;

        const file = await storage.upload(fileName, fs.createReadStream(filePath)).complete;
        const url = await file.link();
        storage.close();
        return url;
    } catch (error) {
        logger.error(`Mega upload failed: ${error.message}`);
        throw error;
    }
}

module.exports = { upload };