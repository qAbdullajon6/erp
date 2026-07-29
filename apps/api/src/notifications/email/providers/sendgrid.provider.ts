import * as sgMail from '@sendgrid/mail';
import { Client } from '@sendgrid/client';
import {
  EmailProvider,
  EmailProviderConfig,
  EmailSendRequest,
  EmailSendResponse,
} from './email-provider.interface';

export interface SendGridProviderConfig extends EmailProviderConfig {
  apiKey: string;
}

export class SendGridEmailProvider extends EmailProvider {
  private sendgridConfig: SendGridProviderConfig;

  constructor(config: SendGridProviderConfig) {
    super(config);
    this.sendgridConfig = config;
    sgMail.setApiKey(config.apiKey);
  }

  async send(request: EmailSendRequest): Promise<EmailSendResponse> {
    try {
      const from = request.from || this.getFromAddress();
      const [response] = await sgMail.send({
        from: {
          email: from.email,
          name: from.name,
        },
        to: Array.isArray(request.to) ? request.to : [request.to],
        subject: request.subject,
        text: request.text,
        html: request.html,
        replyTo: request.replyTo || this.config.replyToEmail,
        attachments: request.attachments?.map((att) => ({
          filename: att.filename,
          content:
            typeof att.content === 'string'
              ? att.content
              : att.content.toString('base64'),
          type: att.contentType,
          disposition: 'attachment',
        })),
        headers: request.headers,
      });

      const headers = response.headers as Record<string, string | string[] | undefined>;
      const messageId = headers['x-message-id'];

      return {
        success: true,
        messageId: typeof messageId === 'string' ? messageId : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown SendGrid error',
      };
    }
  }

  async verifyConnection(): Promise<boolean> {
    try {
      const client = new Client();
      client.setApiKey(this.sendgridConfig.apiKey);
      await client.request({
        url: '/v3/user/profile',
        method: 'GET',
      });
      return true;
    } catch {
      return false;
    }
  }
}
