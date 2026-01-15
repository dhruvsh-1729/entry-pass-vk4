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

export async function findVisitorsByPhone(normalizedPhone: string) {
  if (!normalizedPhone) {
    return [];
  }

  await connectToDatabase();
  return Visitor.find({ phone: normalizedPhone }).lean();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function findVisitorByPhoneAndEmail(
  normalizedPhone: string,
  email: string,
) {
  if (!normalizedPhone || !email) {
    return null;
  }

  await connectToDatabase();
  return Visitor.findOne({
    phone: normalizedPhone,
    email: new RegExp(`^${escapeRegex(email)}$`, "i"),
  }).lean();
}
