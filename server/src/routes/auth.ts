import { Router } from 'express';
import { AuthService } from '../../auth';

const router = Router();

// Login endpoint
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const result = await AuthService.login(username, password);

    if (!result.success) {
      return res.status(401).json({ error: result.error });
    }

    // Set HTTP-only session cookie
    res.cookie('sessionToken', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      success: true,
      user: result.user
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: "Login failed" });
  }
});

// Session validation endpoint
router.get("/validate", async (req, res) => {
  try {
    const sessionToken = req.cookies?.sessionToken || req.headers.authorization?.replace('Bearer ', '');

    if (!sessionToken) {
      return res.status(401).json({ valid: false, error: "No session token" });
    }

    const session = await AuthService.validateSession(sessionToken);

    if (!session) {
      return res.status(401).json({ valid: false, error: "Invalid session" });
    }

    res.json({
      valid: true,
      user: session
    });
  } catch (error) {
    console.error('Session validation error:', error);
    res.status(500).json({ valid: false, error: "Validation failed" });
  }
});

// Logout endpoint
router.post("/logout", async (req, res) => {
  try {
    const sessionToken = req.cookies?.sessionToken || req.headers.authorization?.replace('Bearer ', '');

    if (sessionToken) {
      await AuthService.logout(sessionToken);
    }

    // Clear the session cookie
    res.clearCookie('sessionToken');

    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: "Logout failed" });
  }
});

export default router;
