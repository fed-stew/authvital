import { NextFunction, Request, Response } from 'express';
import { ServiceRole } from './service-role';

/**
 * Cross-plane UI gate.
 *
 * The React build is a single bundle serving two UI surfaces:
 *   /auth/*  — OAuth login pages (data plane)
 *   /admin/* — super-admin dashboard (control plane)
 *
 * On a split deployment each service must 404 the other plane's UI routes
 * (a redirect would leak topology; serving the SPA shell would leak the
 * app shell + trigger client-side routing). This middleware is registered
 * in main.ts BEFORE Nest initializes, so it runs ahead of ServeStatic and
 * the SPA fallback.
 *
 * KNOWN LIMIT (documented, not fixed here): both planes share one JS bundle,
 * so admin UI *code* ships inside the public bundle's chunks regardless.
 * Splitting the frontend build is a separate effort; all admin *APIs* are
 * absent from the public service, so the leaked code is inert.
 */
export function createPlaneGateMiddleware(role: ServiceRole) {
  const blockedPrefix =
    role === 'public' ? '/admin' : role === 'admin' ? '/auth' : null;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (blockedPrefix === null) {
      next(); // role 'all' serves both planes
      return;
    }

    const path = req.path ?? req.url;
    if (path === blockedPrefix || path.startsWith(`${blockedPrefix}/`)) {
      res.status(404).json({
        statusCode: 404,
        message: 'Not Found',
        error: 'Not Found',
      });
      return;
    }

    next();
  };
}
