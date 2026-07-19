import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import {
  EmailProvider,
  EmailProviderConfig,
  EmailSendRequest,
  EmailSendResponse,
} from './email-provider.interface';

export interface SesProviderConfig extends EmailProviderConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export class SesEmailProvider extends EmailProvider {
  private client: SESClient;
  private sesConfig: SesProviderConfig;

  constructor(config: SesProviderConfig) {
    super(config);
    this.sesConfig = config;
    this.client = new SESClient({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async send(request: EmailSendRequest): Promise<EmailSendResponse> {
    try {
      const from = request.from || this.getFromAddress();
      const command = new SendEmailCommand({
        Source: `${from.name} <${from.email}>`,
        Destination: {
          ToAddresses: Array.isArray(request.to) ? request.to : [request.to],
        },
        Message: {
          Subject: {
            Data: request.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Text: {
              Data: request.text,
              Charset: 'UTF-8',
            },
            Html: request.html
              ? {
                  Data: request.html,
                  Charset: 'UTF-8',
                }
              : undefined,
          },
        },
        ReplyToAddresses: request.replyTo
          ? [request.replyTo]
          : this.config.replyToEmail
            ? [this.config.replyToEmail]
            : undefined,
      });

      const response = await this.client.send(command);

      return {
        success: true,
        messageId: response.MessageId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown SES error',
      };
    }
  }

  async verifyConnection(): Promise<boolean> {
    try {
      const command = new SendEmailCommand({
        Source: this.config.fromEmail,
        Destination: { ToAddresses: ['verify@example.com'] },
        Message: {
          Subject: { Data: 'Test' },
          Body: { Text: { Data: 'Test' } },
        },
      });
      await this.client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'MessageRejected') {
        return true;
      }
      return false;
    }
  }
}
