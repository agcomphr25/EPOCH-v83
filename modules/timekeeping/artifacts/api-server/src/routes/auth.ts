import { Router, type IRouter } from "express";
import { z } from "zod";
import * as authSvc from "../services/auth.service";

const router: IRouter = Router();

const LoginBody = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const body = LoginBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const user = await authSvc.validateCredentials(body.data.email, body.data.password);
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  req.session.userId = user.id;
  res.json({ user });
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get("/auth/me", (req, res): void => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({ user: req.user });
});

export default router;
