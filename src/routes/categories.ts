// backend/src/routes/categories.ts
import { Router, Response } from "express";
import { prisma } from "../db";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();

// GET /api/categories
router.get("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      where: { user_id: req.user!.id },
      orderBy: { created_at: "asc" },
    });
    res.json(categories);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch categories" });
  }
});

// POST /api/categories
router.post("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { name, icon, color, is_tax_deductible } = req.body as {
    name: string;
    icon?: string;
    color?: string;
    is_tax_deductible?: boolean;
  };

  try {
    const category = await prisma.category.create({
      data: {
        user_id: req.user!.id,
        name,
        icon: icon ?? "📁",
        color: color ?? "#6366f1",
        is_tax_deductible: is_tax_deductible ?? false,
      },
    });
    res.status(201).json(category);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create category" });
  }
});

// PUT /api/categories/:id
router.put("/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, icon, color, is_tax_deductible } = req.body as {
    name?: string;
    icon?: string;
    color?: string;
    is_tax_deductible?: boolean;
  };

  try {
    const category = await prisma.category.updateMany({
      where: { id, user_id: req.user!.id },
      data: {
        name: name ?? undefined,
        icon: icon ?? undefined,
        color: color ?? undefined,
        is_tax_deductible:
          typeof is_tax_deductible === "boolean"
            ? is_tax_deductible
            : undefined,
      },
    });

    if (category.count === 0) {
      return res.status(404).json({ message: "Category not found" });
    }

    const updated = await prisma.category.findUnique({ where: { id } });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update category" });
  }
});

// DELETE /api/categories/:id
router.delete(
  "/:id",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const deleted = await prisma.category.deleteMany({
        where: { id, user_id: req.user!.id },
      });

      if (deleted.count === 0) {
        return res.status(404).json({ message: "Category not found" });
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to delete category" });
    }
  }
);

export default router;
