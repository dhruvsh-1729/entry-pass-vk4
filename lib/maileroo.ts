type Recipient = {
  email?: string;
  name?: string;
  address?: string;
  display_name?: string;
};

type Attachment = {
  name?: string;
  file_name?: string;
  content: string;
  contentType?: string;
  content_type?: string;
  inline?: boolean;
  contentId?: string;
  content_id?: string;
};

type SendTransacEmailPayload = {
  sender?: Recipient;
  to?: Recipient | Recipient[];
  cc?: Recipient | Recipient[];
  bcc?: Recipient | Recipient[];
  replyTo?: Recipient;
  reply_to?: Recipient;
  subject?: string;
  htmlContent?: string;
  textContent?: string;
  tracking?: boolean;
  tags?: string[];
  headers?: Record<string, string>;
  attachment?: Attachment[];
  attachments?: Attachment[];
  reference_id?: string;
};

class MailerooClient {
  private baseUrl =
    process.env.MAILEROO_BASE_URL || "https://smtp.maileroo.com/api/v2";
  private apiKey = process.env.MAILEROO_API_KEY;

  private toEmailObject(recipient?: Recipient) {
    if (!recipient) return null;
    const { email, address, name, display_name } = recipient;
    return {
      address: email || address,
      display_name: name || display_name,
    };
  }

  private mapAddresses(value?: Recipient | Recipient[]) {
    if (!value) return undefined;
    const list = Array.isArray(value) ? value : [value];
    const mapped = list
      .map((entry) => this.toEmailObject(entry))
      .filter(
        (entry): entry is { address: string; display_name: string | undefined } =>
          Boolean(entry?.address),
      );
    if (!mapped.length) return undefined;
    return mapped.length === 1 ? mapped[0] : mapped;
  }

  private mapAttachments(list?: Attachment[]) {
    if (!list) return undefined;
    const attachments = list.map((item) => ({
      file_name: item.file_name || item.name,
      content_type: item.content_type || item.contentType,
      content: item.content,
      inline: item.inline,
      content_id: item.content_id || item.contentId,
    }));
    return attachments.length ? attachments : undefined;
  }

  async sendTransacEmail(sendSmtpEmail: SendTransacEmailPayload) {
    if (!this.apiKey) {
      throw new Error("MAILEROO_API_KEY is not set in environment variables.");
    }

    const payload: Record<string, unknown> = {
      from: this.toEmailObject(sendSmtpEmail.sender),
      to: this.mapAddresses(sendSmtpEmail.to),
      cc: this.mapAddresses(sendSmtpEmail.cc),
      bcc: this.mapAddresses(sendSmtpEmail.bcc),
      reply_to: this.mapAddresses(sendSmtpEmail.replyTo || sendSmtpEmail.reply_to),
      subject: sendSmtpEmail.subject,
      html: sendSmtpEmail.htmlContent,
      plain: sendSmtpEmail.textContent,
      tracking: sendSmtpEmail.tracking,
      tags: sendSmtpEmail.tags,
      headers: sendSmtpEmail.headers,
      attachments: this.mapAttachments(
        sendSmtpEmail.attachment || sendSmtpEmail.attachments,
      ),
      reference_id: sendSmtpEmail.reference_id,
    };

    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined || payload[key] === null) {
        delete payload[key];
      }
    });

    if (typeof fetch === "undefined") {
      throw new Error(
        "Global fetch is not available. Use Node 18+ or provide a fetch polyfill.",
      );
    }

    const response = await fetch(`${this.baseUrl}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
      },
      body: JSON.stringify(payload),
    });

    const raw = await response.text();
    let data: Record<string, unknown>;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!response.ok || data?.success === false) {
      const error: Error & {
        response?: { status: number; body: Record<string, unknown> };
      } = new Error(
        `Maileroo request failed: ${response.status} ${response.statusText}`,
      );
      error.response = { status: response.status, body: data };
      throw error;
    }

    const referenceId =
      (data as { data?: { reference_id?: string; reference_ids?: string[] } })
        ?.data?.reference_id ||
      (data as { data?: { reference_ids?: string[] } })?.data?.reference_ids?.[0] ||
      (data as { reference_id?: string })?.reference_id ||
      (data as { id?: string })?.id;

    return {
      messageId: referenceId,
      body: { ...data, messageId: referenceId },
    };
  }
}

export const apiInstance = new MailerooClient();
