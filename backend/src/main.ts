import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

// Build DATABASE_URL from components if not provided directly (Cloud SQL socket connection)
// Google's format: postgresql://USER:PASS@localhost/DB?host=/cloudsql/PROJECT:REGION:INSTANCE
// - Password MUST be URL-encoded (handles special chars like @, #, !)
// - Host path should NOT be URL-encoded
// - Use 'localhost' (ignored when socket specified via host param)
if (!process.env.DATABASE_URL && process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_PASSWORD && process.env.DB_DATABASE) {
  const { DB_HOST, DB_USERNAME, DB_PASSWORD, DB_DATABASE } = process.env;
  process.env.DATABASE_URL = `postgresql://${DB_USERNAME}:${encodeURIComponent(DB_PASSWORD)}@localhost/${DB_DATABASE}?host=${DB_HOST}`;
}

// Validate required environment variables BEFORE importing anything else
// This ensures we fail fast with a clear error message
import { validateEnv } from './config/env.validation';
validateEnv();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, RequestMethod } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Reduce log verbosity in production (no module registration spam)
    logger: process.env.NODE_ENV === 'production' 
      ? ['error', 'warn'] 
      : undefined, // Default (all levels) for local dev
  });

  // Enable global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Cookie parser for session handling
  app.use(cookieParser());

  // CORS configuration
  // Supports exact origins and wildcard patterns like *.example.com
  // BASE_URL is validated at startup - guaranteed to exist
  const corsOrigins = [
    process.env.BASE_URL!,
    // Additional origins from env (comma-separated)
    // Supports: http://example.com, *.example.com, http://*.example.com
    ...(process.env.CORS_ORIGINS?.split(',').map(o => o.trim()) || []),
  ].filter(Boolean);

  // Convert wildcard patterns to regex
  const originMatchers = corsOrigins.map(pattern => {
    if (pattern.includes('*')) {
      // Convert *.example.com to regex
      // Escape special regex chars except *
      const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
      // Replace * with regex pattern for subdomains
      const regexStr = escaped.replace(/\*/g, '[a-zA-Z0-9-]+');
      return new RegExp(`^${regexStr}$`);
    }
    return pattern; // Exact match
  });

  const isOriginAllowed = (origin: string): boolean => {
    return originMatchers.some(matcher => {
      if (matcher instanceof RegExp) {
        return matcher.test(origin);
      }
      return matcher === origin;
    });
  };

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) {
        return callback(null, true);
      }
      
      // In development, allow all localhost origins
      if (process.env.NODE_ENV !== 'production' && origin.includes('localhost')) {
        return callback(null, true);
      }
      
      // Check whitelist (exact match or wildcard pattern)
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // Global prefix: All API routes get /api prefix
  // Exclude: OAuth/OIDC endpoints (must be at root per spec)
  app.setGlobalPrefix('api', {
    exclude: [
      // OIDC Well-Known endpoints (must be at root per spec)
      { path: '/.well-known/openid-configuration', method: RequestMethod.GET },
      { path: '/.well-known/jwks.json', method: RequestMethod.GET },
      // OAuth endpoints at /oauth/* (not /api/oauth/*)
      { path: '/oauth/(.*)', method: RequestMethod.GET },
      { path: '/oauth/(.*)', method: RequestMethod.POST },
    ],
  });

  // ==========================================================================
  // SPA FALLBACK: Serve index.html for all non-API, non-static routes
  // This MUST come after all other middleware/routes are configured
  // ==========================================================================
  const expressApp = app.getHttpAdapter().getInstance();
  
  // Load index.html from /app/public
  const indexPath = '/app/public/index.html';
  let indexHtml: string | null = null;
  if (existsSync(indexPath)) {
    indexHtml = readFileSync(indexPath, 'utf-8');
    console.log(`[SPA] Loaded index.html`);
  }
  
  // Catch-all: Any GET request that hasn't been handled serves index.html
  // Note: Express 5 / path-to-regexp 8+ requires named wildcard params
  expressApp.get('*splat', (req: Request, res: Response, next: NextFunction) => {
    // Skip API routes - they should 404 properly
    if (req.path.startsWith('/api/')) {
      return next();
    }
    
    // Skip OAuth/OIDC routes - they're handled by NestJS controllers
    if (req.path.startsWith('/oauth/') || req.path.startsWith('/.well-known/')) {
      return next();
    }
    
    // Skip static file requests (anything with a file extension)
    // These should 404 if not found, not return index.html
    if (req.path.match(/\.[a-zA-Z0-9]+$/)) {
      return next();
    }
    
    // Skip if already handled
    if (res.headersSent) {
      return next();
    }
    
    // Serve the SPA for all other routes (client-side routing)
    if (indexHtml) {
      res.type('html').send(indexHtml);
    } else {
      res.status(503).json({ error: 'Frontend not available' });
    }
  });

  const port = parseInt(process.env.PORT!, 10);
  if (isNaN(port)) {
    console.error('PORT environment variable must be a valid number');
    process.exit(1);
  }
  await app.listen(port);

  console.log(`AuthVital IDP running on http://localhost:${port}`);
}

bootstrap();
