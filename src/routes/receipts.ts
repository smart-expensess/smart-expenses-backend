// backend/src/routes/receipts.ts
import { Router, Response } from "express";
import { prisma } from "../db";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { PaymentMethod } from "@prisma/client";

const router = Router();

interface ReceiptItemInput {
  name: string;
  quantity?: number;
  unit_price: number;
  total: number;
}

// Normalize any string into our Prisma PaymentMethod enum
function normalizePaymentMethod(method?: string): PaymentMethod {
  if (!method) return "other";

  const m = method.toLowerCase();

  switch (m) {
    case "cash":
      return "cash";
    case "credit_card":
    case "credit-card":
    case "card":
      return "credit_card";
    case "debit_card":
    case "debit-card":
      return "debit_card";
    case "mobile_payment":
    case "mobile-payment":
    case "mobile":
      return "mobile_payment";
    case "bank_transfer":
    case "bank-transfer":
    case "transfer":
      return "bank_transfer";
    case "other":
      return "other";
    default:
      return "other";
  }
}

const buildWhere = (query: any, userId: string) => {
  const where: any = { user_id: userId };

  if (query.from_date) {
    where.purchase_date = {
      ...(where.purchase_date || {}),
      gte: new Date(query.from_date as string),
    };
  }
  if (query.to_date) {
    where.purchase_date = {
      ...(where.purchase_date || {}),
      lte: new Date(query.to_date as string),
    };
  }
  if (query.category_id) {
    where.category_id = query.category_id as string;
  }
  if (query.min_amount) {
    where.total_amount = {
      ...(where.total_amount || {}),
      gte: Number(query.min_amount),
    };
  }
  if (query.max_amount) {
    where.total_amount = {
      ...(where.total_amount || {}),
      lte: Number(query.max_amount),
    };
  }
  if (query.payment_method) {
    where.payment_method = normalizePaymentMethod(
      query.payment_method as string
    );
  }
  if (query.search) {
    const s = query.search as string;
    where.OR = [
      { vendor_name: { contains: s, mode: "insensitive" } },
      { notes: { contains: s, mode: "insensitive" } },
    ];
  }

  return where;
};

// GET /api/receipts
router.get("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const where = buildWhere(req.query, req.user!.id);

    const receipts = await prisma.receipt.findMany({
      where,
      include: {
        category: true,
        items: true,
      },
      orderBy: [{ purchase_date: "desc" }, { created_at: "desc" }],
    });

    const result = receipts.map((r) => ({
      ...r,
      category_name: r.category?.name,
      category_icon: r.category?.icon,
      category_color: r.category?.color,
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch receipts" });
  }
});

// POST /api/receipts
router.post("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  const {
    vendor_name,
    purchase_date,
    total_amount,
    tax_amount,
    currency,
    payment_method,
    category_id,
    image_url,
    notes,
    ai_confidence,
    items,
  } = req.body as {
    vendor_name: string;
    purchase_date: string;
    total_amount: number;
    tax_amount?: number;
    currency?: string;
    payment_method?: string;
    category_id?: string;
    image_url?: string;
    notes?: string;
    ai_confidence?: number;
    items?: ReceiptItemInput[];
  };

  try {
    const receipt = await prisma.receipt.create({
      data: {
        user_id: req.user!.id,
        vendor_name,
        purchase_date: new Date(purchase_date),
        total_amount,
        tax_amount: tax_amount ?? 0,
        currency: currency ?? "USD",
        payment_method: normalizePaymentMethod(payment_method),
        category_id: category_id ?? null,
        image_url: image_url ?? null,
        notes: notes ?? null,
        ai_confidence: ai_confidence ?? null,
        items: items
          ? {
              create: items.map((i) => ({
                name: i.name,
                quantity: i.quantity ?? 1,
                unit_price: i.unit_price,
                total: i.total,
              })),
            }
          : undefined,
      },
    });

    res.status(201).json(receipt);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create receipt" });
  }
});

// PUT /api/receipts/:id
router.put("/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const {
    vendor_name,
    purchase_date,
    total_amount,
    tax_amount,
    currency,
    payment_method,
    category_id,
    image_url,
    notes,
    ai_confidence,
    items,
  } = req.body as {
    vendor_name?: string;
    purchase_date?: string;
    total_amount?: number;
    tax_amount?: number;
    currency?: string;
    payment_method?: string;
    category_id?: string;
    image_url?: string;
    notes?: string;
    ai_confidence?: number;
    items?: ReceiptItemInput[];
  };

  try {
    const existing = await prisma.receipt.findFirst({
      where: { id, user_id: req.user!.id },
    });

    if (!existing) {
      return res.status(404).json({ message: "Receipt not found" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.update({
        where: { id },
        data: {
          vendor_name: vendor_name ?? undefined,
          purchase_date: purchase_date ? new Date(purchase_date) : undefined,
          total_amount: total_amount ?? undefined,
          tax_amount: tax_amount ?? undefined,
          currency: currency ?? undefined,
          payment_method: payment_method
            ? normalizePaymentMethod(payment_method)
            : undefined,
          category_id: category_id ?? undefined,
          image_url: image_url ?? undefined,
          notes: notes ?? undefined,
          ai_confidence: ai_confidence ?? undefined,
        },
      });

      if (Array.isArray(items)) {
        // Replace all items
        await tx.receiptItem.deleteMany({ where: { receipt_id: id } });

        if (items.length > 0) {
          await tx.receiptItem.createMany({
            data: items.map((i) => ({
              receipt_id: id,
              name: i.name,
              quantity: i.quantity ?? 1,
              unit_price: i.unit_price,
              total: i.total,
            })),
          });
        }
      }

      return receipt;
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update receipt" });
  }
});

// DELETE /api/receipts/:id
router.delete(
  "/:id",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const deleted = await prisma.receipt.deleteMany({
        where: { id, user_id: req.user!.id },
      });

      if (deleted.count === 0) {
        return res.status(404).json({ message: "Receipt not found" });
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to delete receipt" });
    }
  }
);

export default router;
