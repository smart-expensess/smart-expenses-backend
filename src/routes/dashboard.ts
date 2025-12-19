// backend/src/routes/dashboard.ts
import { Router, Response } from "express";
import { prisma } from "../db";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { Prisma } from "@prisma/client";

const router = Router();

/**
 * Helpers to compute date ranges
 */
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = d.getDate() - day; // start on Sunday
  return new Date(d.getFullYear(), d.getMonth(), diff, 0, 0, 0, 0);
}

/**
 * Use purchase_date when present, otherwise created_at
 * so AI receipts are still counted even if purchase_date is null/old.
 */
function receiptDateRangeFilter(
  start: Date,
  end: Date
): Prisma.ReceiptWhereInput {
  return {
    OR: [
      {
        purchase_date: {
          gte: start,
          lte: end,
        },
      },
      {
        created_at: {
          gte: start,
          lte: end,
        },
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*                              GET /api/dashboard/stats                      */
/* -------------------------------------------------------------------------- */

router.get(
  "/stats",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const now = new Date();

      const thisMonthStart = startOfMonth(now);
      const thisMonthEnd = endOfMonth(now);

      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
      const lastMonthStart = startOfMonth(lastMonth);
      const lastMonthEnd = endOfMonth(lastMonth);

      const thisWeekStart = startOfWeek(now);

      // This month aggregates
      const thisMonthAgg = await prisma.receipt.aggregate({
        where: {
          user_id: userId,
          ...receiptDateRangeFilter(thisMonthStart, thisMonthEnd),
        },
        _sum: { total_amount: true },
        _avg: { total_amount: true },
        _count: { _all: true },
      });

      const thisMonthTotal = Number(thisMonthAgg._sum?.total_amount ?? 0);
      const thisMonthCount = thisMonthAgg._count?._all ?? 0;
      const avgReceipt = Number(thisMonthAgg._avg?.total_amount ?? 0);

      // Last month total
      const lastMonthAgg = await prisma.receipt.aggregate({
        where: {
          user_id: userId,
          ...receiptDateRangeFilter(lastMonthStart, lastMonthEnd),
        },
        _sum: { total_amount: true },
      });

      const lastMonthTotal = Number(lastMonthAgg._sum?.total_amount ?? 0);

      // Receipts this week
      const receiptsThisWeek = await prisma.receipt.count({
        where: {
          user_id: userId,
          ...receiptDateRangeFilter(thisWeekStart, thisMonthEnd),
        },
      });

      // Receipts with images (this month)
      const receiptsWithImages = await prisma.receipt.count({
        where: {
          user_id: userId,
          ...receiptDateRangeFilter(thisMonthStart, thisMonthEnd),
          image_url: {
            not: null,
          },
        },
      });

      const comparedToLastMonth =
        lastMonthTotal > 0
          ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100
          : 0;

      return res.json({
        totalSpentThisMonth: thisMonthTotal,
        totalReceiptsThisMonth: thisMonthCount,
        averageReceiptAmount: avgReceipt,
        receiptsThisWeek,
        receiptsWithImages,
        comparedToLastMonth,
      });
    } catch (err) {
      console.error("GET /dashboard/stats error", err);
      return res.status(500).json({ message: "Failed to load stats" });
    }
  }
);

/* -------------------------------------------------------------------------- */
/*                     GET /api/dashboard/category-spending                   */
/* -------------------------------------------------------------------------- */

router.get(
  "/category-spending",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);

      // All categories for this user
      const categories = await prisma.category.findMany({
        where: { user_id: userId },
      });

      // Receipts for this month (purchase_date or created_at inside range)
      const receipts = await prisma.receipt.findMany({
        where: {
          user_id: userId,
          ...receiptDateRangeFilter(monthStart, monthEnd),
        },
        select: {
          category_id: true,
          total_amount: true,
        },
      });

      const spendingByCategory = new Map<string | null, number>();

      for (const r of receipts) {
        const key = r.category_id ?? "uncategorized";
        const prev = spendingByCategory.get(key) ?? 0;
        spendingByCategory.set(key, prev + Number(r.total_amount));
      }

      // Budgets for this month
      const budgets = await prisma.budget.findMany({
        where: {
          user_id: userId,
          month,
          year,
        },
      });

      const budgetByCategory = new Map<string, number>();
      for (const b of budgets) {
        budgetByCategory.set(b.category_id, Number(b.monthly_limit));
      }

      const result = categories.map((cat) => {
        const spent = spendingByCategory.get(cat.id) ?? 0;

        const budget = budgetByCategory.get(cat.id) ?? null;
        const percentage = budget && budget > 0 ? (spent / budget) * 100 : null;

        return {
          category: cat,
          spent,
          budget,
          percentage,
        };
      });

      return res.json(result);
    } catch (err) {
      console.error("GET /dashboard/category-spending error", err);
      return res
        .status(500)
        .json({ message: "Failed to load category spending" });
    }
  }
);

/* -------------------------------------------------------------------------- */
/*                  GET /api/dashboard/spending-over-time                     */
/* -------------------------------------------------------------------------- */

router.get(
  "/spending-over-time",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const now = new Date();
      const twelveMonthsAgo = new Date(
        now.getFullYear(),
        now.getMonth() - 11,
        1
      );

      const receipts = await prisma.receipt.findMany({
        where: {
          user_id: userId,
          ...receiptDateRangeFilter(twelveMonthsAgo, now),
        },
        select: {
          purchase_date: true,
          created_at: true,
          total_amount: true,
        },
      });

      const totals: Record<string, number> = {};

      for (const r of receipts) {
        // Use purchase_date ONLY if it is inside the last-12-months window.
        // Otherwise fall back to created_at.
        const pd = r.purchase_date;
        let d: Date;

        if (pd && pd >= twelveMonthsAgo && pd <= now) {
          d = pd;
        } else {
          d = r.created_at; // creation date is guaranteed to be in range
        }

        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
          2,
          "0"
        )}`;

        totals[key] = (totals[key] ?? 0) + Number(r.total_amount);
      }

      // Build a continuous 12-month range so the x-axis is clean
      const data: { month: string; total: number }[] = [];
      for (let i = 0; i < 12; i++) {
        const d = new Date(
          twelveMonthsAgo.getFullYear(),
          twelveMonthsAgo.getMonth() + i,
          1
        );
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
          2,
          "0"
        )}`;
        data.push({
          month: key,
          total: totals[key] ?? 0,
        });
      }

      return res.json(data);
    } catch (err) {
      console.error("GET /dashboard/spending-over-time error", err);
      return res
        .status(500)
        .json({ message: "Failed to load spending over time" });
    }
  }
);

/* -------------------------------------------------------------------------- */
/*                      GET /api/dashboard/insights                           */
/* -------------------------------------------------------------------------- */

router.get(
  "/insights",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);

      // Re-use the spending + budgets logic
      const categories = await prisma.category.findMany({
        where: { user_id: userId },
      });

      const receipts = await prisma.receipt.findMany({
        where: {
          user_id: userId,
          ...receiptDateRangeFilter(monthStart, monthEnd),
        },
        select: {
          category_id: true,
          total_amount: true,
        },
      });

      const budgets = await prisma.budget.findMany({
        where: { user_id: userId, month, year },
      });

      const spendingByCategory = new Map<string, number>();
      for (const r of receipts) {
        if (!r.category_id) continue;
        const prev = spendingByCategory.get(r.category_id) ?? 0;
        spendingByCategory.set(r.category_id, prev + Number(r.total_amount));
      }

      const budgetByCategory = new Map<string, number>();
      for (const b of budgets) {
        budgetByCategory.set(b.category_id, Number(b.monthly_limit));
      }

      const insights: {
        type: "increase" | "decrease" | "budget_warning" | "tip";
        message: string;
        category?: string;
        percentage?: number;
      }[] = [];

      // Simple budget warnings
      for (const cat of categories) {
        const spent = spendingByCategory.get(cat.id) ?? 0;
        const budget = budgetByCategory.get(cat.id);

        if (budget && budget > 0) {
          const percentage = (spent / budget) * 100;
          if (percentage >= 100) {
            insights.push({
              type: "budget_warning",
              message: `You exceeded your budget for ${cat.name}.`,
              category: cat.name,
              percentage,
            });
          } else if (percentage >= 80) {
            insights.push({
              type: "tip",
              message: `You have used ${percentage.toFixed(0)}% of your ${
                cat.name
              } budget.`,
              category: cat.name,
              percentage,
            });
          }
        }
      }

      // Simple generic tip if no receipts
      if (receipts.length === 0) {
        insights.push({
          type: "tip",
          message: "Add more receipts to get detailed spending insights.",
        });
      }

      return res.json(insights);
    } catch (err) {
      console.error("GET /dashboard/insights error", err);
      return res.status(500).json({ message: "Failed to load insights" });
    }
  }
);

export default router;
