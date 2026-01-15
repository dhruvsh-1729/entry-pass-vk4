import type { NextApiRequest, NextApiResponse } from "next";
import { findVisitorByPhone, normalizePhone } from "../../lib/visitors";

type ErrorResponse = {
  message: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Record<string, unknown> | ErrorResponse>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { mobile } = req.query;
  const mobileValue = Array.isArray(mobile) ? mobile[0] : mobile;

  if (!mobileValue) {
    return res.status(400).json({ message: "mobile query param is required" });
  }

  const normalizedPhone = normalizePhone(mobileValue);

  if (!normalizedPhone) {
    return res.status(400).json({ message: "mobile query param is invalid" });
  }

  console.log("Mobile:", normalizedPhone);

  try {
    const visitor = await findVisitorByPhone(normalizedPhone);

    if (!visitor) {
      return res.status(404).json({ message: "Visitor not found" });
    }

    return res.status(200).json(visitor as Record<string, unknown>);
  } catch (error) {
    console.error("Error fetching visitor:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
