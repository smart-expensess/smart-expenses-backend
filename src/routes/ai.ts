// src/routes/ai.ts
import { Router, Request, Response } from "express";
import multer from "multer";
import { groq } from "../lib/groqClient";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

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
  category: string | null; // 👈 model will now return this
  payment_method: string | null; // 👈 and this
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
  payment_method?: string; // will be one of: cash, credit_card, ...
  suggested_category?: string;
  items?: AIExtractedItem[];
  confidence?: number;
}

/**
 * Normalize whatever the model outputs for payment_method to one of:
 * "cash" | "credit_card" | "debit_card" | "mobile_payment" | "bank_transfer" | "other"
 * (matching your frontend PaymentMethod type)
 */
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
  if (value.includes("bank") || value.includes("transfer")) {
    return "bank_transfer";
  }

  return "other";
}

router.post(
  "/ai/receipts/analyze-image",
  upload.any(),
  async (req: Request, res: Response) => {
    try {
      console.log("==== /ai/receipts/analyze-image ====");

      let dataUrl: string | null = null;

      // 1) Prefer JSON base64 from frontend
      const body = req.body as { imageBase64?: string };
      if (body?.imageBase64) {
        const raw = body.imageBase64.toString();
        if (raw.startsWith("data:")) {
          dataUrl = raw;
        } else {
          dataUrl = `data:image/jpeg;base64,${raw}`;
        }
      }

      // 2) If no JSON base64, try file upload
      if (!dataUrl) {
        const files = req.files as Express.Multer.File[] | undefined;
        const file = files?.[0];
        if (file) {
          const base64 = file.buffer.toString("base64");
          dataUrl = `data:${file.mimetype};base64,${base64}`;
        }
      }

      if (!dataUrl) {
        return res.status(400).json({
          success: false,
          error: "Image file is required",
        });
      }

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
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        temperature: 0.1,
        max_completion_tokens: 800,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract the receipt data from this image and return JSON only.",
              },
              {
                type: "image_url",
                image_url: { url: dataUrl },
              },
            ],
          },
        ],
      });

      const rawContent = completion.choices[0]?.message?.content;
      if (!rawContent) {
        return res.status(500).json({
          success: false,
          error: "Empty response from Groq",
        });
      }

      let parsed: ReceiptAnalysis;
      try {
        // In case the model wraps JSON in ```json ``` blocks
        const cleanContent = rawContent
          .replace(/```json\n?|\n?```/g, "")
          .trim();
        parsed = JSON.parse(cleanContent) as ReceiptAnalysis;
      } catch (parseError) {
        console.error("JSON parse error:", parseError);
        return res.status(200).json({
          success: false,
          error: "Failed to parse JSON from model",
          raw_text: rawContent,
        });
      }

      // Normalize payment method to values your frontend expects
      const normalizedPaymentMethod = normalizePaymentMethod(
        parsed.payment_method
      );

      // Map the parsed data to frontend's expected format
      const responseData: AIExtractedData = {
        vendor_name: parsed.merchant_name ?? undefined,
        purchase_date: parsed.purchase_date ?? undefined,
        total_amount: parsed.total ?? undefined,
        tax_amount: parsed.tax ?? undefined,
        currency: parsed.currency ?? undefined,
        payment_method: normalizedPaymentMethod, // 👈 now set
        suggested_category: parsed.category ?? undefined, // 👈 now set
        items:
          parsed.line_items?.map((item) => ({
            name: item.description,
            quantity: item.quantity ?? undefined,
            unit_price: item.unit_price ?? undefined,
            total: item.total ?? undefined,
          })) || [],
        confidence: 0.85,
      };

      return res.json({
        success: true,
        data: responseData,
        raw_text: rawContent,
      });
    } catch (error: unknown) {
      console.error(
        "Groq receipt analysis error:",
        error instanceof Error ? error.message : error
      );
      return res.status(500).json({
        success: false,
        error: "Failed to analyze receipt image",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

export default router;
