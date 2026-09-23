import makeWASocketPkg, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const makeWASocket = makeWASocketPkg.default || makeWASocketPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_SESSION_DIR = path.resolve(__dirname, '../whatsapp_session');
const SESSION_DIR = process.env.WHATSAPP_SESSION_PATH || (
  (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT)
    ? path.join(os.tmpdir(), 'whatsapp_session')
    : DEFAULT_SESSION_DIR
);

// In-memory status state
let sock = null;
let connectionStatus = 'DISCONNECTED'; // 'DISCONNECTED' | 'CONNECTING' | 'SCAN_QR' | 'CONNECTED'
let currentQrDataUrl = null;
let connectedUser = null;
let isInitializing = false;

const logger = pino({ level: 'silent' });

export function getWhatsAppStatus() {
  return {
    status: connectionStatus,
    isConnected: connectionStatus === 'CONNECTED',
    qrCode: currentQrDataUrl,
    user: connectedUser
  };
}

export function formatToWhatsAppJid(phone) {
  if (!phone) return null;
  let clean = String(phone).replace(/\D/g, '');

  if (clean.startsWith('03') && clean.length === 11) {
    clean = '92' + clean.slice(1);
  } else if (clean.startsWith('3') && clean.length === 10) {
    clean = '92' + clean;
  }

  if (!clean || clean.length < 7) {
    return null;
  }

  return `${clean}@s.whatsapp.net`;
}

export async function initWhatsApp(forceRestart = false) {
  if (isInitializing && !forceRestart) {
    return getWhatsAppStatus();
  }

  if (sock && connectionStatus === 'CONNECTED' && !forceRestart) {
    return getWhatsAppStatus();
  }

  isInitializing = true;
  connectionStatus = 'CONNECTING';

  try {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 1015901307],
      isLatest: true
    }));

    console.log(`📱 Initializing Baileys WhatsApp Web (v${version.join('.')})...`);

    if (sock) {
      try {
        sock.ev.removeAllListeners();
        sock.end(new Error('Reinitializing'));
      } catch (e) {
        // ignore
      }
    }

    sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: state,
      browser: ['Invoice Manager', 'Chrome', '1.0.0'],
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      linkPreviewImageThumbnailWidth: 0,
      keepAliveIntervalMs: 15000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        connectionStatus = 'SCAN_QR';
        try {
          currentQrDataUrl = await QRCode.toDataURL(qr, {
            margin: 2,
            scale: 8,
            color: {
              dark: '#0f172a',
              light: '#ffffff'
            }
          });
          console.log('📷 New WhatsApp QR Code generated for scanning.');
        } catch (err) {
          console.error('Failed to generate QR Data URL:', err);
        }
      }

      if (connection === 'connecting') {
        if (connectionStatus !== 'SCAN_QR') {
          connectionStatus = 'CONNECTING';
        }
      } else if (connection === 'open') {
        connectionStatus = 'CONNECTED';
        currentQrDataUrl = null;
        isInitializing = false;

        const rawUser = sock.user?.id || '';
        const userPhone = rawUser.split(':')[0] || rawUser.split('@')[0] || '';
        connectedUser = {
          id: sock.user?.id,
          name: sock.user?.name || 'WhatsApp User',
          phone: userPhone ? `+${userPhone}` : 'Connected'
        };

        console.log(`✅ WhatsApp Connected successfully as ${connectedUser.phone}!`);
      } else if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`⚠️ WhatsApp connection closed. Reason code: ${statusCode}. Reconnect: ${shouldReconnect}`);

        if (statusCode === DisconnectReason.loggedOut) {
          connectionStatus = 'DISCONNECTED';
          currentQrDataUrl = null;
          connectedUser = null;
          isInitializing = false;
          // Clear session files
          try {
            if (fs.existsSync(SESSION_DIR)) {
              fs.rmSync(SESSION_DIR, { recursive: true, force: true });
            }
          } catch (err) {
            console.error('Error clearing session dir:', err);
          }
        } else {
          connectionStatus = 'CONNECTING';
          currentQrDataUrl = null;
          isInitializing = false;
          setTimeout(() => {
            initWhatsApp(true).catch(console.error);
          }, 3000);
        }
      }
    });

    return getWhatsAppStatus();
  } catch (err) {
    console.error('❌ Error initializing WhatsApp socket:', err);
    connectionStatus = 'DISCONNECTED';
    isInitializing = false;
    throw err;
  }
}

export async function logoutWhatsApp() {
  connectionStatus = 'DISCONNECTED';
  currentQrDataUrl = null;
  connectedUser = null;
  isInitializing = false;

  if (sock) {
    try {
      await sock.logout();
    } catch (e) {
      try {
        sock.end(new Error('Manual logout'));
      } catch (e2) {
        // ignore
      }
    }
    sock = null;
  }

  try {
    if (fs.existsSync(SESSION_DIR)) {
      fs.rmSync(SESSION_DIR, { recursive: true, force: true });
    }
  } catch (err) {
    console.error('Error removing session directory:', err);
  }

  return { success: true, message: 'WhatsApp logged out successfully.' };
}

export async function sendWhatsAppMessage(toPhone, messageText) {
  if (!sock || connectionStatus !== 'CONNECTED') {
    throw new Error('WhatsApp is not connected. Please scan the QR code first in Settings.');
  }

  const jid = formatToWhatsAppJid(toPhone);
  if (!jid) {
    throw new Error(`Invalid recipient phone number: ${toPhone}`);
  }

  const result = await sock.sendMessage(jid, { text: messageText });
  return result;
}

export async function sendInvoiceWhatsApp({
  toPhone,
  invoice,
  business,
  customer,
  htmlContent
}) {
  if (!sock || connectionStatus !== 'CONNECTED') {
    throw new Error('WhatsApp is not connected. Please scan the QR code first in Settings.');
  }

  const recipientPhone = toPhone || customer?.whatsapp || customer?.phone;
  const jid = formatToWhatsAppJid(recipientPhone);
  if (!jid) {
    throw new Error('Customer has no valid WhatsApp or phone number.');
  }

  const bizName = business?.name || 'Company';
  const custName = customer?.name || 'Valued Customer';
  const invNo = invoice?.invoiceNo || 'INV-0000';
  const cur = business?.currency || 'PKR';
  const fmt = (num) => `${cur} ${Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  // Clean, professional, short caption as requested
  const cleanCaption = `📄 *Invoice ${invNo}*\n🏢 ${bizName}\n👤 ${custName}\n💰 Total: ${fmt(invoice?.total || 0)}`;

  try {
    const { generatePdfFromHtml } = await import('./pdfService.js');
    const { generateBackendInvoiceHtml } = await import('./templateService.js');

    const html = htmlContent || generateBackendInvoiceHtml(invoice, business, customer);
    const pdfBuffer = await generatePdfFromHtml(html);
    const fileName = `${invNo}_${custName.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;

    const sendResult = await sock.sendMessage(jid, {
      document: pdfBuffer,
      fileName: fileName,
      mimetype: 'application/pdf',
      caption: cleanCaption
    });

    return {
      success: true,
      recipient: jid,
      messageId: sendResult?.key?.id
    };
  } catch (err) {
    console.warn('Sending invoice PDF failed, sending text fallback:', err.message);
    const sendResult = await sock.sendMessage(jid, { text: cleanCaption });
    return {
      success: true,
      recipient: jid,
      messageId: sendResult?.key?.id,
      fallback: true
    };
  }
}

export async function sendDirectBufferWhatsApp(toPhone, buffer, fileName, mimeType = 'application/pdf', caption = '') {
  if (!sock || connectionStatus !== 'CONNECTED') {
    throw new Error('WhatsApp is not connected.');
  }

  const jid = formatToWhatsAppJid(toPhone);
  if (!jid) {
    throw new Error(`Invalid recipient phone number: ${toPhone}`);
  }

  const sendResult = await sock.sendMessage(jid, {
    document: buffer,
    fileName: fileName,
    mimetype: mimeType,
    caption: caption
  });

  return {
    success: true,
    recipient: jid,
    messageId: sendResult?.key?.id
  };
}

export async function sendDocumentWhatsApp(toPhone, base64Data, fileName, mimeType = 'application/pdf', caption = '') {
  if (!sock || connectionStatus !== 'CONNECTED') {
    throw new Error('WhatsApp is not connected. Please scan the QR code first in Settings.');
  }

  const jid = formatToWhatsAppJid(toPhone);
  if (!jid) {
    throw new Error(`Invalid recipient phone number: ${toPhone}`);
  }

  // Convert base64 to Buffer
  const buffer = Buffer.from(base64Data, 'base64');
  return sendDirectBufferWhatsApp(toPhone, buffer, fileName, mimeType, caption);
}
