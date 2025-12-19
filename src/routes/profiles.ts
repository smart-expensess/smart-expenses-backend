// backend/src/routes/profiles.ts
import { Router, Response } from "express";
import { prisma } from "../db";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();

// GET /api/profiles/me
router.get("/me", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const profile = await prisma.profile.findUnique({
      where: { id: req.user!.id },
    });
    res.json(profile ?? null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch profile" });
  }
});

// PUT /api/profiles/me
router.put("/me", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { name, preferred_currency, timezone, large_expense_threshold } =
    req.body as {
      name?: string;
      preferred_currency?: string;
      timezone?: string;
      large_expense_threshold?: number;
    };

  try {
    const profile = await prisma.profile.update({
      where: { id: req.user!.id },
      data: {
        name: name ?? undefined,
        preferred_currency: preferred_currency ?? undefined,
        timezone: timezone ?? undefined,
        large_expense_threshold: large_expense_threshold ?? undefined,
      },
    });

    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update profile" });
  }
});

export default router;
