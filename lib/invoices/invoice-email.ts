import type { InvoiceData } from "@/lib/invoices/invoice-pdf";

export const INVOICE_MONOGRAM_URL = "https://www.t4xi.nl/t4xi-monogram-navy.png";

const INK = "#1F2730";
const ACCENT = "#28313B";
const FOG = "#F5F3F1";
const OVERLAY = "#EEEAE5";
const STONE = "#999694";
const MUTED = "#5F666D";
const BORDER = "#E6E2DC";

const T4XI = {
  phoneDisplay: "+31 6 34 74 45 22",
  phoneHref: "+31634744522",
  whatsapp: "https://wa.me/31634744522",
  email: "booking@t4xi.nl",
};

export type RenderedInvoiceEmail = {
  subject: string;
  html: string;
  text: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function currencyCode(value: string): string {
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "EUR";
}

function formatAmount(data: InvoiceData): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: currencyCode(data.currency),
  }).format(data.amountPaidCents / 100);
}

function formatDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function detailRow(label: string, value: string, last = false): string {
  return `<tr>
    <td class="invoice-label" style="padding:13px 16px 13px 0;color:${MUTED};font-size:12px;line-height:1.4;vertical-align:top;white-space:nowrap;${last ? "" : `border-bottom:1px solid ${BORDER};`}">${escapeHtml(label)}</td>
    <td style="padding:13px 0;color:${INK};font-size:13px;font-weight:700;line-height:1.4;text-align:right;vertical-align:top;word-break:break-word;${last ? "" : `border-bottom:1px solid ${BORDER};`}">${value}</td>
  </tr>`;
}

function invoiceShell(title: string, preheader: string, invoiceNumber: string, inner: string): string {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; supported-color-schemes: light; }
  @media only screen and (max-width: 620px) {
    .invoice-wrap { padding: 12px 8px !important; }
    .invoice-header { padding: 22px 20px 20px !important; }
    .invoice-logo { width: 48px !important; height: 47px !important; }
    .invoice-content { padding: 34px 22px 30px !important; }
    .invoice-heading { font-size: 30px !important; }
    .invoice-total { font-size: 32px !important; }
    .invoice-route { font-size: 14px !important; }
    .invoice-label { white-space:normal !important; }
    .invoice-contact-link { display:block !important; padding:4px 0 !important; }
    .invoice-contact-separator { display:none !important; }
  }
</style></head>
<body style="margin:0;background:${FOG};font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;color:${INK};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${FOG};">
    <tr><td class="invoice-wrap" align="center" style="padding:36px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;">
        <tr>
          <td class="invoice-header" style="background:#ffffff;border:1px solid ${BORDER};border-bottom:3px solid ${ACCENT};border-radius:18px 18px 0 0;padding:25px 32px 23px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;"><tr>
              <td style="vertical-align:middle;">
                <img class="invoice-logo" src="${INVOICE_MONOGRAM_URL}" width="52" height="51" alt="T4XI" style="display:block;width:52px;height:51px;border:0;outline:none;object-fit:contain;color:${INK};font-size:12px;font-weight:700;">
              </td>
              <td align="right" style="vertical-align:middle;color:${STONE};font-size:10px;font-weight:700;line-height:1.55;letter-spacing:1.5px;text-transform:uppercase;">
                Factuur<br><span style="color:${INK};font-size:12px;letter-spacing:0.2px;text-transform:none;">${escapeHtml(invoiceNumber)}</span>
              </td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td class="invoice-content" style="background:#ffffff;border:1px solid ${BORDER};border-top:0;padding:44px 38px 38px;">
            ${inner}
          </td>
        </tr>
        <tr>
          <td align="center" style="background:${INK};border-radius:0 0 18px 18px;padding:24px 22px;color:#CBC8C4;font-size:11px;line-height:1.8;">
            <span style="font-weight:700;letter-spacing:0.7px;color:${FOG};">ARRIVE WITH CONFIDENCE.</span><br>
            <span style="color:${STONE};">${T4XI.phoneDisplay} &nbsp;·&nbsp; ${T4XI.email} &nbsp;·&nbsp; t4xi.nl</span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function renderInvoiceEmail(data: InvoiceData): RenderedInvoiceEmail {
  const subject = `Uw betaalde factuur van T4XI — ${data.invoiceNumber}`;
  const amount = formatAmount(data);
  const paymentMethod = data.paymentMethod?.trim() || "Online betaling";
  const filename = `factuur-${data.invoiceNumber}.pdf`;
  const inner = `
    <div style="font-size:10px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:${STONE};margin:0 0 13px;">Rit voldaan</div>
    <h1 class="invoice-heading" style="font-family:Outfit,'Helvetica Neue',Arial,Helvetica,sans-serif;font-size:36px;line-height:1.08;letter-spacing:-1px;margin:0 0 18px;color:${INK};">Bedankt voor uw rit.</h1>
    <p style="font-size:15px;color:${MUTED};margin:0 0 32px;line-height:1.7;">
      Beste ${escapeHtml(data.billingName)}, uw betaling is ontvangen. De factuur is als PDF bijgevoegd, zodat u deze eenvoudig kunt bewaren of doorsturen naar uw boekhouder.
    </p>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-top:1px solid ${BORDER};border-bottom:1px solid ${BORDER};margin:0 0 34px;">
      <tr>
        <td style="padding:22px 0;vertical-align:middle;">
          <div style="color:${INK};font-size:16px;font-weight:700;line-height:1.35;">Totaal betaald</div>
          <div style="color:${MUTED};font-size:12px;line-height:1.5;margin-top:4px;">Voldaan via ${escapeHtml(paymentMethod)}</div>
        </td>
        <td class="invoice-total" align="right" style="padding:22px 0 22px 18px;color:${INK};font-family:Outfit,'Helvetica Neue',Arial,Helvetica,sans-serif;font-size:36px;font-weight:700;letter-spacing:-1px;line-height:1;vertical-align:middle;white-space:nowrap;">${escapeHtml(amount)}</td>
      </tr>
    </table>

    <div style="font-size:10px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${STONE};margin:0 0 15px;">Ritgegevens</div>
    <div style="font-size:14px;font-weight:700;color:${INK};margin:0 0 18px;">${escapeHtml(formatDate(data.rideDate))} · ${escapeHtml(data.rideTime)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 34px;">
      <tr>
        <td width="28" style="width:28px;vertical-align:top;padding-top:5px;">
          <div style="width:10px;height:10px;border:2px solid ${ACCENT};border-radius:50%;font-size:0;line-height:0;">&nbsp;</div>
        </td>
        <td class="invoice-route" style="padding:0 0 18px;color:${INK};font-size:15px;font-weight:700;line-height:1.5;border-bottom:1px solid ${BORDER};word-break:break-word;">
          <div style="color:${STONE};font-size:9px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;margin-bottom:4px;">Vertrek</div>
          ${escapeHtml(data.pickup)}
        </td>
      </tr>
      <tr>
        <td width="28" style="width:28px;vertical-align:top;padding-top:24px;">
          <div style="width:10px;height:10px;background:${ACCENT};border:2px solid ${ACCENT};border-radius:2px;font-size:0;line-height:0;">&nbsp;</div>
        </td>
        <td class="invoice-route" style="padding:18px 0 0;color:${INK};font-size:15px;font-weight:700;line-height:1.5;word-break:break-word;">
          <div style="color:${STONE};font-size:9px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;margin-bottom:4px;">Bestemming</div>
          ${escapeHtml(data.dropoff)}
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${OVERLAY};border:1px solid #E2DDD5;border-radius:12px;margin:0 0 30px;">
      <tr>
        <td width="58" style="padding:18px 0 18px 18px;vertical-align:middle;">
          <div style="width:44px;height:44px;background:${ACCENT};border-radius:8px;color:#ffffff;font-size:10px;font-weight:800;line-height:44px;text-align:center;letter-spacing:0.9px;">PDF</div>
        </td>
        <td style="padding:18px;vertical-align:middle;">
          <div style="font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${STONE};margin-bottom:5px;">Uw factuur · bijgevoegd</div>
          <div style="font-size:13px;font-weight:700;color:${INK};line-height:1.45;word-break:break-word;">${escapeHtml(filename)}</div>
          <div style="font-size:12px;color:${MUTED};line-height:1.45;margin-top:4px;">Klaar om te bewaren of door te sturen</div>
        </td>
      </tr>
    </table>

    <div style="font-size:10px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${STONE};margin:0 0 8px;">Factuurgegevens</div>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 30px;">
      ${detailRow("Factuurnummer", escapeHtml(data.invoiceNumber))}
      ${detailRow("Factuurdatum", escapeHtml(formatDate(data.invoiceIssuedAt)))}
      ${detailRow("Betaald per", escapeHtml(paymentMethod))}
      ${detailRow("Uitgevoerd door", escapeHtml(data.executingCarrierName), true)}
    </table>

    <div style="padding-top:24px;border-top:1px solid ${BORDER};">
      <p style="font-size:13px;color:${MUTED};margin:0 0 10px;">Vragen over uw factuur? Neem gerust contact op:</p>
      <p style="margin:0;font-size:13px;line-height:1.8;">
        <a class="invoice-contact-link" href="tel:${T4XI.phoneHref}" style="color:${ACCENT};text-decoration:none;font-weight:600;">${T4XI.phoneDisplay}</a>
        <span class="invoice-contact-separator"> · </span>
        <a class="invoice-contact-link" href="${T4XI.whatsapp}" style="color:${ACCENT};text-decoration:none;font-weight:600;">WhatsApp</a>
        <span class="invoice-contact-separator"> · </span>
        <a class="invoice-contact-link" href="mailto:${T4XI.email}" style="color:${ACCENT};text-decoration:none;font-weight:600;">${T4XI.email}</a>
      </p>
    </div>`;

  const text = [
    "Bedankt voor uw rit.",
    "",
    `Beste ${data.billingName},`,
    "Uw betaling is ontvangen. De factuur is als PDF bijgevoegd, zodat u deze eenvoudig kunt bewaren of doorsturen naar uw boekhouder.",
    "",
    `Totaal betaald: ${amount}`,
    `Voldaan via: ${paymentMethod}`,
    "",
    "Ritgegevens",
    `${formatDate(data.rideDate)} om ${data.rideTime}`,
    `Vertrek: ${data.pickup}`,
    `Bestemming: ${data.dropoff}`,
    "",
    `Bijlage: ${filename}`,
    "Klaar om te bewaren of door te sturen.",
    "",
    "Factuurgegevens",
    `Factuurnummer: ${data.invoiceNumber}`,
    `Factuurdatum: ${formatDate(data.invoiceIssuedAt)}`,
    `Betaald per: ${paymentMethod}`,
    `Uitgevoerd door: ${data.executingCarrierName}`,
    "",
    `Vragen? ${T4XI.phoneDisplay} | WhatsApp | ${T4XI.email}`,
    "",
    "T4XI — Arrive with confidence.",
  ].join("\n");

  return {
    subject,
    html: invoiceShell(subject, `Uw rit is voldaan. Factuur ${data.invoiceNumber} is als PDF bijgevoegd.`, data.invoiceNumber, inner),
    text,
  };
}
