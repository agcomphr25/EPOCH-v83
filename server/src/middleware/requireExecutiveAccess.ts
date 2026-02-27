import { Request, Response, NextFunction } from 'express';

export function requireExecutiveAccess(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (user.username !== 'glennj') {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
}
