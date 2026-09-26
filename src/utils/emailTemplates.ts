import { Booking, BusinessEmailSettings, EmailLog, EmailTemplateConfig } from '../types';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { DEFAULT_TEMPLATE_CONFIGS } from './templateConfigs';
import { formatDocReference } from './referenceNumber';

export const DEFAULT_BUSINESS_SETTINGS: BusinessEmailSettings = {
  senderName: 'Nendoa Studio',
  fromEmail: 'hello@nendoastudio.com',
  replyTo: 'contact@nendoastudio.com',
  studioAddress: '214, Lebuh Victoria, 10300 Georgetown, Pulau Pinang, Malaysia',
  studioAddressPG: '214, Lebuh Victoria, 10300 Georgetown, Pulau Pinang, Malaysia',
  studioAddressBM: '214, Lebuh Victoria, 10300 Georgetown, Pulau Pinang, Malaysia',
  studioPhone: '+60 12-889 2030',
  websiteUrl: 'https://nendoastudio.com',
  signatureTagline: 'Handcrafted ceramic moments in Georgetown, Penang.',
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '',
  useCustomSmtp: false,
};

export interface TemplateParams {
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  workshopName?: string;
  bookingDate?: string;
  bookingTime?: string;
  date?: string;
  time?: string;
  location?: 'PG' | 'BM' | 'ALL';
  pax?: number;
  depositAmount?: number;
  totalPrice?: number;
  balancePaid?: boolean;
  depositPaid?: boolean;
  collectionMethod?: 'bm' | 'island' | 'delivery';
  notes?: string;
  customMessage?: string;
  settings?: BusinessEmailSettings;
  bookingId?: string;
  templateConfig?: EmailTemplateConfig;
  paintingPieces?: number;
  paintingPrice?: number;
  deliveryFee?: number;
  drinksDiscountCount?: number;
  selectedItems?: Array<{ name: string; quantity: number; price: number }>;
  paymentLater?: boolean;
}

export function generateBookingConfirmationEmail(params: TemplateParams): { subject: string; html: string; text: string } {
  const settings = params.settings || DEFAULT_BUSINESS_SETTINGS;
  const cfg = params.templateConfig || DEFAULT_TEMPLATE_CONFIGS.booking_confirmation;
  const name = params.customerName || 'Valued Guest';
  const workshop = params.workshopName || 'Pottery Workshop';
  const date = params.bookingDate || 'Scheduled Date';
  const time = params.bookingTime || 'Scheduled Time';
  const branchName = 'Nendoa Studio';
  const branchAddress = settings.studioAddress || '214, Lebuh Victoria, 10300 Georgetown, Pulau Pinang, Malaysia';
  const pax = params.pax || 1;
  const deposit = params.depositPaid ? (params.depositAmount || 0) : 0;
  const total = params.totalPrice || 0;
  const balance = Math.max(0, total - deposit);

  const subjectPattern = cfg.subject || (deposit > 0 
    ? `Booking Confirmed & Deposit Receipt: {{workshop}} on {{date}} – Nendoa Studio`
    : `Booking Confirmed: {{workshop}} on {{date}} – Nendoa Studio`);

  const subject = (cfg.subject && cfg.subject !== DEFAULT_TEMPLATE_CONFIGS.booking_confirmation.subject
    ? cfg.subject
    : (deposit > 0 
        ? `Booking Confirmed & Deposit Receipt: {{workshop}} on {{date}} – Nendoa Studio`
        : `Booking Confirmed: {{workshop}} on {{date}} – Nendoa Studio`))
    .replace(/\{\{customerName\}\}/g, name)
    .replace(/\{\{workshop\}\}/g, workshop)
    .replace(/\{\{date\}\}/g, date);

  const leadGreeting = (cfg.leadGreeting || `Hello {{customerName}},`).replace(/\{\{customerName\}\}/g, name);
  const leadMessage = (cfg.leadMessage || `Thank you for choosing Nendoa Studio! Your session is officially confirmed. We are excited to guide you through crafting your own ceramic masterpieces.`)
    .replace(/\{\{customerName\}\}/g, name)
    .replace(/\{\{workshop\}\}/g, workshop)
    .replace(/\{\{date\}\}/g, date);

  const headerTitle = cfg.headerTitle || 'NENDOA STUDIO';
  const headerSubtitle = cfg.headerSubtitle || 'Studio Workshop Confirmation';
  const accentColor = cfg.accentColor || '#C86A4B';
  const footerNote = (cfg.footerNote || `If you need to reschedule or have questions, reply directly to this email or call us at {{studioPhone}}.`)
    .replace(/\{\{studioPhone\}\}/g, settings.studioPhone)
    .replace(/\{\{fromEmail\}\}/g, settings.fromEmail);

  const tipsList = cfg.tipsOrNotes && cfg.tipsOrNotes.length > 0 ? cfg.tipsOrNotes : [
    'Attire: Wear comfortable clothes that you do not mind getting clay on (clay washes out easily!). Aprons are provided.',
    'Nails: Trimmed fingernails make wheel throwing and pinch potting significantly easier.',
    'Arrival: Please arrive 10 minutes prior to your session time so we can settle in and begin promptly.',
    'Firing Timeline: Your completed works will dry, undergo bisque firing, glazing, and final high firing (approx. 3–4 weeks). We will notify you by email when they are ready!'
  ];

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #FAF4F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #2D241E; }
    .wrapper { width: 100%; background-color: #FAF4F0; padding: 40px 10px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #EFE4DC; box-shadow: 0 4px 20px rgba(200, 106, 75, 0.06); }
    .header { background: ${accentColor}; padding: 36px 30px; text-align: center; color: #FFFFFF; }
    .logo-text { font-family: Georgia, serif; font-size: 26px; font-weight: bold; letter-spacing: 2px; margin: 0; }
    .sub-tagline { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; margin-top: 6px; opacity: 0.9; }
    .content { padding: 36px 32px; }
    .greeting { font-size: 18px; font-weight: 600; color: #2D241E; margin-bottom: 12px; }
    .lead-text { font-size: 15px; line-height: 1.6; color: #5A4E47; margin-bottom: 24px; }
    .card { background-color: #FAF6F3; border: 1px solid #EADDCF; border-radius: 12px; padding: 22px; margin-bottom: 24px; }
    .card-title { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1.5px; color: ${accentColor}; margin-top: 0; margin-bottom: 16px; border-bottom: 1px dashed #E0D0C0; padding-bottom: 8px; }
    .detail-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
    .detail-label { color: #8C7E74; font-weight: 500; }
    .detail-value { color: #2D241E; font-weight: 600; text-align: right; }
    .highlight-box { background-color: #F4E8E1; border-left: 4px solid ${accentColor}; padding: 14px 18px; border-radius: 0 8px 8px 0; margin-bottom: 24px; font-size: 13.5px; color: #4A3E37; line-height: 1.5; }
    .tips-list { margin: 0; padding-left: 20px; font-size: 14px; color: #5A4E47; line-height: 1.7; }
    .footer { background-color: #F5EDE6; padding: 24px 30px; text-align: center; font-size: 12px; color: #8C7E74; line-height: 1.6; border-top: 1px solid #EADDCF; }
    .footer a { color: ${accentColor}; text-decoration: none; font-weight: 600; }
    .badge { display: inline-block; padding: 4px 10px; background-color: #EBF5EE; color: #2B7A4B; border-radius: 20px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1 class="logo-text">${headerTitle}</h1>
        <p class="sub-tagline">${headerSubtitle}</p>
      </div>
      <div class="content">
        <p class="greeting">${leadGreeting}</p>
        <p class="lead-text">${leadMessage}</p>

        <div class="card">
          <div class="card-title">Booking Details</div>
          <table width="100%" cellpadding="4" cellspacing="0" style="font-size: 14px;">
            <tr>
              <td class="detail-label" style="color: #8C7E74; padding: 6px 0;">Workshop:</td>
              <td class="detail-value" style="color: #2D241E; font-weight: bold; text-align: right; padding: 6px 0;">${workshop}</td>
            </tr>
            <tr>
              <td class="detail-label" style="color: #8C7E74; padding: 6px 0;">Date & Time:</td>
              <td class="detail-value" style="color: #2D241E; font-weight: bold; text-align: right; padding: 6px 0;">${date} at ${time}</td>
            </tr>
            <tr>
              <td class="detail-label" style="color: #8C7E74; padding: 6px 0;">Participants:</td>
              <td class="detail-value" style="color: #2D241E; font-weight: bold; text-align: right; padding: 6px 0;">${pax} pax</td>
            </tr>
            <tr>
              <td class="detail-label" style="color: #8C7E74; padding: 6px 0;">Studio Location:</td>
              <td class="detail-value" style="color: #2D241E; font-weight: bold; text-align: right; padding: 6px 0;">${branchName}</td>
            </tr>
            <tr>
              <td class="detail-label" style="color: #8C7E74; padding: 6px 0;">Address:</td>
              <td class="detail-value" style="color: #665950; font-size: 12px; text-align: right; padding: 6px 0;">${branchAddress}</td>
            </tr>
            <tr style="border-top: 1px solid #EFE4DC;">
              <td class="detail-label" style="color: #8C7E74; padding: 10px 0 4px 0;">${deposit > 0 ? 'Deposit Received:' : 'Advance Deposit:'}</td>
              <td class="detail-value" style="color: ${deposit > 0 ? '#2B7A4B' : '#8C7E74'}; font-weight: bold; text-align: right; padding: 10px 0 4px 0;">${deposit > 0 ? `RM ${deposit.toFixed(2)} (Paid)` : 'None (Walk-in / Pay at Studio)'}</td>
            </tr>
            <tr>
              <td class="detail-label" style="color: #8C7E74; padding: 4px 0;">${deposit > 0 ? 'Balance Due at Studio:' : 'Total Due at Studio:'}</td>
              <td class="detail-value" style="color: #C86A4B; font-weight: bold; text-align: right; padding: 4px 0;">RM ${(deposit > 0 ? balance : total).toFixed(2)}</td>
            </tr>
          </table>
        </div>

        ${deposit > 0 ? `
        <div style="margin-top: -10px; margin-bottom: 24px; padding: 16px 20px; background-color: #F4F8F3; border: 1px solid #CFE2CD; border-radius: 12px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #2B7A4B;">
                  &#10003; Official Deposit Receipt Attached
                </span>
              </td>
              <td style="text-align: right;">
                <span style="font-family: monospace; font-size: 11px; font-weight: bold; color: #2B7A4B; background: #E1EFE0; padding: 3px 8px; border-radius: 6px;">
                  ${params.bookingId ? (params.bookingId.startsWith('REC-') || params.bookingId.startsWith('INV-') ? params.bookingId : `REC-${params.bookingId}`) : 'PAID'}
                </span>
              </td>
            </tr>
          </table>
          <p style="margin: 8px 0 0 0; font-size: 13px; color: #354E33; line-height: 1.5;">
            We have confirmed receipt of your advance deposit payment of <strong>RM ${deposit.toFixed(2)}</strong>. Your official computer-generated PDF receipt is attached to this email for your records.
          </p>
        </div>` : ''}

        ${params.customMessage ? `
        <div class="highlight-box">
          <strong>Special Note:</strong> ${params.customMessage}
        </div>` : ''}

        <div style="margin-bottom: 24px;">
          <h4 style="color: #2D241E; margin-bottom: 10px; font-size: 15px;">${cfg.tipsOrNotesTitle || 'Tips for Your Pottery Session:'}</h4>
          <ul class="tips-list">
            ${tipsList.map(t => `<li>${t}</li>`).join('')}
          </ul>
        </div>

        <p style="font-size: 14px; color: #5A4E47; margin-bottom: 0;">
          ${footerNote}
        </p>
      </div>

      <div class="footer">
        <p style="margin: 0 0 6px 0; font-weight: bold; color: #2D241E;">${settings.senderName}</p>
        <p style="margin: 0 0 6px 0;">${settings.signatureTagline}</p>
        <p style="margin: 0;">Phone: ${settings.studioPhone} &bull; Email: <a href="mailto:${settings.fromEmail}">${settings.fromEmail}</a></p>
      </div>
    </div>
  </div>
</body>
</html>
  `;

  const text = `
${headerTitle} - ${headerSubtitle}

${leadGreeting}

${leadMessage}

Workshop: ${workshop}
Date & Time: ${date} at ${time}
Pax: ${pax} pax
Location: ${branchName} (${branchAddress})
${deposit > 0 ? `Deposit Paid: RM ${deposit.toFixed(2)} (Paid)\nBalance Due at Studio: RM ${balance.toFixed(2)}\n\n[OFFICIAL DEPOSIT RECEIPT ATTACHED]\nOfficial Receipt Reference: ${params.bookingId ? (params.bookingId.startsWith('REC-') || params.bookingId.startsWith('INV-') ? params.bookingId : `REC-${params.bookingId}`) : 'Official Receipt'}\nYour official computer-generated PDF deposit receipt is attached to this email.` : `Advance Deposit: None (Walk-in / Pay at Studio)\nTotal Due at Studio: RM ${total.toFixed(2)}`}

${cfg.tipsOrNotesTitle || 'Tips'}:
${tipsList.map(t => `- ${t}`).join('\n')}

${footerNote}

Warm regards,
${settings.senderName}
  `.trim();

  return { subject, html, text };
}

export function generateCollectionReadyEmail(params: TemplateParams): { subject: string; html: string; text: string } {
  const settings = params.settings || DEFAULT_BUSINESS_SETTINGS;
  const cfg = params.templateConfig || DEFAULT_TEMPLATE_CONFIGS.collection_ready;
  const name = params.customerName || 'Valued Customer';
  const workshop = params.workshopName || 'Pottery Session';
  const branchName = 'Nendoa Studio';
  const branchAddress = settings.studioAddress || '214, Lebuh Victoria, 10300 Georgetown, Pulau Pinang, Malaysia';
  const method = params.collectionMethod === 'delivery' ? 'Courier Delivery' : `Self-Pickup at ${branchName}`;

  const subject = (cfg.subject || `Your Handcrafted Pottery is Ready for Collection! – Nendoa Studio`)
    .replace(/\{\{customerName\}\}/g, name)
    .replace(/\{\{workshop\}\}/g, workshop);

  const leadGreeting = (cfg.leadGreeting || `Exciting News, {{customerName}}!`).replace(/\{\{customerName\}\}/g, name);
  const leadMessage = (cfg.leadMessage || `Your handcrafted ceramic pieces from your {{workshop}} have completed their final high-temperature kiln firing and glaze inspection. They turned out beautifully and are now ready for collection!`)
    .replace(/\{\{customerName\}\}/g, name)
    .replace(/\{\{workshop\}\}/g, workshop);

  const headerTitle = cfg.headerTitle || 'NENDOA STUDIO';
  const headerSubtitle = cfg.headerSubtitle || 'Ceramics Ready for Pickup';
  const accentColor = cfg.accentColor || '#5B8266';
  const footerNote = (cfg.footerNote || `We cannot wait for you to enjoy and use your one-of-a-kind handmade ceramics!`)
    .replace(/\{\{studioPhone\}\}/g, settings.studioPhone)
    .replace(/\{\{fromEmail\}\}/g, settings.fromEmail);

  const tipsList = cfg.tipsOrNotes && cfg.tipsOrNotes.length > 0 ? cfg.tipsOrNotes : [
    'Please bring your own tote bag or box with packing paper if you would like to help us reduce single-use wrapping.',
    'Pieces are stored safely for up to 45 days from this email notification.',
    'If someone else is picking up on your behalf, simply have them show this email or state your name and phone number.'
  ];

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #FAF4F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #2D241E; }
    .wrapper { width: 100%; background-color: #FAF4F0; padding: 40px 10px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #EFE4DC; box-shadow: 0 4px 20px rgba(200, 106, 75, 0.06); }
    .header { background: ${accentColor}; padding: 36px 30px; text-align: center; color: #FFFFFF; }
    .logo-text { font-family: Georgia, serif; font-size: 26px; font-weight: bold; letter-spacing: 2px; margin: 0; }
    .sub-tagline { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; margin-top: 6px; opacity: 0.9; }
    .content { padding: 36px 32px; }
    .greeting { font-size: 18px; font-weight: 600; color: #2D241E; margin-bottom: 12px; }
    .lead-text { font-size: 15px; line-height: 1.6; color: #5A4E47; margin-bottom: 24px; }
    .card { background-color: #F3F7F4; border: 1px solid #D2E2D6; border-radius: 12px; padding: 22px; margin-bottom: 24px; }
    .card-title { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1.5px; color: ${accentColor}; margin-top: 0; margin-bottom: 16px; border-bottom: 1px dashed #C0D6C6; padding-bottom: 8px; }
    .detail-label { color: #6D8273; font-weight: 500; }
    .detail-value { color: #2D241E; font-weight: 600; text-align: right; }
    .highlight-box { background-color: #EBF4EE; border-left: 4px solid ${accentColor}; padding: 14px 18px; border-radius: 0 8px 8px 0; margin-bottom: 24px; font-size: 13.5px; color: #2A4733; line-height: 1.5; }
    .footer { background-color: #F5EDE6; padding: 24px 30px; text-align: center; font-size: 12px; color: #8C7E74; line-height: 1.6; border-top: 1px solid #EADDCF; }
    .footer a { color: ${accentColor}; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1 class="logo-text">${headerTitle}</h1>
        <p class="sub-tagline">${headerSubtitle}</p>
      </div>
      <div class="content">
        <p class="greeting">${leadGreeting}</p>
        <p class="lead-text">${leadMessage}</p>

        <div class="card">
          <div class="card-title">Collection Information</div>
          <table width="100%" cellpadding="4" cellspacing="0" style="font-size: 14px;">
            <tr>
              <td class="detail-label" style="color: #6D8273; padding: 6px 0;">Customer Name:</td>
              <td class="detail-value" style="color: #2D241E; font-weight: bold; text-align: right; padding: 6px 0;">${name}</td>
            </tr>
            <tr>
              <td class="detail-label" style="color: #6D8273; padding: 6px 0;">Workshop:</td>
              <td class="detail-value" style="color: #2D241E; font-weight: bold; text-align: right; padding: 6px 0;">${workshop}</td>
            </tr>
            <tr>
              <td class="detail-label" style="color: #6D8273; padding: 6px 0;">Collection Method:</td>
              <td class="detail-value" style="color: #2D241E; font-weight: bold; text-align: right; padding: 6px 0;">${method}</td>
            </tr>
            <tr>
              <td class="detail-label" style="color: #6D8273; padding: 6px 0;">Pickup Location:</td>
              <td class="detail-value" style="color: #2D241E; font-weight: bold; text-align: right; padding: 6px 0;">${branchName}</td>
            </tr>
            <tr>
              <td class="detail-label" style="color: #6D8273; padding: 6px 0;">Address:</td>
              <td class="detail-value" style="color: #665950; font-size: 12px; text-align: right; padding: 6px 0;">${branchAddress}</td>
            </tr>
            <tr>
              <td class="detail-label" style="color: #6D8273; padding: 6px 0;">Studio Opening Hours:</td>
              <td class="detail-value" style="color: #2D241E; font-weight: 500; font-size: 12.5px; text-align: right; padding: 6px 0;">Tue – Sun: 10:00 AM – 6:30 PM (Closed Mondays)</td>
            </tr>
          </table>
        </div>

        ${params.customMessage ? `
        <div class="highlight-box">
          <strong>Note from Studio Staff:</strong> ${params.customMessage}
        </div>` : ''}

        <div style="margin-bottom: 24px;">
          <h4 style="color: #2D241E; margin-bottom: 10px; font-size: 15px;">${cfg.tipsOrNotesTitle || 'Pickup Instructions:'}</h4>
          <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #5A4E47; line-height: 1.7;">
            ${tipsList.map(t => `<li>${t}</li>`).join('')}
          </ul>
        </div>

        <p style="font-size: 14px; color: #5A4E47; margin-bottom: 0;">
          ${footerNote}
        </p>
      </div>

      <div class="footer">
        <p style="margin: 0 0 6px 0; font-weight: bold; color: #2D241E;">${settings.senderName}</p>
        <p style="margin: 0 0 6px 0;">${settings.signatureTagline}</p>
        <p style="margin: 0;">Phone: ${settings.studioPhone} &bull; Email: <a href="mailto:${settings.fromEmail}">${settings.fromEmail}</a></p>
      </div>
    </div>
  </div>
</body>
</html>
  `;

  const text = `
${headerTitle} - ${headerSubtitle}

${leadGreeting}

${leadMessage}

Pickup Location: ${branchName}
Address: ${branchAddress}
Opening Hours: Tue - Sun (10:00 AM - 6:30 PM)
Method: ${method}

${cfg.tipsOrNotesTitle || 'Pickup Instructions'}:
${tipsList.map(t => `- ${t}`).join('\n')}

${footerNote}

Warm regards,
${settings.senderName}
Phone: ${settings.studioPhone}
  `.trim();

  return { subject, html, text };
}

export function generatePaymentReceiptEmail(params: TemplateParams): { subject: string; html: string; text: string } {
  const settings = params.settings || DEFAULT_BUSINESS_SETTINGS;
  const cfg = params.templateConfig || DEFAULT_TEMPLATE_CONFIGS.receipt;
  const name = params.customerName || 'Valued Customer';
  const workshop = params.workshopName || 'Workshop Session';
  const date = params.bookingDate || params.date || new Date().toISOString().split('T')[0];
  const pax = params.pax || 1;
  const isSettlement = Boolean(params.balancePaid || params.paintingPieces || params.deliveryFee || (params.drinksDiscountCount && params.drinksDiscountCount > 0) || (params.selectedItems && params.selectedItems.length > 0));
  const isPayLater = Boolean(params.paymentLater);
  
  const deposit = params.depositPaid ? (params.depositAmount || 0) : 0;
  const workshopTotal = params.totalPrice || 0;
  const paintingPieces = params.paintingPieces || 0;
  const paintingPrice = params.paintingPrice || 0;
  const deliveryFee = params.deliveryFee || 0;
  const drinksDiscountCount = params.drinksDiscountCount || 0;
  const drinksDiscount = drinksDiscountCount * 10;
  
  // Calculate grand subtotal before deposit
  let grandSubtotal = workshopTotal;
  if (params.selectedItems && params.selectedItems.length > 0) {
    grandSubtotal = params.selectedItems.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 1)), 0);
  } else {
    grandSubtotal = workshopTotal + paintingPrice;
  }
  grandSubtotal = grandSubtotal + deliveryFee - drinksDiscount;
  if (grandSubtotal < 0) grandSubtotal = 0;

  // Final paid or due amount
  const balancePaidAmount = Math.max(0, grandSubtotal - deposit);
  const totalSettledAmount = isSettlement ? (isPayLater ? balancePaidAmount : grandSubtotal) : (deposit > 0 ? deposit : workshopTotal);

  const docTitle = isPayLater ? 'Tax Invoice' : 'Official Receipt';
  const statusBadge = isPayLater ? 'PAYMENT DUE' : 'PAID IN FULL';
  const statusBadgeColor = isPayLater ? '#D97706' : '#059669';
  const statusBadgeBg = isPayLater ? '#FEF3C7' : '#ECFDF5';
  const statusBadgeBorder = isPayLater ? '#F59E0B' : '#10B981';

  const defaultRefPrefix = isPayLater ? 'INV-' : 'REC-';
  const ref = params.bookingId
    ? (params.bookingId.startsWith('INV-') || params.bookingId.startsWith('REC-') ? params.bookingId : `${defaultRefPrefix}${formatDocReference('receipt', date)}`)
    : `${defaultRefPrefix}${formatDocReference('receipt', date)}`;
  const accentColor = '#2D241E';

  const subject = isPayLater 
    ? `Tax Invoice: ${workshop} ${ref} – Nendoa Studio`
    : (cfg.subject || `Official Payment Receipt: {{workshop}} ${ref} – Nendoa Studio`)
        .replace(/\{\{customerName\}\}/g, name)
        .replace(/\{\{workshop\}\}/g, isSettlement ? `Session Settlement for ${workshop}` : workshop);

  const footerNote = (cfg.footerNote || `For billing questions or receipt inquiries, please contact {{fromEmail}}.`)
    .replace(/\{\{fromEmail\}\}/g, settings.fromEmail)
    .replace(/\{\{studioPhone\}\}/g, settings.studioPhone);

  // Build items array
  const tableRows: Array<{ name: string; subtitle?: string; qty: number; unitPrice: number; total: number; isDeduction?: boolean }> = [];

  if (isSettlement) {
    if (params.selectedItems && params.selectedItems.length > 0) {
      params.selectedItems.forEach(item => {
        tableRows.push({
          name: item.name,
          subtitle: 'Selected Ceramic Item',
          qty: item.quantity,
          unitPrice: item.price,
          total: item.price * item.quantity,
        });
      });
    } else {
      tableRows.push({
        name: workshop,
        subtitle: `Workshop Session (${pax} pax)`,
        qty: pax,
        unitPrice: pax > 0 ? (workshopTotal / pax) : workshopTotal,
        total: workshopTotal,
      });
    }

    if (paintingPrice > 0) {
      tableRows.push({
        name: 'Add-on Ceramic Pieces / Colour Painting',
        subtitle: `${paintingPieces} additional piece(s) painted`,
        qty: paintingPieces || 1,
        unitPrice: paintingPieces > 0 ? (paintingPrice / paintingPieces) : paintingPrice,
        total: paintingPrice,
      });
    }

    if (deliveryFee > 0) {
      tableRows.push({
        name: 'Courier Delivery Service',
        subtitle: 'Doorstep parcel delivery upon completion',
        qty: 1,
        unitPrice: deliveryFee,
        total: deliveryFee,
      });
    }

    if (drinksDiscount > 0) {
      tableRows.push({
        name: `Drinks Discount Promotion (${drinksDiscountCount} items)`,
        subtitle: '-RM 10.00 rebate per item',
        qty: drinksDiscountCount,
        unitPrice: -10,
        total: -drinksDiscount,
        isDeduction: true,
      });
    }
  } else {
    // Advance Deposit Only
    tableRows.push({
      name: deposit > 0 ? `Advance Deposit for ${workshop}` : workshop,
      subtitle: `Scheduled Pottery Experience (${pax} pax) on ${date}`,
      qty: 1,
      unitPrice: deposit > 0 ? deposit : workshopTotal,
      total: deposit > 0 ? deposit : workshopTotal,
    });
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #FAF4F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #2D241E; -webkit-font-smoothing: antialiased; }
    .wrapper { width: 100%; background-color: #FAF4F0; padding: 36px 12px; }
    .receipt-card { max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #D9D1C7; box-shadow: 0 6px 28px rgba(45, 36, 30, 0.07); padding: 36px 30px; }
    .header { text-align: center; border-bottom: 1.5px dashed #D9D1C7; padding-bottom: 24px; margin-bottom: 24px; }
    .doc-title { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; text-transform: uppercase; letter-spacing: 1.5px; font-size: 22px; margin: 0 0 6px 0; color: #2D241E; font-weight: 900; }
    .studio-title { text-transform: uppercase; letter-spacing: 3px; font-size: 11px; font-weight: 800; color: #2D241E; margin: 6px 0 3px 0; }
    .ssm { font-size: 9.5px; font-weight: 600; color: #8C8379; letter-spacing: 0.5px; margin: 0; }
    .address { font-size: 9px; color: #8C8379; margin: 6px 0 0 0; line-height: 1.5; text-transform: uppercase; letter-spacing: 0.3px; }
    .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px; }
    .meta-box h4 { text-transform: uppercase; font-size: 8.5px; letter-spacing: 1px; color: #8C8379; margin: 0 0 3px 0; font-weight: 800; }
    .meta-box p { margin: 0 0 4px 0; color: #2D241E; font-size: 13px; font-weight: 700; }
    .status-stamp { display: inline-block; border: 1.5px solid ${statusBadgeBorder}; color: ${statusBadgeColor}; background: ${statusBadgeBg}; padding: 4px 10px; border-radius: 6px; font-size: 9.5px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; margin-top: 6px; }
    .item-table { width: 100%; border-collapse: collapse; margin: 24px 0; font-size: 12px; }
    .item-table th { background: transparent; padding: 10px 4px; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #8C8379; border-top: 1px solid #D9D1C7; border-bottom: 1px solid #D9D1C7; font-weight: 800; text-align: left; }
    .item-table td { padding: 12px 4px; border-bottom: 1px solid #E6E1DA; font-size: 12px; color: #2D241E; }
    .care-note { background: #FAF9F6; border: 1px solid #E6E1DA; border-radius: 10px; padding: 14px 18px; margin: 20px 0; font-size: 11.5px; color: #5A4E47; line-height: 1.5; }
    .footer { margin-top: 28px; text-align: center; font-size: 9.5px; color: #A69D94; border-top: 1.5px dashed #D9D1C7; padding-top: 20px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="receipt-card">
      <div class="header">
        <h1 class="doc-title">${docTitle}</h1>
        <p class="studio-title">NENDOA STUDIO ENTERPRISE</p>
        <p class="ssm">SSM Reg No: 202403185935 (PG0558602-T)</p>
        <p class="address">214, Lebuh Victoria,<br/>10300 Georgetown, Pulau Pinang</p>
      </div>

      <table class="meta-table">
        <tr>
          <td class="meta-box" style="vertical-align: top; width: 55%;">
            <h4>${isPayLater ? 'Bill To / Customer' : 'Sold To / Customer'}</h4>
            <p>${name}</p>
            ${params.customerEmail ? `<div style="font-size: 10px; color: #8C8379; font-family: monospace;">${params.customerEmail}</div>` : ''}
            ${params.customerPhone ? `<div style="font-size: 10px; color: #8C8379; font-family: monospace;">${params.customerPhone}</div>` : ''}
          </td>
          <td class="meta-box" style="vertical-align: top; text-align: right; width: 45%;">
            <h4>${docTitle} Ref</h4>
            <p style="font-family: monospace; font-size: 12.5px; color: #2D241E;">${ref}</p>
            <h4 style="margin-top: 8px;">Date & Time</h4>
            <div style="font-size: 11px; font-weight: 600; color: #2D241E;">${date}</div>
          </td>
        </tr>
      </table>

      <table class="item-table">
        <thead>
          <tr>
            <th>Item / Description</th>
            <th style="text-align: center; width: 45px;">Qty</th>
            <th style="text-align: right; width: 90px;">Unit Price (RM)</th>
            <th style="text-align: right; width: 100px;">Total (MYR)</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows.map(row => `
            <tr>
              <td>
                <strong style="${row.isDeduction ? 'color: #D97706;' : ''}">${row.name}</strong>
                ${row.subtitle ? `<div style="font-size: 10px; color: #8C8379; margin-top: 2px;">${row.subtitle}</div>` : ''}
              </td>
              <td style="text-align: center; font-family: monospace;">${row.qty}</td>
              <td style="text-align: right; font-family: monospace; color: #8C8379;">${row.unitPrice < 0 ? `-RM ${Math.abs(row.unitPrice).toFixed(2)}` : `RM ${row.unitPrice.toFixed(2)}`}</td>
              <td style="text-align: right; font-weight: 700; font-family: monospace; ${row.isDeduction ? 'color: #D97706;' : ''}">
                ${row.total < 0 ? `-RM ${Math.abs(row.total).toFixed(2)}` : `RM ${row.total.toFixed(2)}`}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="text-align: right; margin-top: 16px; margin-bottom: 24px;">
        <table style="display: inline-table; width: 280px; font-size: 12px; border-collapse: collapse; border: none;">
          ${isSettlement ? `
            <tr>
              <td style="color: #8C8379; padding: 4px 0;">Subtotal</td>
              <td style="text-align: right; font-family: monospace; color: #2D241E; padding: 4px 0;">RM ${grandSubtotal.toFixed(2)}</td>
            </tr>
            ${deposit > 0 ? `
              <tr>
                <td style="color: #059669; font-weight: 600; padding: 4px 0;">Minus Deposit</td>
                <td style="text-align: right; font-family: monospace; color: #059669; font-weight: 600; padding: 4px 0;">-RM ${deposit.toFixed(2)}</td>
              </tr>
            ` : ''}
            <tr style="border-top: 1px solid #D9D1C7;">
              <td style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #2D241E; padding-top: 10px;">
                ${isPayLater ? 'Total Due' : 'Grand Total Paid'}
              </td>
              <td style="text-align: right; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 18px; font-weight: 800; color: ${accentColor}; padding-top: 10px;">
                RM ${balancePaidAmount.toFixed(2)}
              </td>
            </tr>
          ` : `
            <tr>
              <td style="color: #8C8379; padding: 4px 0;">Subtotal</td>
              <td style="text-align: right; font-family: monospace; color: #2D241E; padding: 4px 0;">RM ${(deposit > 0 ? deposit : workshopTotal).toFixed(2)}</td>
            </tr>
            <tr style="border-top: 1px solid #D9D1C7;">
              <td style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #2D241E; padding-top: 10px;">${isPayLater ? 'Total Due' : 'Grand Total Paid'}</td>
              <td style="text-align: right; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 18px; font-weight: 800; color: ${accentColor}; padding-top: 10px;">RM ${(deposit > 0 ? deposit : workshopTotal).toFixed(2)}</td>
            </tr>
          `}
        </table>
      </div>

      ${params.customMessage ? `
      <div class="care-note">
        <strong>Studio Note:</strong> ${params.customMessage}
      </div>` : ''}

      <div class="footer">
        <p style="margin: 0 0 4px 0;">Email: hello@nendoastudio.com | WhatsApp: +60 12-889 2030</p>
        <p style="margin: 0 0 4px 0; font-style: italic; color: #8C8379;">
          Thank you for supporting handcrafted ceramic pottery.
        </p>
        <p style="margin: 0; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
          NENDOA STUDIO ENTERPRISE &bull; Computer Generated ${docTitle}
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `;

  const text = `
==============================
NENDOA STUDIO ENTERPRISE
SSM Reg No: 202403185935 (PG0558602-T)
214, Lebuh Victoria, 10300 Georgetown, Pulau Pinang
Email: hello@nendoastudio.com | WhatsApp: +60 12-889 2030
==============================
${docTitle.toUpperCase()}
Reference   : ${ref}
Date & Time : ${date}
Customer    : ${name}
Status      : ${statusBadge}
------------------------------
ITEMS BREAKDOWN:
${tableRows.map(r => `• ${r.name} (${r.qty}x) - RM ${r.total.toFixed(2)}`).join('\n')}
------------------------------
${isSettlement ? `SUBTOTAL           : RM ${grandSubtotal.toFixed(2)}
${deposit > 0 ? `MINUS DEPOSIT      : -RM ${deposit.toFixed(2)}\n` : ''}${isPayLater ? 'TOTAL DUE' : 'GRAND TOTAL PAID'}  : RM ${balancePaidAmount.toFixed(2)}` : `SUBTOTAL           : RM ${(deposit > 0 ? deposit : workshopTotal).toFixed(2)}
${isPayLater ? 'TOTAL DUE' : 'GRAND TOTAL PAID'}  : RM ${(deposit > 0 ? deposit : workshopTotal).toFixed(2)}`}
==============================
Thank you for supporting handcrafted ceramic pottery.
For inquiries or questions, contact hello@nendoastudio.com.
  `.trim();

  return { subject, html, text };
}

export function generateCustomEmail(params: TemplateParams & { customSubject?: string; bodyContent?: string }): { subject: string; html: string; text: string } {
  const settings = params.settings || DEFAULT_BUSINESS_SETTINGS;
  const cfg = params.templateConfig || DEFAULT_TEMPLATE_CONFIGS.custom;
  const name = params.customerName || 'Valued Customer';
  const subject = params.customSubject || cfg.subject || `Message from ${settings.senderName}`;
  const body = params.bodyContent || `<p>Dear ${name},</p><p>${cfg.leadMessage}</p>`;
  const headerTitle = cfg.headerTitle || 'NENDOA STUDIO';
  const headerSubtitle = cfg.headerSubtitle || 'Studio Communication';
  const accentColor = cfg.accentColor || '#C86A4B';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #FAF4F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #2D241E; }
    .wrapper { width: 100%; background-color: #FAF4F0; padding: 40px 10px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #EFE4DC; box-shadow: 0 4px 20px rgba(200, 106, 75, 0.06); }
    .header { background: ${accentColor}; padding: 32px 30px; text-align: center; color: #FFFFFF; }
    .logo-text { font-family: Georgia, serif; font-size: 24px; font-weight: bold; letter-spacing: 2px; margin: 0; }
    .sub-tagline { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; margin-top: 6px; opacity: 0.9; }
    .content { padding: 36px 32px; font-size: 15px; line-height: 1.7; color: #4A3E37; }
    .footer { background-color: #F5EDE6; padding: 24px 30px; text-align: center; font-size: 12px; color: #8C7E74; line-height: 1.6; border-top: 1px solid #EADDCF; }
    .footer a { color: ${accentColor}; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1 class="logo-text">${headerTitle}</h1>
        <p class="sub-tagline">${headerSubtitle}</p>
      </div>
      <div class="content">
        ${body}
      </div>
      <div class="footer">
        <p style="margin: 0 0 6px 0; font-weight: bold; color: #2D241E;">${settings.senderName}</p>
        <p style="margin: 0 0 6px 0;">${settings.signatureTagline}</p>
        <p style="margin: 0;">Phone: ${settings.studioPhone} &bull; Email: <a href="mailto:${settings.fromEmail}">${settings.fromEmail}</a></p>
      </div>
    </div>
  </div>
</body>
</html>
  `;

  const text = body.replace(/<[^>]*>?/gm, '');
  return { subject, html, text };
}

export interface ProductSaleEmailParams {
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  itemsDescription: string;
  quantity?: number;
  unitPrice?: number;
  totalAmount: number;
  paymentDate?: string;
  transactionRef?: string;
  location?: 'PG' | 'BM' | 'ALL';
  staffName?: string;
  customMessage?: string;
  settings?: BusinessEmailSettings;
  type?: 'receipt' | 'invoice';
}

export function generateProductSaleReceiptEmail(params: ProductSaleEmailParams): { subject: string; html: string; text: string } {
  const settings = params.settings || DEFAULT_BUSINESS_SETTINGS;
  const name = params.customerName || 'Valued Customer';
  const date = params.paymentDate || new Date().toISOString().split('T')[0];
  const docType = params.type || 'receipt';
  const docTitle = docType === 'invoice' ? 'Tax Invoice' : 'Official Receipt';
  const accentColor = '#2D241E'; // Black / deep charcoal for both invoice and receipt
  const ref = params.transactionRef
    ? (params.transactionRef.startsWith('INV-') || params.transactionRef.startsWith('REC-') ? params.transactionRef : formatDocReference(docType, date))
    : formatDocReference(docType, date);
  const qty = params.quantity || 1;
  const total = params.totalAmount || 0;
  const unit = params.unitPrice || (total / qty);

  const subject = `${docTitle}: ${params.itemsDescription} ${ref} – Nendoa Studio`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #FAF4F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #2D241E; -webkit-font-smoothing: antialiased; }
    .wrapper { width: 100%; background-color: #FAF4F0; padding: 36px 12px; }
    .receipt-card { max-width: 580px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #D9D1C7; box-shadow: 0 6px 28px rgba(45, 36, 30, 0.07); padding: 36px 30px; }
    .header { text-align: center; border-bottom: 1.5px dashed #D9D1C7; padding-bottom: 24px; margin-bottom: 24px; }
    .doc-title { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; text-transform: uppercase; letter-spacing: 1.5px; font-size: 22px; margin: 0 0 6px 0; color: ${accentColor}; font-weight: 900; }
    .studio-title { text-transform: uppercase; letter-spacing: 3px; font-size: 11px; font-weight: 800; color: #2D241E; margin: 6px 0 3px 0; }
    .ssm { font-size: 9.5px; font-weight: 600; color: #8C8379; letter-spacing: 0.5px; margin: 0; }
    .address { font-size: 9px; color: #8C8379; margin: 6px 0 0 0; line-height: 1.5; text-transform: uppercase; letter-spacing: 0.3px; }
    .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px; }
    .meta-box h4 { text-transform: uppercase; font-size: 8.5px; letter-spacing: 1px; color: #8C8379; margin: 0 0 3px 0; font-weight: 800; }
    .meta-box p { margin: 0 0 4px 0; color: #2D241E; font-size: 13px; font-weight: 700; }
    .paid-stamp { display: inline-block; border: 1.5px solid #10B981; color: #065F46; background: #ECFDF5; padding: 4px 10px; border-radius: 6px; font-size: 9.5px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; margin-top: 6px; }
    .item-table { width: 100%; border-collapse: collapse; margin: 24px 0; font-size: 12px; }
    .item-table th { background: transparent; padding: 10px 4px; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #8C8379; border-top: 1px solid #D9D1C7; border-bottom: 1px solid #D9D1C7; font-weight: 800; text-align: left; }
    .item-table td { padding: 12px 4px; border-bottom: 1px solid #E6E1DA; font-size: 12px; color: #2D241E; }
    .care-note { background: #FAF9F6; border: 1px solid #E6E1DA; border-radius: 10px; padding: 14px 18px; margin: 20px 0; font-size: 11.5px; color: #5A4E47; line-height: 1.5; }
    .footer { margin-top: 28px; text-align: center; font-size: 9.5px; color: #A69D94; border-top: 1.5px dashed #D9D1C7; padding-top: 20px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="receipt-card">
      <div class="header">
        <h1 class="doc-title">${docTitle}</h1>
        <p class="studio-title">NENDOA STUDIO ENTERPRISE</p>
        <p class="ssm">SSM Reg No: 202403185935 (PG0558602-T)</p>
        <p class="address">214, Lebuh Victoria,<br/>10300 Georgetown, Pulau Pinang</p>
      </div>

      <table class="meta-table">
        <tr>
          <td class="meta-box" style="vertical-align: top; width: 55%;">
            <h4>${docType === 'invoice' ? 'Bill To / Customer' : 'Sold To / Customer'}</h4>
            <p>${name}</p>
            ${params.customerEmail ? `<div style="font-size: 10px; color: #8C8379; font-family: monospace;">${params.customerEmail}</div>` : ''}
            ${params.customerPhone ? `<div style="font-size: 10px; color: #8C8379; font-family: monospace;">${params.customerPhone}</div>` : ''}
          </td>
          <td class="meta-box" style="vertical-align: top; text-align: right; width: 45%;">
            <h4>${docTitle} Ref</h4>
            <p style="font-family: monospace; font-size: 12.5px; color: #2D241E;">${ref}</p>
            <h4 style="margin-top: 8px;">Date & Time</h4>
            <div style="font-size: 11px; font-weight: 600; color: #2D241E;">${date}</div>
          </td>
        </tr>
      </table>

      <table class="item-table">
        <thead>
          <tr>
            <th>Item / Description</th>
            <th style="text-align: center; width: 50px;">Qty</th>
            <th style="text-align: right; width: 100px;">Amount (MYR)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>${params.itemsDescription}</strong>
              ${qty > 1 ? `<div style="color: #8C8379; font-size: 11px; margin-top: 2px;">@ RM ${unit.toFixed(2)} / unit</div>` : ''}
            </td>
            <td style="text-align: center; font-family: monospace;">${qty}</td>
            <td style="text-align: right; font-weight: 700; font-family: monospace;">RM ${total.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <div style="text-align: right; margin-top: 16px; margin-bottom: 24px;">
        <table style="display: inline-table; width: 260px; font-size: 12px; border-collapse: collapse; border: none;">
          <tr>
            <td style="color: #8C8379; padding: 4px 0;">Subtotal</td>
            <td style="text-align: right; font-family: monospace; color: #2D241E; padding: 4px 0;">RM ${total.toFixed(2)}</td>
          </tr>
          <tr style="border-top: 1px solid #D9D1C7;">
            <td style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #2D241E; padding-top: 10px;">${docType === 'invoice' ? 'Total Due' : 'Grand Total Paid'}</td>
            <td style="text-align: right; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 18px; font-weight: 800; color: ${accentColor}; padding-top: 10px;">RM ${total.toFixed(2)}</td>
          </tr>
        </table>
      </div>

      ${params.customMessage ? `
      <div class="care-note">
        <strong>Studio Note:</strong> ${params.customMessage}
      </div>` : ''}

      <div class="footer">
        <p style="margin: 0 0 4px 0;">Email: hello@nendoastudio.com | WhatsApp: +60 12-889 2030</p>
        <p style="margin: 0 0 4px 0; font-style: italic; color: #8C8379;">
          Thank you for supporting handcrafted ceramic pottery.
        </p>
        <p style="margin: 0; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
          NENDOA STUDIO ENTERPRISE &bull; Computer Generated ${docTitle}
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `;

  const text = `
==============================
NENDOA STUDIO ENTERPRISE
SSM Reg No: 202403185935 (PG0558602-T)
214, Lebuh Victoria, 10300 Georgetown, Pulau Pinang
Email: hello@nendoastudio.com | WhatsApp: +60 12-889 2030
==============================
${docTitle.toUpperCase()}
Document No : ${ref}
Date & Time : ${date}
Customer    : ${name}
Status      : ${docType === 'invoice' ? 'PAYMENT DUE' : 'PAID IN FULL'}
------------------------------
ITEM BREAKDOWN:
• ${params.itemsDescription}
  Qty: ${qty} | Unit Price: RM ${unit.toFixed(2)}
  Line Total: RM ${total.toFixed(2)}
------------------------------
SUBTOTAL   : RM ${total.toFixed(2)}
${docType === 'invoice' ? 'TOTAL DUE  ' : 'TOTAL PAID '} : RM ${total.toFixed(2)}
==============================
Thank you for supporting handcrafted ceramic pottery at Nendoa Studio!
For inquiries or questions, contact hello@nendoastudio.com.
  `.trim();

  return { subject, html, text };
}

// Log sent emails to Firestore
export async function logSentEmail(logData: Omit<EmailLog, 'id' | 'createdAt'> & { createdAt?: string }): Promise<string | null> {
  try {
    const docRef = await addDoc(collection(db, 'email_logs'), {
      ...logData,
      createdAt: logData.createdAt || new Date().toISOString(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error logging sent email to Firestore:', error);
    return null;
  }
}

// Dispatches business email via backend API or logs simulation
export async function sendBusinessEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  templateType?: string;
  customerName?: string;
  bookingId?: string;
  transactionId?: string;
  fromName?: string;
  attachments?: Array<{
    filename: string;
    content?: string;
    contentType?: string;
    path?: string;
  }>;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        fromName: params.fromName || DEFAULT_BUSINESS_SETTINGS.senderName,
        attachments: params.attachments,
      }),
    });

    const data = await response.json();

    await logSentEmail({
      to: params.to,
      subject: params.subject,
      templateType: (params.templateType as any) || 'receipt',
      status: data.success ? (data.simulated ? 'simulated' : 'delivered') : 'failed',
      fromEmail: DEFAULT_BUSINESS_SETTINGS.fromEmail,
      fromName: params.fromName || DEFAULT_BUSINESS_SETTINGS.senderName,
      customerName: params.customerName || 'Customer',
      bookingId: params.bookingId,
      transactionId: params.transactionId,
      bodyHtml: params.html,
      messageId: data.messageId,
      errorMessage: data.error,
    });

    return {
      success: !!data.success,
      messageId: data.messageId,
      error: data.error,
    };
  } catch (err: any) {
    console.error('sendBusinessEmail error:', err);
    await logSentEmail({
      to: params.to,
      subject: params.subject,
      templateType: (params.templateType as any) || 'receipt',
      status: 'failed',
      fromEmail: DEFAULT_BUSINESS_SETTINGS.fromEmail,
      fromName: params.fromName || DEFAULT_BUSINESS_SETTINGS.senderName,
      customerName: params.customerName || 'Customer',
      bookingId: params.bookingId,
      transactionId: params.transactionId,
      bodyHtml: params.html,
      errorMessage: err?.message || 'Network error',
    });
    return {
      success: false,
      error: err?.message || 'Network failure',
    };
  }
}

export const DEFAULT_REWIND_SETTINGS: any = {
  studioName: 'Rewind',
  tagline: 'Film Lab & Vintage Cameras',
  currency: 'RM',
  phone: '+60 12-345 6789',
  email: 'hello@rewindfilmlab.com',
  address: '12-A, Jalan Gurdwara, 10300 George Town, Penang, Malaysia',
  operatingHours: '11:00 AM - 7:00 PM (Daily)',
  bankName: 'Maybank',
  bankAccountNo: '5123 4567 8901',
  bankAccountName: 'Rewind Studio Enterprise',
  priceC41: 18,
  priceBW: 22,
  priceECN2: 28,
  staffAllowedTabs: [
    'dashboard',
    'calendar',
    'film-registration',
    'invoices-receipts',
    'pickups',
    'pos',
    'products'
  ]
};

// ==========================================
// REWIND FILM LAB EMAIL GENERATORS
// ==========================================

export function generateFilmInvoiceEmail(order: any, settings: any = DEFAULT_REWIND_SETTINGS): { subject: string; html: string; text: string } {
  const currency = settings.currency || 'RM';
  const studioName = settings.studioName || 'Rewind';
  const invoiceNo = order.invoiceNumber || `INV-${order.orderNumber}`;
  const total = Number(order.totalPrice || 0).toFixed(2);
  const unit = Number(order.unitPrice || 0).toFixed(2);
  const dateStr = order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');

  const subject = `Invoice ${invoiceNo} – Film Wash Order (${order.filmType}) – ${studioName}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #FAF7F2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1C1917; }
    .wrapper { width: 100%; background-color: #FAF7F2; padding: 36px 12px; }
    .card { max-width: 620px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #E7E0D8; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.04); }
    .header { background: #1C1917; color: #FFFFFF; padding: 30px; text-align: center; }
    .header h1 { font-family: Georgia, serif; font-size: 26px; letter-spacing: 2px; margin: 0 0 6px 0; }
    .header p { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #D6D3D1; margin: 0; }
    .body { padding: 32px 30px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; background: #FEF3C7; color: #92400E; margin-bottom: 20px; }
    .meta-grid { width: 100%; margin-bottom: 24px; border-collapse: collapse; }
    .meta-grid td { padding: 6px 0; font-size: 13px; vertical-align: top; }
    .meta-label { color: #78716C; width: 140px; font-weight: 500; }
    .meta-val { color: #1C1917; font-weight: 600; }
    .items-table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; }
    .items-table th { background: #F5EFEB; padding: 10px 14px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #57534E; border-bottom: 1px solid #E7E0D8; }
    .items-table td { padding: 14px; border-bottom: 1px solid #F5EFEB; }
    .total-box { margin-top: 16px; padding: 18px 20px; background: #FAF7F2; border-radius: 12px; text-align: right; }
    .bank-box { margin-top: 24px; padding: 20px; background: #F5F5F4; border-radius: 12px; border-left: 4px solid #D95328; }
    .footer { background: #F5EFEB; padding: 22px 30px; text-align: center; font-size: 12px; color: #78716C; border-top: 1px solid #E7E0D8; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>${studioName.toUpperCase()}</h1>
        <p>Film Lab & Vintage Cameras</p>
      </div>
      <div class="body">
        <div class="badge">Payment Due &bull; Invoice Generated</div>
        <h2 style="font-size: 20px; margin: 0 0 16px 0;">Film Wash & Development Invoice</h2>
        <p style="font-size: 14px; color: #57534E; line-height: 1.6; margin-bottom: 24px;">
          Hi <strong>${order.customerName}</strong>, thank you for dropping off your film at ${studioName}! We have safely received your order and registered your envelope. Please find your invoice details below.
        </p>

        <table class="meta-grid">
          <tr>
            <td class="meta-label">Invoice Number</td>
            <td class="meta-val" style="font-family: monospace;">${invoiceNo}</td>
          </tr>
          <tr>
            <td class="meta-label">Order Ref</td>
            <td class="meta-val" style="font-family: monospace;">${order.orderNumber}</td>
          </tr>
          <tr>
            <td class="meta-label">Envelope Number</td>
            <td class="meta-val" style="font-weight: 700; color: #D95328;">${order.envelopeNumber}</td>
          </tr>
          <tr>
            <td class="meta-label">Customer Contact</td>
            <td class="meta-val">${order.customerPhone} &bull; ${order.customerEmail}</td>
          </tr>
          <tr>
            <td class="meta-label">Date Received</td>
            <td class="meta-val">${dateStr}</td>
          </tr>
          ${order.remark ? `
          <tr>
            <td class="meta-label">Special Remark</td>
            <td class="meta-val" style="font-style: italic; color: #44403C;">${order.remark}</td>
          </tr>` : ''}
        </table>

        <table class="items-table">
          <thead>
            <tr>
              <th>Description</th>
              <th style="text-align: center;">Qty</th>
              <th style="text-align: right;">Rate</th>
              <th style="text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>${order.filmType} Process</strong><br/>
                <span style="font-size: 11px; color: #78716C;">Film Wash, Development & High-Res Digital Scans</span>
              </td>
              <td style="text-align: center; font-weight: 600;">${order.quantity} roll${order.quantity > 1 ? 's' : ''}</td>
              <td style="text-align: right; color: #78716C;">${currency} ${unit}</td>
              <td style="text-align: right; font-weight: 700;">${currency} ${total}</td>
            </tr>
          </tbody>
        </table>

        <div class="total-box">
          <div style="font-size: 12px; color: #78716C; text-transform: uppercase; letter-spacing: 1px;">Total Amount Due</div>
          <div style="font-size: 26px; font-weight: 800; color: #1C1917; margin-top: 4px;">${currency} ${total}</div>
        </div>

        <div class="bank-box">
          <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #1C1917; margin-bottom: 8px;">
            Payment Instructions
          </div>
          <p style="font-size: 13px; line-height: 1.6; margin: 0; color: #44403C;">
            <strong>Bank:</strong> ${settings.bankName || 'Maybank'}<br/>
            <strong>Account Number:</strong> <span style="font-family: monospace; font-size: 14px; font-weight: 700;">${settings.bankAccountNo || '5123 4567 8901'}</span><br/>
            <strong>Account Name:</strong> ${settings.bankAccountName || 'Rewind Studio Enterprise'}<br/>
            <strong>Reference:</strong> ${order.envelopeNumber} or ${order.orderNumber}
          </p>
          <p style="font-size: 11px; color: #78716C; margin: 10px 0 0 0;">
            You can also make payment in person at the counter via Cash, DuitNow QR, or Credit/Debit Card. An official payment receipt will be issued once confirmed.
          </p>
        </div>
      </div>
      <div class="footer">
        <p style="margin: 0 0 4px 0; font-weight: 600; color: #1C1917;">${studioName} &bull; ${settings.operatingHours || '11:00 AM - 7:00 PM (Daily)'}</p>
        <p style="margin: 0 0 4px 0;">${settings.address || 'George Town, Penang'}</p>
        <p style="margin: 0; font-size: 11px;">Phone / WhatsApp: ${settings.phone || '+60 12-345 6789'} &bull; Email: ${settings.email || 'hello@rewindfilmlab.com'}</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;

  const text = `
=============================================
${studioName.toUpperCase()} - FILM LAB & VINTAGE CAMERAS
INVOICE: ${invoiceNo}
=============================================
Order Ref: ${order.orderNumber}
Envelope: ${order.envelopeNumber}
Customer: ${order.customerName} (${order.customerPhone})
Date: ${dateStr}

ITEM:
• ${order.filmType} Process (${order.quantity} rolls @ ${currency} ${unit})
TOTAL DUE: ${currency} ${total}

PAYMENT INSTRUCTIONS:
Bank: ${settings.bankName || 'Maybank'}
Account No: ${settings.bankAccountNo || '5123 4567 8901'}
Account Name: ${settings.bankAccountName || 'Rewind Studio Enterprise'}
Payment Reference: ${order.envelopeNumber}

Thank you for trusting ${studioName} with your film!
  `.trim();

  return { subject, html, text };
}

export function generateFilmReceiptEmail(order: any, settings: any = DEFAULT_REWIND_SETTINGS): { subject: string; html: string; text: string } {
  const currency = settings.currency || 'RM';
  const studioName = settings.studioName || 'Rewind';
  const receiptNo = order.receiptNumber || `REC-${order.orderNumber}`;
  const total = Number(order.totalPrice || 0).toFixed(2);
  const paymentMethod = order.paymentMethod || 'Online transfer';
  const dateStr = order.receiptSentAt ? new Date(order.receiptSentAt).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');

  const subject = `Payment Confirmed & Official Receipt: ${receiptNo} – ${studioName}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #FAF7F2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1C1917; }
    .wrapper { width: 100%; background-color: #FAF7F2; padding: 36px 12px; }
    .card { max-width: 620px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #E7E0D8; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.04); }
    .header { background: #065F46; color: #FFFFFF; padding: 30px; text-align: center; }
    .header h1 { font-family: Georgia, serif; font-size: 26px; letter-spacing: 2px; margin: 0 0 6px 0; }
    .header p { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #A7F3D0; margin: 0; }
    .body { padding: 32px 30px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; background: #D1FAE5; color: #065F46; margin-bottom: 20px; }
    .meta-grid { width: 100%; margin-bottom: 24px; border-collapse: collapse; }
    .meta-grid td { padding: 6px 0; font-size: 13px; vertical-align: top; }
    .meta-label { color: #78716C; width: 140px; font-weight: 500; }
    .meta-val { color: #1C1917; font-weight: 600; }
    .items-table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; }
    .items-table th { background: #F5EFEB; padding: 10px 14px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #57534E; border-bottom: 1px solid #E7E0D8; }
    .items-table td { padding: 14px; border-bottom: 1px solid #F5EFEB; }
    .total-box { margin-top: 16px; padding: 18px 20px; background: #ECFDF5; border-radius: 12px; text-align: right; border: 1px solid #A7F3D0; }
    .footer { background: #F5EFEB; padding: 22px 30px; text-align: center; font-size: 12px; color: #78716C; border-top: 1px solid #E7E0D8; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>${studioName.toUpperCase()}</h1>
        <p>Official Payment Receipt</p>
      </div>
      <div class="body">
        <div class="badge">Payment Verified &bull; Official Receipt</div>
        <h2 style="font-size: 20px; margin: 0 0 16px 0;">Payment Confirmation</h2>
        <p style="font-size: 14px; color: #57534E; line-height: 1.6; margin-bottom: 24px;">
          Hi <strong>${order.customerName}</strong>, your payment for film processing has been confirmed and verified. Please find your official receipt details below.
        </p>

        <table class="meta-grid">
          <tr>
            <td class="meta-label">Receipt Number</td>
            <td class="meta-val" style="font-family: monospace; font-weight: 700; color: #065F46;">${receiptNo}</td>
          </tr>
          <tr>
            <td class="meta-label">Order Ref</td>
            <td class="meta-val" style="font-family: monospace;">${order.orderNumber}</td>
          </tr>
          <tr>
            <td class="meta-label">Envelope Number</td>
            <td class="meta-val" style="font-weight: 700; color: #D95328;">${order.envelopeNumber}</td>
          </tr>
          <tr>
            <td class="meta-label">Payment Method</td>
            <td class="meta-val">${paymentMethod}</td>
          </tr>
          <tr>
            <td class="meta-label">Date Verified</td>
            <td class="meta-val">${dateStr}</td>
          </tr>
          ${order.verifiedByStaff ? `
          <tr>
            <td class="meta-label">Verified By</td>
            <td class="meta-val">${order.verifiedByStaff}</td>
          </tr>` : ''}
        </table>

        <table class="items-table">
          <thead>
            <tr>
              <th>Description</th>
              <th style="text-align: center;">Qty</th>
              <th style="text-align: right;">Amount Paid</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>${order.filmType} Process</strong><br/>
                <span style="font-size: 11px; color: #78716C;">Film Wash, Development & High-Res Digital Scans</span>
              </td>
              <td style="text-align: center; font-weight: 600;">${order.quantity} roll${order.quantity > 1 ? 's' : ''}</td>
              <td style="text-align: right; font-weight: 700; color: #065F46;">${currency} ${total}</td>
            </tr>
          </tbody>
        </table>

        <div class="total-box">
          <div style="font-size: 12px; color: #065F46; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">Grand Total Paid in Full</div>
          <div style="font-size: 26px; font-weight: 800; color: #065F46; margin-top: 4px;">${currency} ${total}</div>
        </div>

        <p style="font-size: 13px; color: #57534E; line-height: 1.6; margin-top: 24px;">
          Our lab technicians are carefully washing and processing your negatives. As soon as your film is ready, you will receive an email notification containing a QR code to book your preferred negative pickup appointment slot!
        </p>
      </div>
      <div class="footer">
        <p style="margin: 0 0 4px 0; font-weight: 600; color: #1C1917;">${studioName} &bull; ${settings.operatingHours || '11:00 AM - 7:00 PM (Daily)'}</p>
        <p style="margin: 0 0 4px 0;">${settings.address || 'George Town, Penang'}</p>
        <p style="margin: 0; font-size: 11px;">Computer Generated Receipt &bull; ${settings.email || 'hello@rewindfilmlab.com'}</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;

  const text = `
=============================================
${studioName.toUpperCase()} - OFFICIAL PAYMENT RECEIPT
RECEIPT: ${receiptNo}
=============================================
Order: ${order.orderNumber}
Envelope: ${order.envelopeNumber}
Customer: ${order.customerName}
Payment Method: ${paymentMethod}
Status: PAID IN FULL (${currency} ${total})
Date: ${dateStr}

Thank you for choosing ${studioName}!
  `.trim();

  return { subject, html, text };
}

export function generateFilmPickupNotificationEmail(
  order: any, 
  settings: any = DEFAULT_REWIND_SETTINGS, 
  appointmentBookingUrl: string
): { subject: string; html: string; text: string } {
  const studioName = settings.studioName || 'Rewind';
  const envelope = order.envelopeNumber || 'Your Envelope';
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(appointmentBookingUrl)}`;

  const subject = `Your Film is Ready! Book Your Pick-up Appointment [Envelope ${envelope}] – ${studioName}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #FAF7F2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1C1917; }
    .wrapper { width: 100%; background-color: #FAF7F2; padding: 36px 12px; }
    .card { max-width: 620px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #E7E0D8; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.04); }
    .header { background: #D95328; color: #FFFFFF; padding: 32px 24px; text-align: center; }
    .header h1 { font-family: Georgia, serif; font-size: 26px; letter-spacing: 2px; margin: 0 0 6px 0; }
    .header p { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #FED7AA; margin: 0; }
    .body { padding: 32px 30px; }
    .badge { display: inline-block; padding: 5px 14px; border-radius: 6px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; background: #FFEDD5; color: #9A3412; margin-bottom: 20px; }
    .qr-container { text-align: center; margin: 28px 0; padding: 24px; background: #FAF7F2; border-radius: 16px; border: 1px dashed #D95328; }
    .qr-img { width: 190px; height: 190px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); background: #FFFFFF; padding: 8px; }
    .btn { display: inline-block; background: #D95328; color: #FFFFFF !important; font-weight: 700; font-size: 14px; padding: 14px 28px; border-radius: 8px; text-decoration: none; margin-top: 16px; box-shadow: 0 2px 6px rgba(217, 83, 40, 0.25); }
    .notice-box { margin-top: 24px; padding: 18px 20px; background: #FEF3C7; border-radius: 12px; border-left: 4px solid #F59E0B; }
    .footer { background: #F5EFEB; padding: 22px 30px; text-align: center; font-size: 12px; color: #78716C; border-top: 1px solid #E7E0D8; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>${studioName.toUpperCase()}</h1>
        <p>Film Lab & Negative Pick-up Service</p>
      </div>
      <div class="body">
        <div class="badge">Film Washed & Developed &bull; Ready for Pick-up</div>
        <h2 style="font-size: 22px; margin: 0 0 12px 0;">Good news, ${order.customerName}!</h2>
        <p style="font-size: 14.5px; color: #57534E; line-height: 1.6; margin-bottom: 20px;">
          Your <strong>${order.filmType}</strong> film (${order.quantity} roll${order.quantity > 1 ? 's' : ''}) in envelope <strong style="color: #D95328;">${envelope}</strong> has been successfully washed, developed, and cut into archival sleeves.
        </p>

        <div class="qr-container">
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #D95328; margin-bottom: 12px;">
            Scan QR to Book Your Pick-up Slot
          </div>
          <img src="${qrCodeUrl}" alt="Pick-up Appointment QR Code" class="qr-img" />
          <div style="margin-top: 16px;">
            <a href="${appointmentBookingUrl}" target="_blank" class="btn">
              Click Here to Choose Date & Time
            </a>
          </div>
          <div style="font-size: 11px; color: #78716C; margin-top: 12px;">
            Or visit: <a href="${appointmentBookingUrl}" style="color: #D95328; word-break: break-all;">${appointmentBookingUrl}</a>
          </div>
        </div>

        <div style="background: #F5F5F4; border-radius: 12px; padding: 18px 20px; font-size: 13px; line-height: 1.6; color: #44403C;">
          <div style="font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; color: #1C1917;">
            Operating Hours & Pick-up Rules
          </div>
          &bull; <strong>Operating Hours:</strong> 11:00 AM – 7:00 PM everyday<br/>
          &bull; <strong>Pick-up Slots:</strong> 1-hour appointment slots (11am-12pm, 12pm-1pm, 1pm-2pm, 2pm-3pm, 3pm-4pm, 4pm-5pm, 5pm-6pm, 6pm-7pm)<br/>
          &bull; <strong>Location:</strong> ${settings.address || '12-A, Jalan Gurdwara, George Town, Penang'}
        </div>

        <div class="notice-box">
          <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #92400E; margin-bottom: 4px;">
            Important: 1-Month Collection Window
          </div>
          <p style="font-size: 12.5px; line-height: 1.5; margin: 0; color: #78350F;">
            Please make your appointment and pick up your negatives <strong>within one month</strong> upon receiving this notification. Uncollected negatives after 30 days may be archived or recycled to maintain lab storage space.
          </p>
        </div>
      </div>
      <div class="footer">
        <p style="margin: 0 0 4px 0; font-weight: 600; color: #1C1917;">${studioName} &bull; ${settings.operatingHours || '11:00 AM - 7:00 PM (Daily)'}</p>
        <p style="margin: 0 0 4px 0;">${settings.address || 'George Town, Penang'}</p>
        <p style="margin: 0; font-size: 11px;">Phone / WhatsApp: ${settings.phone || '+60 12-345 6789'} &bull; Email: ${settings.email || 'hello@rewindfilmlab.com'}</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;

  const text = `
=============================================
${studioName.toUpperCase()} - YOUR FILM IS READY FOR PICK-UP!
=============================================
Customer: ${order.customerName}
Envelope: ${envelope}
Film: ${order.filmType} (${order.quantity} rolls)

Please book your pickup appointment within 1 month using this link:
${appointmentBookingUrl}

Operating Hours: 11:00 AM - 7:00 PM everyday (1-hour slots).
Store Address: ${settings.address || 'George Town, Penang'}

Thank you,
${studioName} Team
  `.trim();

  return { subject, html, text };
}
