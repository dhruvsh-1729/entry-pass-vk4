import mongoose from "mongoose";

import { connectToDatabase } from "./mongoose";

const visitorSchema = new mongoose.Schema(
  {},
  { strict: false, collection: "visitors" },
);

const Visitor =
  mongoose.models.Visitor || mongoose.model("Visitor", visitorSchema);

export function normalizePhone(input: string): string {
  const digitsOnly = input.replace(/\D/g, "");
  if (digitsOnly.length < 10) {
    return "";
  }
  return digitsOnly.slice(-10);
}

export async function findVisitorByPhone(normalizedPhone: string) {
  if (!normalizedPhone) {
    return null;
  }

  await connectToDatabase();
  return Visitor.findOne({ phone: normalizedPhone }).lean();
}
