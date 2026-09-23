function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function money(val, cur = 'PKR') {
  const n = Number(val) || 0;
  return `${cur} ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function getPreviousInvoiceMonth(currentMonth, currentYear) {
  let idx = MONTHS.indexOf(currentMonth);
  let y = Number(currentYear || new Date().getFullYear());
  if (idx < 0) return '';
  idx--;
  if (idx < 0) {
    idx = 11;
    y--;
  }
  return `${MONTHS[idx]} ${y}`;
}

export function generateBackendInvoiceHtml(invoice = {}, business = {}, customer = {}) {
  const cur = business.currency || 'PKR';
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const statusClass = String(invoice.status || 'unpaid').toLowerCase();
  const prevDuesVal = Number(invoice.previousDues || (Number(invoice.total || 0) > Number(invoice.subtotal || 0) ? Number(invoice.total) - Number(invoice.subtotal) : 0));
  const prevMonthLabel = invoice.previousDuesMonths || getPreviousInvoiceMonth(invoice.month, invoice.year);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${esc(invoice.invoiceNo || 'INVOICE')}</title>
  <style>
    @page {
      margin: 0;
    }
    * { box-sizing: border-box; }
    html, body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif;
      background: #ffffff;
      padding: 0;
      margin: 0;
      color: #172033;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .invoice {
      max-width: 720px;
      width: 100%;
      margin: 0 auto;
      padding: 24px 28px 16px 28px;
      background: #ffffff;
      border: none;
      position: relative;
      box-sizing: border-box;
      page-break-inside: avoid;
      break-inside: avoid;
      page-break-after: avoid;
      break-after: avoid;
    }
    .inv-head { display: flex; justify-content: space-between; gap: 20px; padding-bottom: 14px; border-bottom: 2px solid #1e293b; }
    .inv-brand { display: flex; gap: 12px; }
    .inv-logo { width: 54px; height: 54px; border: 1px solid #d6deea; border-radius: 6px; display: grid; place-items: center; overflow: hidden; font-weight: 800; color: #64748b; background: #fafbfd; }
    .inv-logo img { width: 100%; height: 100%; object-fit: contain; }
    .inv-brand h2 { margin: 0 0 4px; font-size: 19px; }
    .inv-brand p { margin: 2px 0; color: #64748b; font-size: 11px; }
    .inv-meta { text-align: right; }
    .inv-meta h1 { margin: 0 0 6px; font-size: 24px; color: #0b4b8f; letter-spacing: 0.5px; }
    .inv-meta div { font-size: 11px; margin: 3px 0; }
    .inv-info { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 18px 0; }
    .inv-info h4 { margin: 0 0 6px; font-size: 10px; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; }
    .inv-info p { margin: 3px 0; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; page-break-inside: avoid; break-inside: avoid; }
    .inv-table th, .inv-table td { font-size: 11px; padding: 8px 10px; border: 1px solid #dfe6ef; text-align: left; }
    .inv-table th { background: #edf3fc; font-weight: 700; color: #1e293b; }
    .inv-total { width: 320px; margin-left: auto; margin-top: 14px; page-break-inside: avoid; break-inside: avoid; }
    .inv-total div { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; }
    .inv-total .grand { border-top: 2px solid #111827; margin-top: 5px; padding-top: 8px; font-size: 15px; font-weight: 800; }
    .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; margin-top: 36px; page-break-inside: avoid; break-inside: avoid; }
    .sig { text-align: center; border-top: 1px solid #9aa6b6; padding-top: 6px; font-size: 10px; color: #64748b; }
    @media print {
      html, body { background: #fff !important; padding: 0 !important; margin: 0 !important; }
      .invoice { border: none !important; border-radius: 0 !important; max-width: 100% !important; box-shadow: none !important; padding: 24px 28px 16px 28px !important; }
      @page { margin: 0; }
    }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="inv-head">
      <div class="inv-brand">
        <div class="inv-logo">${business.logo ? `<img src="${business.logo}" alt="Logo">` : 'LOGO'}</div>
        <div>
          <h2>${esc(business.name || 'Your Business')}</h2>
          <p>${esc(business.address || '')}</p>
          <p>${esc([business.phone, business.email].filter(Boolean).join(' • '))}</p>
          ${business.tax ? `<p>${esc(business.tax)}</p>` : ''}
        </div>
      </div>
      <div class="inv-meta">
        <h1>INVOICE</h1>
        <div><strong>${esc(invoice.invoiceNo || 'INV-0001')}</strong></div>
        <div>Month: ${esc(invoice.month || '')} ${esc(invoice.year || '')}</div>
        <div>Invoice Date: ${esc(invoice.date || '')}</div>
        <div>Due Date: ${esc(invoice.dueDate || invoice.due || '')}</div>
      </div>
    </div>
    <div class="inv-info">
      <div>
        <h4>Bill To</h4>
        <p><strong>${esc(customer.name || 'Client')}</strong></p>
        ${customer.phone ? `<p>Phone: ${esc(customer.phone)}</p>` : ''}
        ${customer.whatsapp && customer.whatsapp !== customer.phone ? `<p>WhatsApp: ${esc(customer.whatsapp)}</p>` : ''}
        ${business.address ? `<p>${esc(business.address)}</p>` : ''}
      </div>
      <div>
        <h4>Payment Status</h4>
        <p>Status: <strong>${esc(invoice.status || 'Unpaid')}</strong></p>
        <p>Paid: <strong>${money(invoice.paid, cur)}</strong></p>
        <p>Balance: <strong>${money(invoice.balance, cur)}</strong></p>
      </div>
    </div>
    <table class="inv-table">
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align:center">Qty</th>
          <th style="text-align:right">Unit Price</th>
          <th style="text-align:right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${items.length > 0 ? items.map((x) => `<tr>
          <td>${esc(x.name || x.description || 'Item')}</td>
          <td style="text-align:center">${x.qty || 1}</td>
          <td style="text-align:right">${money(x.price || x.amount || 0, cur)}</td>
          <td style="text-align:right">${money((Number(x.qty || 1) * Number(x.price || x.amount || 0)), cur)}</td>
        </tr>`).join('') : `<tr>
          <td>Monthly Service / Billing</td>
          <td style="text-align:center">1</td>
          <td style="text-align:right">${money(invoice.total, cur)}</td>
          <td style="text-align:right">${money(invoice.total, cur)}</td>
        </tr>`}
      </tbody>
    </table>
    <div class="inv-total">
      <div><span>Current Subtotal</span><strong>${money(invoice.subtotal || invoice.total, cur)}</strong></div>
      ${prevDuesVal > 0 ? `<div><span style="color:#d97706;font-weight:600">Previous Balance / Arrears ${prevMonthLabel ? `(${esc(prevMonthLabel)})` : ''}</span><strong style="color:#d97706">+ ${money(prevDuesVal, cur)}</strong></div>` : ''}
      ${invoice.discount ? `<div><span>Discount</span><strong>- ${money(invoice.discount, cur)}</strong></div>` : ''}
      <div><span>Grand Total</span><strong>${money(invoice.total, cur)}</strong></div>
      <div><span>Paid</span><strong>${money(invoice.paid, cur)}</strong></div>
      <div class="grand"><span>Balance Due</span><span>${money(invoice.balance, cur)}</span></div>
    </div>
    ${invoice.notes ? `<div style="margin-top:20px;font-size:11px;color:#475569"><strong>Notes:</strong><br>${esc(invoice.notes)}</div>` : ''}
    <div class="sigs">
      <div class="sig">Client Signature</div>
      <div class="sig">Authorized Signature</div>
    </div>
  </div>
</body>
</html>`;
}
