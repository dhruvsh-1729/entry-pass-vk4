import type { NextApiRequest, NextApiResponse } from "next";
import mongoose from "mongoose";

import { connectToDatabase } from "../../lib/mongoose";

const visitorSchema = new mongoose.Schema(
  {},
  { strict: false, collection: "visitors" },
);

const Visitor =
  mongoose.models.Visitor || mongoose.model("Visitor", visitorSchema);

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

  console.log("Mobile:", mobileValue);

  try {
    await connectToDatabase();

    const visitor = await Visitor.findOne({ phone: mobileValue }).lean();

    if (!visitor) {
      return res.status(404).json({ message: "Visitor not found" });
    }

    return res.status(200).json({ 
      text: {
        body: JSON.stringify(visitor)
      }
    });
  } catch (error) {
    console.error("Error fetching visitor:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
