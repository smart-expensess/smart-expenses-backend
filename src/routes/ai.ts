// src/routes/ai.ts
import { Router, Request, Response } from "express";
import multer from "multer";
import { groq } from "../lib/groqClient";

const router = Router();

const maxUploadMb = Number(process.env.AI_MAX_UPLOAD_MB || 10);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadMb * 1024 * 1024 },
});

const GROQ_MODEL =
  process.env.GROQ_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";

const DEFAULT_CONFIDENCE = Number(process.env.AI_DEFAULT_CONFIDENCE || 0.85);

interface ReceiptLineItem {
  description: string;
  quantity: number | null;
  unit_price: number | null;
  total: number | null;
}

interface ReceiptAnalysis {
  merchant_name: string | null;
  merchant_address: string | null;
  purchase_date: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  currency: string | null;
  line_items: ReceiptLineItem[];
  notes: string | null;
  category: string | null;
  payment_method: string | null;
}

interface AIExtractedItem {
  name?: string;
  quantity?: number;
  unit_price?: number;
  total?: number;
}

interface AIExtractedData {
  vendor_name?: string;
  purchase_date?: string;
  total_amount?: number;
  tax_amount?: number;
  currency?: string;
  payment_method?: string;
  suggested_category?: string;
  items?: AIExtractedItem[];
  confidence?: number;
}

// Split-friendly types (for BillSplitter)
export type SplitExtractedItem = {
  id: string;
  name: string;
  qty?: number;
  unitPrice?: number;
  total: number;
  assignedTo: string[];
};

export type SplitExtractedReceipt = {
  merchant?: string;
  date?: string;
  currency?: string;
  subtotal?: number;

  taxAmount?: number;
  totalAmount?: number;

  items: SplitExtractedItem[];
};

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

function normalizePaymentMethod(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const value = raw.toLowerCase().trim();

  if (value.includes("cash")) return "cash";
  if (value.includes("credit")) return "credit_card";
  if (value.includes("debit")) return "debit_card";
  if (
    value.includes("apple pay") ||
    value.includes("google pay") ||
    value.includes("wallet") ||
    value.includes("mobile")
  ) {
    return "mobile_payment";
  }
  if (value.includes("bank") || value.includes("transfer"))
    return "bank_transfer";
  return "other";
}

function cleanJsonMaybe(raw: string) {
  return raw.replace(/```json\n?|\n?```/g, "").trim();
}

/**
 * ✅ MUCH more robust number parsing:
 * Handles: "$12.50", "12,500.00", "LBP 250000", "VAT 11%", etc.
 */
function asNumberOrNull(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;

  if (typeof x === "string") {
    const s = x.trim();
    if (!s) return null;

    // Replace comma thousands separators
    const normalized = s.replace(/,/g, "");

    // Extract first numeric value (supports decimals)
    const match = normalized.match(/-?\d+(\.\d+)?/);
    if (!match) return null;

    const n = Number(match[0]);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

/**
 * Accepts:
 * - req.body.imageBase64 (data-url or raw base64)
 * - OR req.files / req.file (multer)
 */
function extractImageDataUrl(req: Request): string | null {
  const body = req.body as { imageBase64?: string };

  if (body?.imageBase64) {
    const raw = body.imageBase64.toString();
    if (raw.startsWith("data:")) return raw;
    return `data:image/jpeg;base64,${raw}`;
  }

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const file = files[0] ?? (req.file as Express.Multer.File | undefined);
  if (file) {
    const base64 = file.buffer.toString("base64");
    return `data:${file.mimetype};base64,${base64}`;
  }

  return null;
}

/**
 * Build split-friendly receipt for BillSplitter:
 * ✅ ensures items don't collapse into a single "Items Subtotal"
 * by parsing totals correctly and using unit_price when qty is missing.
 */
function toSplitReceipt(parsed: ReceiptAnalysis): SplitExtractedReceipt {
  const items: SplitExtractedItem[] =
    parsed.line_items?.map((li) => {
      const qty = li.quantity ?? undefined;
      const unitPrice = li.unit_price ?? undefined;

      const modelTotal = li.total;

      // ✅ If qty is missing but unit price exists, assume qty = 1
      const safeQty =
        typeof li.quantity === "number" && Number.isFinite(li.quantity)
          ? li.quantity
          : typeof li.unit_price === "number" && Number.isFinite(li.unit_price)
            ? 1
            : null;

      const computed =
        typeof safeQty === "number" &&
        typeof li.unit_price === "number" &&
        Number.isFinite(safeQty) &&
        Number.isFinite(li.unit_price)
          ? safeQty * li.unit_price
          : null;

      // ✅ Prefer modelTotal, else computed, else (unit price if exists), else 0
      const total = (modelTotal ??
        computed ??
        (typeof li.unit_price === "number" && Number.isFinite(li.unit_price)
          ? li.unit_price
          : 0)) as number;

      return {
        id: generateId(),
        name: li.description || "Item",
        qty,
        unitPrice,
        total: Number.isFinite(total) ? total : 0,
        assignedTo: [],
      };
    }) ?? [];

  const subtotalFromItems = items.reduce(
    (s, i) => s + (Number.isFinite(i.total) ? i.total : 0),
    0,
  );

  const taxAmount = parsed.tax ?? undefined;
  const totalAmount = parsed.total ?? undefined;

  // ✅ Determine subtotal:
  // priority: parsed.subtotal -> items sum -> (total - tax)
  const derivedSubtotal =
    typeof parsed.subtotal === "number" && Number.isFinite(parsed.subtotal)
      ? parsed.subtotal
      : subtotalFromItems > 0
        ? subtotalFromItems
        : typeof totalAmount === "number" &&
            Number.isFinite(totalAmount) &&
            typeof taxAmount === "number" &&
            Number.isFinite(taxAmount)
          ? Math.max(0, totalAmount - taxAmount)
          : undefined;

  // ✅ Only use fallback if we truly have no line items
  const finalItems =
    items.length > 0
      ? items
      : typeof derivedSubtotal === "number" && derivedSubtotal > 0
        ? [
            {
              id: generateId(),
              name: "Items Subtotal",
              total: derivedSubtotal,
              assignedTo: [],
            },
          ]
        : items;

  return {
    merchant: parsed.merchant_name ?? undefined,
    date: parsed.purchase_date ?? undefined,
    currency: parsed.currency ?? undefined,
    subtotal: derivedSubtotal,
    taxAmount,
    totalAmount,
    items: finalItems,
  };
}

async function analyzeReceiptFromDataUrl(dataUrl: string) {
  const systemPrompt = `
You are an expert receipt parser. You receive a photo of a receipt and MUST return ONLY valid JSON with this exact shape:

{
  "merchant_name": string | null,
  "merchant_address": string | null,
  "purchase_date": string | null,
  "subtotal": number | null,
  "tax": number | null,
  "total": number | null,
  "currency": string | null,
  "line_items": [
    {
      "description": string,
      "quantity": number | null,
      "unit_price": number | null,
      "total": number | null
    }
  ],
  "notes": string | null,
  "category": string | null,
  "payment_method": string | null
}

Rules:
- "category" should be ONE short word or phrase like:
  "Groceries", "Restaurants", "Transport", "Shopping", "Bills", "Health",
  "Entertainment", "Fuel", "Coffee", "Other".
- "payment_method" should be something like:
  "Cash", "Credit Card", "Debit Card", "Mobile Payment",
  "Bank Transfer", "Other".
- If you are not sure about a field, set it to null.
- "purchase_date" should be ISO format if possible (YYYY-MM-DD) otherwise null.
- "currency" should be a 3-letter code like "USD", "EUR", or null if unclear.
- NEVER include any text outside the JSON. No explanations. No markdown.
`;

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    temperature: 0.1,
    max_completion_tokens: 900,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract the receipt data from this image and return JSON only.",
          },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  });

  const rawContent = completion.choices[0]?.message?.content;
  if (!rawContent) throw new Error("Empty response from Groq");

  const clean = cleanJsonMaybe(rawContent);
  const parsed = JSON.parse(clean) as ReceiptAnalysis;

  // ✅ Defensive normalization (now robust)
  parsed.subtotal = asNumberOrNull(parsed.subtotal);
  parsed.tax = asNumberOrNull(parsed.tax);
  parsed.total = asNumberOrNull(parsed.total);

  parsed.line_items =
    parsed.line_items?.map((li) => ({
      description: li.description ?? "",
      quantity: asNumberOrNull(li.quantity),
      unit_price: asNumberOrNull(li.unit_price),
      total: asNumberOrNull(li.total),
    })) ?? [];

  return { parsed, rawContent };
}

router.post(
  "/ai/receipts/analyze-image",
  upload.any(),
  async (req: Request, res: Response) => {
    try {
      const dataUrl = extractImageDataUrl(req);
      if (!dataUrl) {
        return res
          .status(400)
          .json({ success: false, error: "Image file is required" });
      }

      const { parsed, rawContent } = await analyzeReceiptFromDataUrl(dataUrl);

      const normalizedPaymentMethod = normalizePaymentMethod(
        parsed.payment_method,
      );

      // Existing frontend format
      const responseData: AIExtractedData = {
        vendor_name: parsed.merchant_name ?? undefined,
        purchase_date: parsed.purchase_date ?? undefined,
        total_amount: parsed.total ?? undefined,
        tax_amount: parsed.tax ?? undefined,
        currency: parsed.currency ?? undefined,
        payment_method: normalizedPaymentMethod,
        suggested_category: parsed.category ?? undefined,
        items:
          parsed.line_items?.map((item) => ({
            name: item.description,
            quantity: item.quantity ?? undefined,
            unit_price: item.unit_price ?? undefined,
            total: item.total ?? undefined,
          })) || [],
        confidence: DEFAULT_CONFIDENCE,
      };

      // split-friendly receipt (BillSplitter)
      const splitReceipt = toSplitReceipt(parsed);

      return res.json({
        success: true,
        data: responseData,
        split_receipt: splitReceipt,
        raw_text: rawContent,
      });
    } catch (error: unknown) {
      console.error(
        "Groq receipt analysis error:",
        error instanceof Error ? error.message : error,
      );
      return res.status(500).json({
        success: false,
        error: "Failed to analyze receipt image",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

export default router;
