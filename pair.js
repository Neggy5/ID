const express = require('express');
const fs = require('fs-extra');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const { upload } = require('./mega');
const { makeWASocket, useMultiFileAuthState, delay, Browsers, DisconnectReason } = require('@adiwajshing/baileys');

const router = express.Router();
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

const CONFIG = {
    AUTH_DIR: './auth_info_baileys',
    SESSION_MESSAGE: process.env.MESSAGE || `*SESSION GENERATED SUCCESSFULLY* ✅`
};

async function cleanupAuthDirectory() {
    try {
        await fs.emptyDir(CONFIG.AUTH_DIR);
    } catch (error) {
        logger.error(`Cleanup error: ${error.message}`);
    }
}

router.get('/', async (req, res) => {
    try {
        const phoneNumber = req.query.number;
        if (!phoneNumber || phoneNumber.replace(/[^0-9]/g, '').length < 11) {
            return res.status(400).json({ error: 'Valid phone number required' });
        }

        const { state, saveCreds } = await useMultiFileAuthState(CONFIG.AUTH_DIR);
        const socket = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: logger.child({ module: 'connection' }),
            browser: Browsers.macOS('Safari')
        });

        if (!socket.authState.creds.registered) {
            const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
            const pairingCode = await socket.requestPairingCode(cleanNumber);
            return res.json({ code: pairingCode });
        }

        socket.ev.on('creds.update', saveCreds);
        socket.ev.on('connection.update', async (update) => {
            if (update.connection === 'open') {
                try {
                    const sessionId = generateSessionId();
                    const megaUrl = await upload(
                        `${CONFIG.AUTH_DIR}/creds.json`,
                        `${sessionId}.json`
                    );
                    await socket.sendMessage(socket.user.id, { text: CONFIG.SESSION_MESSAGE });
                    await cleanupAuthDirectory();
                } catch (error) {
                    logger.error(`Session error: ${error.message}`);
                }
            }
        });

    } catch (error) {
        logger.error(`Route error: ${error.message}`);
        res.status(500).json({ error: 'Service unavailable' });
    }
});

function generateSessionId() {
    return Math.random().toString(36).substring(2, 8);
}

// Initialize on startup
cleanupAuthDirectory();

module.exports = router;