// backend/src/routes/auth.ts
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../db";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { defaultCategories } from "../utils/defaultCategories";

const router = Router();

// POST /api/auth/register
router.post("/register", async (req: Request, res: Response) => {
  const { name, email, password, preferred_currency, timezone } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    preferred_currency?: string;
    timezone?: string;
  };

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password required" });
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      return res.status(409).json({ message: "Email already in use" });
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name: name ?? null,
        email,
        password_hash: hash,
        profile: {
          create: {
            name: name ?? null,
            email,
            preferred_currency: preferred_currency ?? "USD",
            timezone: timezone ?? "UTC",
          },
        },
        categories: {
          create: defaultCategories.map((cat) => ({
            name: cat.name,
            icon: cat.icon,
            color: cat.color,
          })),
        },
      },
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      token,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Registration failed" });
  }
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password required" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      profile: user.profile ?? null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Login failed" });
  }
});

// GET /api/auth/me
// Returns the currently authenticated user and profile based on the JWT
router.get("/me", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { profile: true },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Shape matches the frontend's MeResponse (token is optional)
    return res.json({
      user: {
        id: user.id,
        email: user.email,
      },
      profile: user.profile,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to fetch current user" });
  }
});

// POST /api/auth/logout
// With JWT auth this is effectively a no-op on the server, but the frontend
// expects the endpoint to exist so we return 204.
router.post("/logout", authMiddleware, (_req: AuthRequest, res: Response) => {
  return res.status(204).send();
});

export default router;
