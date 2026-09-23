import puppeteer from 'puppeteer-core';
import { existsSync } from 'fs';

// Common Chrome paths on Windows
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Users\\' + (process.env.USERNAME || 'hp') + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Chromium\\Application\\chromium.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

function findChrome() {
  for (const p of CHROME_PATHS) {
    if (existsSync(p)) return p;
  }
  return null;
}

let cachedBrowser = null;
let browserLaunchPromise = null;

export async function getBrowser() {
  if (cachedBrowser && cachedBrowser.connected !== false) {
    return cachedBrowser;
  }

  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }

  const executablePath = findChrome();
  if (!executablePath) {
    throw new Error('Chrome/Edge not found on this system. Please install Google Chrome.');
  }

  browserLaunchPromise = puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-breakpad',
      '--disable-client-side-phishing-detection',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-hang-monitor',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-sync',
      '--disable-translate',
      '--metrics-recording-only',
      '--mute-audio',
      '--safebrowsing-disable-auto-update'
    ]
  }).then((browser) => {
    cachedBrowser = browser;
    browserLaunchPromise = null;
    browser.on('disconnected', () => {
      cachedBrowser = null;
    });
    return browser;
  }).catch((err) => {
    browserLaunchPromise = null;
    throw err;
  });

  return browserLaunchPromise;
}

let warmPage = null;

async function getPage(browser) {
  if (warmPage && !warmPage.isClosed()) {
    const p = warmPage;
    warmPage = null;
    // Pre-warm next page in the background asynchronously
    browser.newPage().then(nextPage => {
      warmPage = nextPage;
    }).catch(() => {});
    return p;
  }
  // If no warm page ready yet, create one and also schedule next
  const page = await browser.newPage();
  browser.newPage().then(nextPage => {
    warmPage = nextPage;
  }).catch(() => {});
  return page;
}

export function warmUpPdfEngine() {
  getBrowser().then(async (browser) => {
    if (!warmPage || warmPage.isClosed()) {
      warmPage = await browser.newPage().catch(() => null);
    }
  }).catch(() => {});
}

/**
 * Generate a PDF Buffer from an HTML string using Puppeteer + system Chrome.
 * Uses pre-warmed persistent browser & pages for near-instant rendering (< 80ms).
 * @param {string} htmlContent - Full HTML document
 * @returns {Promise<Buffer>} PDF Buffer
 */
export async function generatePdfFromHtml(htmlContent) {
  const browser = await getBrowser();
  const page = await getPage(browser);

  try {
    await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

    // Detect document type
    const docInfo = await page.evaluate(() => {
      const isInvoice = !!document.querySelector('.invoice');
      const invoiceEl = document.querySelector('.invoice');
      const body = document.body;
      const height = isInvoice && invoiceEl
        ? Math.max(body.scrollHeight, invoiceEl.offsetHeight + 48, invoiceEl.scrollHeight + 48)
        : body.scrollHeight;
      return { isInvoice, height };
    });

    let pdfBuffer;
    if (docInfo.isInvoice) {
      // Auto-fit height for Invoices: Ends cleanly right after the signatures (Zero empty bottom page)
      pdfBuffer = await page.pdf({
        width: '720px',
        height: `${Math.ceil(docInfo.height) + 8}px`,
        printBackground: true,
        preferCSSPageSize: false,
        margin: { top: '0', right: '0', bottom: '0', left: '0' }
      });
    } else {
      // Multi-page A4 format for Proposals & Reports
      pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' }
      });
    }

    return Buffer.from(pdfBuffer);
  } finally {
    page.close().catch(() => {});
  }
}
