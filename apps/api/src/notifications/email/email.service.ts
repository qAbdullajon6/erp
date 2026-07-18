import { Injectable, Logger } from '@nestjs/common';
import { EmailProviderRegistry } from './email-provider.registry';
import { EmailSendRequest } from './providers/email-provider.interface';

export interface SendEmailRequest {
  organizationId: string;
  to: string | string[];
  subject: string;
  html?: string;
  text: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private providerRegistry: EmailProviderRegistry) {}

  async send(request: SendEmailRequest): Promise<SendEmailResult> {
    const provider = await this.providerRegistry.getProvider(
      request.organizationId,
    );

    if (!provider) {
      this.logger.error(
        `No email provider configured for organization ${request.organizationId}`,
      );
      return {
        success: false,
        error: 'No email provider configured',
      };
    }

    const emailRequest: EmailSendRequest = {
      to: request.to,
      subject: request.subject,
      html: request.html,
      text: request.text,
      attachments: request.attachments,
    };

    try {
      const result = await provider.send(emailRequest);

      if (result.success) {
        this.logger.log(
          `Email sent successfully to ${Array.isArray(request.to) ? request.to.join(', ') : request.to} (messageId: ${result.messageId})`,
        );
      } else {
        this.logger.error(
          `Failed to send email: ${result.error}`,
        );
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Unexpected error sending email: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unexpected email error',
      };
    }
  }

  async verifyProvider(organizationId: string): Promise<boolean> {
    const provider = await this.providerRegistry.getProvider(organizationId);
    if (!provider) {
      return false;
    }
    return provider.verifyConnection();
  }
}
