const express = require('express');
const router = express.Router();
const { toBuffer } = require('qrcode');
const fs = require('fs-extra');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const { makeWASocket, useMultiFileAuthState, delay, Browsers, DisconnectReason } = require('@adiwajshing/baileys');

const logger = pino({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: process.env.NODE_ENV !== 'production' ? {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard'
        }
    } : undefined
});

// Clean auth directory on startup
fs.emptyDirSync('./auth_info_baileys');

router.get('/', async (req, res) => {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
        const socket = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            browser: Browsers.macOS("Desktop")
        });

        socket.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr && !res.headersSent) {
                try {
                    res.setHeader('Content-Type', 'image/png');
                    res.end(await toBuffer(qr));
                } catch (error) {
                    logger.error("QR generation error:", error);
                    if (!res.headersSent) res.status(500).send("QR generation failed");
                }
                return;
            }

            if (connection === "open") {
                await handleSuccessfulConnection(socket, saveCreds);
            }

            if (connection === "close") {
                await handleDisconnection(lastDisconnect);
            }
        });

        socket.ev.on('creds.update', saveCreds);

    } catch (err) {
        logger.error("Initialization error:", err);
        if (!res.headersSent) res.status(500).send("Initialization failed");
    }
});

async function handleSuccessfulConnection(socket, saveCreds) {
    await delay(3000);
    try {
        const sessionId = generateSessionId();
        const megaUrl = await require('./mega').upload(
            './auth_info_baileys/creds.json',
            `${sessionId}.json`
        );
        logger.info(`Session created: ${megaUrl}`);
        await fs.emptyDir('./auth_info_baileys');
    } catch (err) {
        logger.error("Session handling error:", err);
    }
}

function generateSessionId() {
    return Math.random().toString(36).substring(2, 8);
}

async function handleDisconnection(lastDisconnect) {
    const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
    logger.warn(`Disconnected: ${reason}`);
}

module.exports = router;