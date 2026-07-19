import * as nodemailer from 'nodemailer';
import {
  EmailProvider,
  EmailProviderConfig,
  EmailSendRequest,
  EmailSendResponse,
} from './email-provider.interface';

export interface SmtpProviderConfig extends EmailProviderConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}

export class SmtpEmailProvider extends EmailProvider {
  private transporter: nodemailer.Transporter;
  private smtpConfig: SmtpProviderConfig;

  constructor(config: SmtpProviderConfig) {
    super(config);
    this.smtpConfig = config;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.password,
      },
    });
  }

  async send(request: EmailSendRequest): Promise<EmailSendResponse> {
    try {
      const from = request.from || this.getFromAddress();
      const info = await this.transporter.sendMail({
        from: `"${from.name}" <${from.email}>`,
        to: Array.isArray(request.to) ? request.to.join(', ') : request.to,
        subject: request.subject,
        text: request.text,
        html: request.html,
        replyTo: request.replyTo || this.config.replyToEmail,
        attachments: request.attachments,
        headers: request.headers,
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown SMTP error',
      };
    }
  }

  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }
}
