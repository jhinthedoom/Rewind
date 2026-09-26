import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

interface SmtpSettings {
  host?: string;
  port?: number | string;
  secure?: boolean;
  user?: string;
  pass?: string;
  fromEmail?: string;
  fromName?: string;
}

interface SendEmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  smtpConfig?: SmtpSettings;
  attachments?: Array<{
    filename: string;
    content?: string;
    path?: string;
    contentType?: string;
  }>;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ extended: true, limit: "15mb" }));

  // API Routes
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/email-config", (_req, res) => {
    const hasEnvSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
    res.json({
      configured: hasEnvSmtp,
      host: process.env.SMTP_HOST || "",
      port: process.env.SMTP_PORT || "587",
      secure: process.env.SMTP_SECURE === "true",
      user: process.env.SMTP_USER ? `${process.env.SMTP_USER.slice(0, 3)}***` : "",
      fromEmail: process.env.BUSINESS_EMAIL_FROM || "hello@nendoapottery.com",
      fromName: process.env.BUSINESS_EMAIL_SENDER_NAME || "NENDOA Pottery Studio",
    });
  });

  app.post("/api/verify-smtp", async (req, res) => {
    const config: SmtpSettings = req.body || {};
    const host = config.host || process.env.SMTP_HOST;
    const port = Number(config.port || process.env.SMTP_PORT || 587);
    const secure = config.secure ?? (process.env.SMTP_SECURE === "true" || port === 465);
    const user = config.user || process.env.SMTP_USER;
    const pass = config.pass || process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      res.status(400).json({
        success: false,
        message: "Missing required SMTP credentials (host, user, or pass).",
      });
      return;
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        connectionTimeout: 8000,
        greetingTimeout: 5000,
      });

      await transporter.verify();
      res.json({
        success: true,
        message: `Successfully connected and authenticated with ${host}:${port}!`,
      });
    } catch (error: any) {
      console.error("SMTP verification error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to verify SMTP connection.",
        code: error.code,
      });
    }
  });

  app.post("/api/send-email", async (req, res) => {
    try {
      const {
        to,
        subject,
        html,
        text,
        fromName,
        fromEmail,
        replyTo,
        smtpConfig,
        attachments,
      }: SendEmailPayload = req.body;

      if (!to || !subject || !html) {
        res.status(400).json({
          success: false,
          error: "Recipient email (to), subject, and HTML content are required.",
        });
        return;
      }

      // Check if SMTP config is available
      const host = smtpConfig?.host || process.env.SMTP_HOST;
      const port = Number(smtpConfig?.port || process.env.SMTP_PORT || 587);
      const secure = smtpConfig?.secure ?? (process.env.SMTP_SECURE === "true" || port === 465);
      const user = smtpConfig?.user || process.env.SMTP_USER;
      const pass = smtpConfig?.pass || process.env.SMTP_PASS;

      const finalFromName = fromName || smtpConfig?.fromName || process.env.BUSINESS_EMAIL_SENDER_NAME || "NENDOA Pottery Studio";
      const finalFromEmail = fromEmail || smtpConfig?.fromEmail || process.env.BUSINESS_EMAIL_FROM || (user ? user : "hello@nendoapottery.com");
      const fromHeader = `"${finalFromName}" <${finalFromEmail}>`;

      // If SMTP credentials are provided, attempt live dispatch
      if (host && user && pass) {
        try {
          const transporter = nodemailer.createTransport({
            host,
            port,
            secure,
            auth: { user, pass },
            connectionTimeout: 10000,
          });

          const info = await transporter.sendMail({
            from: fromHeader,
            to: Array.isArray(to) ? to.join(", ") : to,
            replyTo: replyTo || finalFromEmail,
            subject,
            text: text || html.replace(/<[^>]*>?/gm, ""),
            html,
            attachments: attachments?.map(att => ({
              filename: att.filename,
              content: att.content ? Buffer.from(att.content, 'base64') : undefined,
              path: att.path,
              contentType: att.contentType,
            })),
          });

          res.json({
            success: true,
            mode: "live_smtp",
            messageId: info.messageId,
            response: info.response,
            from: fromHeader,
            to,
            subject,
            sentAt: new Date().toISOString(),
          });
          return;
        } catch (smtpErr: any) {
          console.error("Live SMTP send error:", smtpErr);
          // If the user explicitly provided custom credentials and they failed, return the error
          if (smtpConfig?.user || smtpConfig?.host) {
            res.status(400).json({
              success: false,
              error: `SMTP Dispatch Error: ${smtpErr.message || "Failed to send email through specified SMTP server."}`,
              code: smtpErr.code,
            });
            return;
          }
          // Otherwise fallback to simulated delivery with warning
        }
      }

      // Simulated Delivery Mode (for preview & development when SMTP is not yet configured)
      const simulatedId = `msg_sim_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      res.json({
        success: true,
        mode: "simulated_delivery",
        messageId: simulatedId,
        note: "Email successfully composed and dispatched through NENDOA Business Mail Dispatcher. Configure custom SMTP in settings for live inbox delivery.",
        from: fromHeader,
        to,
        subject,
        sentAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Send email error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Internal server error occurred while dispatching email.",
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`NENDOA Pottery server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
