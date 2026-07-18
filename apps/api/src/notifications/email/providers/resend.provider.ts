import { Resend } from 'resend';
import {
  EmailProvider,
  EmailProviderConfig,
  EmailSendRequest,
  EmailSendResponse,
} from './email-provider.interface';

export interface ResendProviderConfig extends EmailProviderConfig {
  apiKey: string;
}

export class ResendEmailProvider extends EmailProvider {
  private client: Resend;
  private resendConfig: ResendProviderConfig;

  constructor(config: ResendProviderConfig) {
    super(config);
    this.resendConfig = config;
    this.client = new Resend(config.apiKey);
  }

  async send(request: EmailSendRequest): Promise<EmailSendResponse> {
    try {
      const from = request.from || this.getFromAddress();
      const { data, error } = await this.client.emails.send({
        from: `${from.name} <${from.email}>`,
        to: Array.isArray(request.to) ? request.to : [request.to],
        subject: request.subject,
        text: request.text,
        html: request.html,
        replyTo: request.replyTo || this.config.replyToEmail,
        attachments: request.attachments?.map((att) => ({
          filename: att.filename,
          content: att.content,
        })),
        headers: request.headers,
      });

      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      return {
        success: true,
        messageId: data?.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Resend error',
      };
    }
  }

  async verifyConnection(): Promise<boolean> {
    try {
      await this.client.apiKeys.list();
      return true;
    } catch {
      return false;
    }
  }
}
