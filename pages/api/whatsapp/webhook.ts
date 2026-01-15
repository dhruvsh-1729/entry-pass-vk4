import type { NextApiRequest, NextApiResponse } from "next";

import { findVisitorByPhone, normalizePhone } from "../../../lib/visitors";

const WHATSAPP_API_BASE_URL = process.env.WHATSAPP_API_BASE_URL;
const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

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

function formatVisitorCaption(visitor: Record<string, unknown>): string {
  const name = getString(visitor.name) || "N/A";
  const email = getString(visitor.email) || "N/A";
  const designation = getString(visitor.designation) || "N/A";
  const visitorCode = getString(visitor.visitorCode) || "N/A";

  return [
    "*Entry Pass*",
    `Name: ${name}`,
    `Email: ${email}`,
    `Designation: ${designation}`,
    `Visitor Code: ${visitorCode}`,
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
        const messageBody = message.text?.body ?? "";
        if (!messageBody || !isGetPassMessage(messageBody)) {
          continue;
        }

        const from = message.from;
        if (!from) {
          continue;
        }

        processed = true;
        const normalizedPhone = normalizePhone(from);

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

        const visitor = await findVisitorByPhone(normalizedPhone);

        if (!visitor) {
          await sendWhatsAppTextMessage(
            apiBaseUrl,
            apiKey,
            phoneNumberId,
            from,
            "No entry pass was found for this number.",
          );
          continue;
        }

        const visitorRecord = visitor as Record<string, unknown>;
        const caption = formatVisitorCaption(visitorRecord);
        const entryPassUrl = getString(visitorRecord.entryPassUrl);

        if (entryPassUrl) {
          await sendWhatsAppImageMessage(
            apiBaseUrl,
            apiKey,
            phoneNumberId,
            from,
            entryPassUrl,
            caption,
          );
        } else {
          await sendWhatsAppTextMessage(
            apiBaseUrl,
            apiKey,
            phoneNumberId,
            from,
            caption,
          );
        }
      }
    }
  }

  return res.status(200).json({ received: true, processed });
}
