// backend/src/routes/budgets.ts
import { Router, Response } from "express";
import { prisma } from "../db";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();

// GET /api/budgets?month=&year=
router.get("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  const month = req.query.month ? parseInt(req.query.month as string, 10) : NaN;
  const year = req.query.year ? parseInt(req.query.year as string, 10) : NaN;

  try {
    const budgets = await prisma.budget.findMany({
      where: {
        user_id: req.user!.id,
        month: isNaN(month) ? undefined : month,
        year: isNaN(year) ? undefined : year,
      },
      include: { category: true },
      orderBy: { created_at: "asc" },
    });

    const result = budgets.map((b) => ({
      id: b.id,
      user_id: b.user_id,
      category_id: b.category_id,
      monthly_limit: b.monthly_limit, // Prisma.Decimal
      month: b.month,
      year: b.year,
      created_at: b.created_at,
      category_name: b.category.name,
      icon: b.category.icon,
      color: b.category.color,
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch budgets" });
  }
});

// POST /api/budgets
router.post("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { category_id, monthly_limit, month, year } = req.body as {
    category_id: string;
    monthly_limit: number;
    month: number;
    year: number;
  };

  try {
    const budget = await prisma.budget.create({
      data: {
        user_id: req.user!.id,
        category_id,
        monthly_limit,
        month,
        year,
      },
    });

    res.status(201).json(budget);
  } catch (err: any) {
    console.error(err);
    if (err.code === "P2002") {
      return res
        .status(409)
        .json({ message: "Budget already exists for this month/category" });
    }
    res.status(500).json({ message: "Failed to create budget" });
  }
});

// PUT /api/budgets/:id
router.put("/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { monthly_limit, month, year, category_id } = req.body as {
    monthly_limit?: number;
    month?: number;
    year?: number;
    category_id?: string;
  };

  try {
    const result = await prisma.budget.updateMany({
      where: { id, user_id: req.user!.id },
      data: {
        monthly_limit: monthly_limit ?? undefined,
        month: month ?? undefined,
        year: year ?? undefined,
        category_id: category_id ?? undefined,
      },
    });

    if (result.count === 0) {
      return res.status(404).json({ message: "Budget not found" });
    }

    const budget = await prisma.budget.findUnique({ where: { id } });
    res.json(budget);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update budget" });
  }
});

// DELETE /api/budgets/:id
router.delete(
  "/:id",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const result = await prisma.budget.deleteMany({
        where: { id, user_id: req.user!.id },
      });

      if (result.count === 0) {
        return res.status(404).json({ message: "Budget not found" });
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to delete budget" });
    }
  }
);

export default router;
