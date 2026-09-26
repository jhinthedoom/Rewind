import { EmailTemplateConfig } from '../types';

export const DEFAULT_TEMPLATE_CONFIGS: Record<string, EmailTemplateConfig> = {
  booking_confirmation: {
    id: 'booking_confirmation',
    name: 'Booking Confirmation',
    subject: 'Booking Confirmed: {{workshop}} on {{date}} – Nendoa Studio',
    headerTitle: 'NENDOA STUDIO',
    headerSubtitle: 'Studio Workshop Confirmation',
    leadGreeting: 'Hello {{customerName}},',
    leadMessage: 'Thank you for choosing Nendoa Studio! Your session is officially confirmed. We are excited to guide you through crafting your own ceramic masterpieces.',
    tipsOrNotesTitle: 'Tips for Your Pottery Session:',
    tipsOrNotes: [
      'Attire: Wear comfortable clothes that you do not mind getting clay on (clay washes out easily!). Aprons are provided.',
      'Nails: Trimmed fingernails make wheel throwing and pinch potting significantly easier.',
      'Arrival: Please arrive 10 minutes prior to your session time so we can settle in and begin promptly.',
      'Firing Timeline: Your completed works will dry, undergo bisque firing, glazing, and final high firing (approx. 3–4 weeks). We will notify you by email when they are ready!'
    ],
    footerNote: 'If you need to reschedule or have questions, reply directly to this email or call us at {{studioPhone}}.',
    accentColor: '#C86A4B'
  },
  collection_ready: {
    id: 'collection_ready',
    name: 'Ready for Collection',
    subject: 'Your Handcrafted Pottery is Ready for Collection! – Nendoa Studio',
    headerTitle: 'NENDOA STUDIO',
    headerSubtitle: 'Ceramics Ready for Pickup',
    leadGreeting: 'Exciting News, {{customerName}}!',
    leadMessage: 'Your handcrafted ceramic pieces from your {{workshop}} have completed their final high-temperature kiln firing and glaze inspection. They turned out beautifully and are now ready for collection!',
    tipsOrNotesTitle: 'Pickup Instructions:',
    tipsOrNotes: [
      'Please bring your own tote bag or box with packing paper if you would like to help us reduce single-use wrapping.',
      'Pieces are stored safely for up to 45 days from this email notification.',
      'If someone else is picking up on your behalf, simply have them show this email or state your name and phone number.'
    ],
    footerNote: 'We cannot wait for you to enjoy and use your one-of-a-kind handmade ceramics!',
    accentColor: '#5B8266'
  },
  receipt: {
    id: 'receipt',
    name: 'Digital Payment Receipt',
    subject: 'Official Payment Receipt: {{workshop}} – Nendoa Studio',
    headerTitle: 'NENDOA STUDIO',
    headerSubtitle: 'Official Digital Receipt',
    leadGreeting: 'Dear {{customerName}},',
    leadMessage: 'Thank you for your settlement with Nendoa Studio. This email serves as your official payment receipt and transaction confirmation.',
    tipsOrNotesTitle: 'Payment Verification:',
    tipsOrNotes: [
      'Payment Received in Full &bull; Official Digital Tax/Sales Receipt.',
      'Keep this digital copy for your records.'
    ],
    footerNote: 'For billing questions or receipt requests, please reply to {{fromEmail}}.',
    accentColor: '#2D241E'
  },
  custom: {
    id: 'custom',
    name: 'Custom Studio Message',
    subject: 'Message from Nendoa Studio',
    headerTitle: 'NENDOA STUDIO',
    headerSubtitle: 'Studio Communication',
    leadGreeting: 'Dear {{customerName}},',
    leadMessage: 'Thank you for connecting with Nendoa Studio. Please find our message below regarding your session and inquiries.',
    tipsOrNotesTitle: 'Studio Highlights:',
    tipsOrNotes: [
      'Handcrafted ceramic moments in Georgetown, Penang.',
      'Open Tuesday to Sunday, 10:00 AM – 6:30 PM.'
    ],
    footerNote: 'Feel free to reply to this email or reach us anytime at {{studioPhone}}.',
    accentColor: '#C28B38'
  }
};

export function getStoredTemplateConfigs(): Record<string, EmailTemplateConfig> {
  try {
    const saved = localStorage.getItem('nendoa_email_templates_config') || localStorage.getItem('tokikobo_email_templates_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_TEMPLATE_CONFIGS, ...parsed };
    }
  } catch (e) {
    console.warn('Error loading template configs:', e);
  }
  return DEFAULT_TEMPLATE_CONFIGS;
}

export function saveStoredTemplateConfigs(configs: Record<string, EmailTemplateConfig>): void {
  try {
    localStorage.setItem('nendoa_email_templates_config', JSON.stringify(configs));
  } catch (e) {
    console.warn('Error saving template configs:', e);
  }
}
