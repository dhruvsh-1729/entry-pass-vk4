import type { NextApiRequest, NextApiResponse } from "next";

import {
  findVisitorByPhone,
  findVisitorByPhoneAndEmail,
  findVisitorsByPhone,
  normalizePhone,
} from "../../../lib/visitors";
import { apiInstance as maileroo } from "../../../lib/maileroo";

const WHATSAPP_API_BASE_URL = process.env.WHATSAPP_API_BASE_URL;
const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const MAIL_FROM_EMAIL: string = "vk4.ki.oar@vk4.maileroo.app";
const MAIL_FROM_NAME = "VK4 Exhibition Tech";
const MAIL_REPLY_TO_EMAIL = "vk4.ki.oar@gmail.com";
const MAIL_REPLY_TO_NAME = "Support";
const MAIL_FALLBACK_FROM_EMAIL: string = "vk4.ki.oar@maileroo.app";
const MAIL_FALLBACK_FROM_NAME = "VK4 Exhibition Tech";
const JYOT_APP_URL =
  "https://play.google.com/store/apps/details?id=com.jyot.jyotapp&hl=en_IN";
const VK_REGISTER_URL = "https://vk.jyot.in/register";
const VK4_REGISTER_URL = "https://vk.jyot.in/vk4-registration";

type ErrorResponse = {
  message: string;
};

type WebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from?: string;
          text?: { body?: string };
          type?: string;
          button?: {
            payload?: string;
            text?: string;
          };
          interactive?: {
            type?: string;
            button_reply?: {
              id?: string;
              title?: string;
            };
            list_reply?: {
              id?: string;
              title?: string;
              description?: string;
            };
          };
        }>;
        metadata?: {
          phone_number_id?: string;
          display_phone_number?: string;
        };
      };
    }>;
  }>;
};

function getQueryParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function getString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number") {
    return String(value);
  }
  return "";
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

const EMAIL_SELECTION_PREFIX = "entry_pass_email:";
const MAX_BUTTON_TITLE_LENGTH = 20;
const MAX_LIST_ROW_TITLE_LENGTH = 24;
const MAX_LIST_ROW_DESCRIPTION_LENGTH = 72;
const MAX_LIST_ROWS = 10;

function encodeEmailSelection(email: string): string {
  const encoded = Buffer.from(email, "utf8").toString("base64url");
  return `${EMAIL_SELECTION_PREFIX}${encoded}`;
}

function decodeEmailSelection(value: string): string | null {
  if (!value.startsWith(EMAIL_SELECTION_PREFIX)) {
    return null;
  }

  const encoded = value.slice(EMAIL_SELECTION_PREFIX.length);
  if (!encoded) {
    return null;
  }

  try {
    return Buffer.from(encoded, "base64url").toString("utf8");
  } catch (error) {
    console.error("Invalid email selection payload:", error);
    return null;
  }
}

function extractEmailFromText(text: string): string | null {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : null;
}

function getSelectionId(message: {
  button?: { payload?: string; text?: string };
  interactive?: {
    button_reply?: { id?: string };
    list_reply?: { id?: string };
  };
}): string {
  return (
    message.interactive?.button_reply?.id ??
    message.interactive?.list_reply?.id ??
    message.button?.payload ??
    ""
  );
}

function truncateForLimit(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function getUniqueEmails(visitors: Array<Record<string, unknown>>): string[] {
  const seen = new Set<string>();
  for (const visitor of visitors) {
    const email = getString(visitor.email);
    if (email) {
      seen.add(email);
    }
  }
  return Array.from(seen);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

type VisitorDetails = {
  name: string;
  email: string;
  designation: string;
  visitorCode: string;
  visitorType: string;
  visitorTypeDisplay: string;
};

function getVisitorDetails(visitor: Record<string, unknown>): VisitorDetails {
  return {
    name: getString(visitor.name),
    email: getString(visitor.email),
    designation: getString(visitor.designation) || "N/A",
    visitorCode: getString(visitor.visitorCode) || "N/A",
    visitorType: getString(visitor.visitorType) || "N/A",
    visitorTypeDisplay: getString(visitor.visitorTypeDisplay) || "N/A",
  };
}

function getVisitorDisplayLines(details: VisitorDetails): string[] {
  return [
    `Name: ${details.name || "N/A"}`,
    `Email: ${details.email || "N/A"}`,
    `Designation: ${details.designation}`,
    `Visitor Code: ${details.visitorCode}`,
    // `Visitor Type: ${details.visitorType}`,
    // `Visitor Type Display: ${details.visitorTypeDisplay}`,
  ];
}

function getEntryPassNoticeLines(): string[] {
  return [
    // "Please save this image safely somewhere since you won't be able to utilise this facility again for the same email through this number.",
    // "In case of any queries please reach out to the registration desk or registration volunteers for more guidance.",
    // "Download the Jyot app from Play Store for latest updates and announcements:",
    // JYOT_APP_URL,
  ];
}

function getNoEntryPassLines(): string[] {
  return [
    "No entry pass was found for this number.",
    "",
    "Please register using links below.",
    "",
    "For exhibition:",
    "vk.jyot.in/register",
    "",
    "For competitions and events:",
    "vk.jyot.in/vk4-registration",
    "",
    "For DLLE/NSS students:",
    "vk.jyot.in/vk4-dlle-registration",
  ];
}

function formatNoEntryPassMessage(): string {
  return getNoEntryPassLines().join("\n");
}

function formatNoEntryPassForEmailMessage(): string {
  return [
    "No entry pass was found for that email.",
    "Please register on vk.jyot.in/register for exhibition visit or vk.jyot.in/vk4-registration for closed door sessions.",
    VK_REGISTER_URL,
    VK4_REGISTER_URL,
  ].join("\n");
}

function formatVisitorCaption(visitor: Record<string, unknown>): string {
  const details = getVisitorDetails(visitor);
  const noticeLines = getEntryPassNoticeLines();
  return [
    "*Entry Pass*",
    ...getVisitorDisplayLines(details),
    "",
    ...noticeLines,
  ].join("\n");
}

function isGetPassMessage(body: string): boolean {
  return body.trim().toLowerCase() === "get pass";
}

async function sendWhatsAppMessage(
  apiBaseUrl: string,
  apiKey: string,
  phoneNumberId: string,
  payload: Record<string, unknown>,
) {
  const response = await fetch(
    `${normalizeBaseUrl(apiBaseUrl)}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("WhatsApp API error:", response.status, errorText);
  }
}

async function sendWhatsAppTextMessage(
  apiBaseUrl: string,
  apiKey: string,
  phoneNumberId: string,
  to: string,
  body: string,
) {
  return sendWhatsAppMessage(apiBaseUrl, apiKey, phoneNumberId, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: {
      preview_url: false,
      body,
    },
  });
}

async function sendWhatsAppImageMessage(
  apiBaseUrl: string,
  apiKey: string,
  phoneNumberId: string,
  to: string,
  imageUrl: string,
  caption: string,
) {
  return sendWhatsAppMessage(apiBaseUrl, apiKey, phoneNumberId, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "image",
    image: {
      link: imageUrl,
      caption,
    },
  });
}

function buildEntryPassSubject(details: VisitorDetails): string {
  if (details.visitorCode && details.visitorCode !== "N/A") {
    return `VK4 Entry Pass - ${details.visitorCode}`;
  }
  return "VK4 Entry Pass";
}

function buildEntryPassEmail(
  details: VisitorDetails,
  entryPassUrl?: string,
): { subject: string; htmlContent: string; textContent: string } {
  const subject = buildEntryPassSubject(details);
  const greetingName = details.name || "Participant";
  const lines = getVisitorDisplayLines(details);
  const htmlLines = lines.map((line) => escapeHtml(line)).join("<br/>");
  const noticeLines = getEntryPassNoticeLines();
  const noticeHtml = noticeLines
    .map((line) =>
      line === JYOT_APP_URL
        ? `<a href="${escapeHtml(JYOT_APP_URL)}">${escapeHtml(JYOT_APP_URL)}</a>`
        : escapeHtml(line),
    )
    .join("<br/>");

  const qrBlock = entryPassUrl
    ? `<div style="margin:16px 0; text-align:center;">
        <img src="${escapeHtml(entryPassUrl)}" alt="VK4 Entry Pass QR"
          style="width:100%;max-width:360px;height:auto;border:1px solid #eee;border-radius:12px;display:block;margin:0 auto;" />
      </div>
      <p style="margin:8px 0 0; font-size:12px; color:#666;">
        If the image does not load, use the attached QR image.
      </p>`
    : `<p style="margin:16px 0; font-size:12px; color:#666;">
        QR image could not be embedded. Please use the attached QR image.
      </p>`;

  const htmlContent = `<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; font-size:14px; line-height:1.5; color:#111;">
    <p>Hi ${escapeHtml(greetingName)},</p>
    <p>Your VK4 entry pass is below. Please keep this QR ready on your phone at entry.</p>
    ${qrBlock}
    <p style="margin:16px 0 6px;"><strong>Entry Pass Details</strong></p>
    <p style="margin:0 0 12px;">${htmlLines}</p>
    <p style="margin:16px 0 6px;"><strong>Important</strong></p>
    <p style="margin:0 0 12px;">${noticeHtml}</p>
    <p style="margin-top:16px;">Regards,<br/>${escapeHtml(MAIL_FROM_NAME)}</p>
  </body>
</html>`;

  const textContent = `Hi ${greetingName},

Your VK4 entry pass is below. Please keep this QR ready on your phone at entry.

Entry Pass Details
${lines.join("\n")}

Important
${noticeLines.join("\n")}

If the QR image does not load, use the attached QR image.

Regards,
${MAIL_FROM_NAME}
`;

  return { subject, htmlContent, textContent };
}

function inferImageExtension(contentType: string, url: string): string {
  const lowered = contentType.toLowerCase();
  if (lowered.includes("png")) return "png";
  if (lowered.includes("jpeg") || lowered.includes("jpg")) return "jpg";
  if (lowered.includes("webp")) return "webp";
  if (lowered.includes("gif")) return "gif";
  const match = url.match(/\.([a-z0-9]+)(?:\?|$)/i);
  return match ? match[1].toLowerCase() : "png";
}

async function fetchEntryPassAttachment(
  entryPassUrl: string,
  visitorCode: string,
) {
  const response = await fetch(entryPassUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch entry pass image: ${response.status} ${response.statusText}`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "image/png";
  const extension = inferImageExtension(contentType, entryPassUrl);
  const safeCode =
    visitorCode && visitorCode !== "N/A" ? visitorCode : "entry-pass";
  const fileName = `${safeCode}.${extension}`;

  return {
    name: fileName,
    content: buffer.toString("base64"),
    contentType,
  };
}

async function sendEntryPassEmail(
  visitorRecord: Record<string, unknown>,
  entryPassUrl: string,
) {
  if (!process.env.MAILEROO_API_KEY) {
    console.warn("MAILEROO_API_KEY is not set. Skipping email send.");
    return;
  }

  const details = getVisitorDetails(visitorRecord);
  const recipientEmail = details.email;

  if (!recipientEmail || !isValidEmail(recipientEmail)) {
    console.warn("Skipping email: invalid recipient email.", recipientEmail);
    return;
  }

  const { subject, htmlContent, textContent } = buildEntryPassEmail(
    details,
    entryPassUrl,
  );

  const attachments = [];
  if (entryPassUrl) {
    try {
      attachments.push(
        await fetchEntryPassAttachment(entryPassUrl, details.visitorCode),
      );
    } catch (error) {
      console.error("Failed to attach entry pass image:", error);
    }
  }

  try {
    await maileroo.sendTransacEmail({
      sender: { email: MAIL_FROM_EMAIL, name: MAIL_FROM_NAME },
      to: [{ email: recipientEmail, name: details.name || recipientEmail }],
      replyTo: { email: MAIL_REPLY_TO_EMAIL, name: MAIL_REPLY_TO_NAME },
      subject,
      htmlContent,
      textContent,
      attachment: attachments.length ? attachments : undefined,
      headers: {
        "X-Entity-Ref-ID": `vk4-entry-pass-${Date.now()}`,
      },
    });
  } catch (error) {
    const errorBody = (error as { response?: { body?: unknown } })?.response
      ?.body;
    console.error("Maileroo send failed:", errorBody || error);

    if (
      MAIL_FALLBACK_FROM_EMAIL &&
      MAIL_FALLBACK_FROM_EMAIL !== MAIL_FROM_EMAIL
    ) {
      try {
        console.warn(
          "Retrying Maileroo send with fallback sender email:",
          MAIL_FALLBACK_FROM_EMAIL,
        );
        await maileroo.sendTransacEmail({
          sender: {
            email: MAIL_FALLBACK_FROM_EMAIL,
            name: MAIL_FALLBACK_FROM_NAME,
          },
          to: [{ email: recipientEmail, name: details.name || recipientEmail }],
          replyTo: { email: MAIL_REPLY_TO_EMAIL, name: MAIL_REPLY_TO_NAME },
          subject,
          htmlContent,
          textContent,
          attachment: attachments.length ? attachments : undefined,
          headers: {
            "X-Entity-Ref-ID": `vk4-entry-pass-${Date.now()}`,
          },
        });
      } catch (fallbackError) {
        const fallbackBody = (
          fallbackError as { response?: { body?: unknown } }
        )?.response?.body;
        console.error(
          "Maileroo fallback send failed:",
          fallbackBody || fallbackError,
        );
      }
    }
  }
}

async function deliverEntryPass(
  visitorRecord: Record<string, unknown>,
  apiBaseUrl: string,
  apiKey: string,
  phoneNumberId: string,
  to: string,
) {
  const caption = formatVisitorCaption(visitorRecord);
  const entryPassUrl = getString(visitorRecord.entryPassUrl);

  if (entryPassUrl) {
    await sendWhatsAppImageMessage(
      apiBaseUrl,
      apiKey,
      phoneNumberId,
      to,
      entryPassUrl,
      caption,
    );
  } else {
    await sendWhatsAppTextMessage(
      apiBaseUrl,
      apiKey,
      phoneNumberId,
      to,
      caption,
    );
  }

  await sendEntryPassEmail(visitorRecord, entryPassUrl);
}

async function sendWhatsAppInteractiveMessage(
  apiBaseUrl: string,
  apiKey: string,
  phoneNumberId: string,
  to: string,
  interactive: Record<string, unknown>,
) {
  return sendWhatsAppMessage(apiBaseUrl, apiKey, phoneNumberId, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive,
  });
}

async function sendEmailChoiceButtons(
  apiBaseUrl: string,
  apiKey: string,
  phoneNumberId: string,
  to: string,
  emails: string[],
) {
  const limitedEmails = emails.slice(0, 3);
  return sendWhatsAppInteractiveMessage(
    apiBaseUrl,
    apiKey,
    phoneNumberId,
    to,
    {
      type: "button",
      body: {
        text: "Multiple emails detected for the same number, please choose one of the emails.",
      },
      action: {
        buttons: limitedEmails.map((email) => ({
          type: "reply",
          reply: {
            id: encodeEmailSelection(email),
            title: email,
          },
        })),
      },
    },
  );
}

async function sendEmailChoiceList(
  apiBaseUrl: string,
  apiKey: string,
  phoneNumberId: string,
  to: string,
  emails: string[],
) {
  return sendWhatsAppInteractiveMessage(
    apiBaseUrl,
    apiKey,
    phoneNumberId,
    to,
    {
      type: "list",
      body: {
        text: "Multiple emails detected for the same number, please choose one of the emails.",
      },
      action: {
        button: "Choose email",
        sections: [
          {
            title: "Email Addresses",
            rows: emails.map((email) => ({
              id: encodeEmailSelection(email),
              title: truncateForLimit(email, MAX_LIST_ROW_TITLE_LENGTH),
              description: truncateForLimit(
                email,
                MAX_LIST_ROW_DESCRIPTION_LENGTH,
              ),
            })),
          },
        ],
      },
    },
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Record<string, unknown> | ErrorResponse | string>,
) {
  if (req.method === "GET") {
    const mode = getQueryParam(req.query["hub.mode"]);
    const token = getQueryParam(req.query["hub.verify_token"]);
    const challenge = getQueryParam(req.query["hub.challenge"]);

    if (mode === "subscribe" && challenge) {
      if (WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
        if (token === WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
          return res.status(200).send(challenge);
        }
        return res.status(403).json({ message: "Verification failed" });
      }

      return res.status(200).send(challenge);
    }

    return res.status(200).json({ message: "Webhook is running" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const apiBaseUrl = WHATSAPP_API_BASE_URL;
  const apiKey = WHATSAPP_API_KEY;
  const phoneNumberId = WHATSAPP_PHONE_NUMBER_ID;

  if (!apiBaseUrl || !apiKey || !phoneNumberId) {
    return res.status(500).json({
      message:
        "WhatsApp API base URL, API key, or phone number ID is not configured",
    });
  }

  const payload = req.body as WebhookPayload;
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  let processed = false;

  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change.value;
      if (!value) {
        continue;
      }

      const inboundPhoneNumberId = value.metadata?.phone_number_id;
      if (inboundPhoneNumberId && inboundPhoneNumberId !== phoneNumberId) {
        continue;
      }

      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const message of messages) {
        const from = message.from;
        if (!from) {
          continue;
        }

        const normalizedPhone = normalizePhone(from);

        const selectionId = getSelectionId(message);
        const selectionEmail =
          decodeEmailSelection(selectionId) ??
          extractEmailFromText(message.text?.body ?? "");

        if (selectionEmail) {
          processed = true;

          if (!normalizedPhone) {
            await sendWhatsAppTextMessage(
              apiBaseUrl,
              apiKey,
              phoneNumberId,
              from,
              "We could not read your phone number. Please try again.",
            );
            continue;
          }

          const visitor = await findVisitorByPhoneAndEmail(
            normalizedPhone,
            selectionEmail,
          );

          if (!visitor) {
            await sendWhatsAppTextMessage(
              apiBaseUrl,
              apiKey,
              phoneNumberId,
              from,
              formatNoEntryPassForEmailMessage(),
            );
            continue;
          }

          await deliverEntryPass(
            visitor as Record<string, unknown>,
            apiBaseUrl,
            apiKey,
            phoneNumberId,
            from,
          );

          continue;
        }

        const messageBody = message.text?.body ?? "";
        if (!messageBody || !isGetPassMessage(messageBody)) {
          continue;
        }

        processed = true;

        if (!normalizedPhone) {
          await sendWhatsAppTextMessage(
            apiBaseUrl,
            apiKey,
            phoneNumberId,
            from,
            "We could not read your phone number. Please try again.",
          );
          continue;
        }

        const visitors = (await findVisitorsByPhone(
          normalizedPhone,
        )) as Array<Record<string, unknown>>;

        if (visitors.length === 0) {
          await sendWhatsAppTextMessage(
            apiBaseUrl,
            apiKey,
            phoneNumberId,
            from,
            formatNoEntryPassMessage(),
          );
          continue;
        }

        const emails = getUniqueEmails(visitors);

        if (emails.length <= 1) {
          const visitorRecord =
            visitors[0] ?? (await findVisitorByPhone(normalizedPhone));

          if (!visitorRecord) {
            await sendWhatsAppTextMessage(
              apiBaseUrl,
              apiKey,
              phoneNumberId,
              from,
              formatNoEntryPassMessage(),
            );
            continue;
          }

          await deliverEntryPass(
            visitorRecord as Record<string, unknown>,
            apiBaseUrl,
            apiKey,
            phoneNumberId,
            from,
          );

          continue;
        }

        if (emails.length <= 3) {
          const hasLongEmail = emails.some(
            (email) => email.length > MAX_BUTTON_TITLE_LENGTH,
          );

          if (!hasLongEmail) {
            await sendEmailChoiceButtons(
              apiBaseUrl,
              apiKey,
              phoneNumberId,
              from,
              emails,
            );
            continue;
          }
        }

        if (emails.length <= MAX_LIST_ROWS) {
          await sendEmailChoiceList(
            apiBaseUrl,
            apiKey,
            phoneNumberId,
            from,
            emails,
          );
          continue;
        }

        await sendWhatsAppTextMessage(
          apiBaseUrl,
          apiKey,
          phoneNumberId,
          from,
          [
            "Multiple emails detected for the same number, please reply with one of the emails below:",
            ...emails.map((email) => `- ${email}`),
          ].join("\n"),
        );
      }
    }
  }

  return res.status(200).json({ received: true, processed });
}
