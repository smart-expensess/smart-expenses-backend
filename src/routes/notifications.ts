// backend/src/routes/notifications.ts
import { Router, Response } from "express";
import { prisma } from "../db";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();

// GET /api/notifications
router.get("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { user_id: req.user!.id },
      orderBy: { created_at: "desc" },
    });
    res.json(notifications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
});

// PATCH /api/notifications/:id/read
router.patch(
  "/:id/read",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const updated = await prisma.notification.updateMany({
        where: { id, user_id: req.user!.id },
        data: { is_read: true },
      });

      if (updated.count === 0) {
        return res.status(404).json({ message: "Notification not found" });
      }

      const notif = await prisma.notification.findUnique({ where: { id } });
      res.json(notif);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to update notification" });
    }
  }
);

// DELETE /api/notifications/:id
router.delete(
  "/:id",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const deleted = await prisma.notification.deleteMany({
        where: { id, user_id: req.user!.id },
      });

      if (deleted.count === 0) {
        return res.status(404).json({ message: "Notification not found" });
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to delete notification" });
    }
  }
);

export default router;
