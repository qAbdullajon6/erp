export interface EmailSendRequest {
  to: string | string[];
  subject: string;
  html?: string;
  text: string;
  from?: { email: string; name: string };
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
  headers?: Record<string, string>;
}

export interface EmailSendResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailProviderConfig {
  fromEmail: string;
  fromName: string;
  replyToEmail?: string;
}

export abstract class EmailProvider {
  protected config: EmailProviderConfig;

  constructor(config: EmailProviderConfig) {
    this.config = config;
  }

  abstract send(request: EmailSendRequest): Promise<EmailSendResponse>;

  abstract verifyConnection(): Promise<boolean>;

  protected getFromAddress(): { email: string; name: string } {
    return {
      email: this.config.fromEmail,
      name: this.config.fromName,
    };
  }
}
