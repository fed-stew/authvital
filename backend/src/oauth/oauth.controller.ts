import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Param,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Response, Request } from "express";
import { OAuthService } from "./oauth.service";
import { KeyService } from "./key.service";
import { PrismaService } from "../prisma/prisma.service";
import { OAuthTokenGuard } from "./oauth-token.guard";
import { getBaseCookieOptions, getSessionCookieOptions } from "../common/utils/cookie.utils";

@Controller("oauth")
export class OAuthController {
  private readonly issuer: string;

  constructor(
    private readonly oauthService: OAuthService,
    private readonly keyService: KeyService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.issuer = this.configService.getOrThrow<string>("BASE_URL");
  }

  /**
   * Tenant-Scoped Authorization Endpoint
   *
   * Called from the org picker when user selects a specific tenant.
   * Creates an authorization code scoped to that tenant, then redirects
   * to the app's callback URL.
   *
   * This ensures the resulting token ONLY contains the selected tenant.
   */
  @Get("authorize-tenant")
  async authorizeTenant(
    @Query("tenant_id") tenantId: string,
    @Query("tenant_subdomain") tenantSubdomain: string,
    @Query("client_id") clientId: string,
    @Query("redirect_uri") redirectUri: string,
    @Query("response_type") responseType: string,
    @Query("scope") scope: string,
    @Query("state") state: string,
    @Query("nonce") nonce: string,
    @Query("code_challenge") codeChallenge: string,
    @Query("code_challenge_method") codeChallengeMethod: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Check if user is authenticated via JWT cookie
    const authToken = req.cookies?.["auth_token"];
    const user = authToken
      ? await this.oauthService.validateJwt(authToken)
      : null;

    if (!user) {
      // Not authenticated - redirect to login
      const frontendUrl = this.configService.getOrThrow<string>("BASE_URL");
      const loginUrl = `${frontendUrl}/auth/login`;
      return res.redirect(loginUrl);
    }

    // Validate tenant access - user must be a member of this tenant
    const userInfo = await this.oauthService.getUserInfo(user.userId);
    const hasTenantAccess = userInfo.tenants?.some(
      (t: any) => t.id === tenantId || t.slug === tenantSubdomain,
    );

    if (!hasTenantAccess) {
      throw new BadRequestException(
        "You do not have access to this organization",
      );
    }

    // Use the redirect_uri as provided - it should already be validated against registered URIs
    // For tenant-specific apps, register URIs with {tenant} placeholder (e.g., https://{tenant}.example.com/callback)
    const tenantRedirectUri = redirectUri;

    // Generate tenant-scoped authorization code
    try {
      const code = await this.oauthService.authorize(user.userId, {
        clientId,
        redirectUri: tenantRedirectUri, // Use tenant-specific URI for code storage
        responseType,
        scope,
        state,
        nonce,
        codeChallenge,
        codeChallengeMethod,
        // CRITICAL: Pass tenant scope for token generation
        tenantId,
        tenantSubdomain,
      });

      // Build the redirect URL to the TENANT's callback
      const redirectUrl = new URL(tenantRedirectUri);
      redirectUrl.searchParams.set("code", code);
      if (state) {
        redirectUrl.searchParams.set("state", state);
      }

      console.log(
        `[OAuth] Tenant-scoped redirect: ${tenantSubdomain} -> ${redirectUrl.toString()}`,
      );
      return res.redirect(redirectUrl.toString());
    } catch (error) {
      console.error("[OAuth] authorize-tenant error:", error);
      throw error;
    }
  }

  /**
   * Authorization Endpoint (OIDC)
   *
   * Flow:
   * 1. Check for existing session
   * 2. If no session → redirect to IDP login with return URL
   * 3. If session → issue authorization code → redirect to client
   *
   * Silent Refresh (prompt=none):
   * - If session exists → issue code → return HTML that postMessages to parent
   * - If no session → return HTML with error postMessage
   */
  @Get("authorize")
  async authorize(
    @Query("client_id") clientId: string,
    @Query("redirect_uri") redirectUri: string,
    @Query("response_type") responseType: string,
    @Query("scope") scope: string,
    @Query("state") state: string,
    @Query("nonce") nonce: string,
    @Query("code_challenge") codeChallenge: string,
    @Query("code_challenge_method") codeChallengeMethod: string,
    @Query("prompt") prompt: string,
    @Query("screen") screen: string, // 'login' (default) or 'signup'
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const isSilentRefresh = prompt === "none";

    // Check if user is authenticated via JWT cookie
    const authToken = req.cookies?.["auth_token"];
    const user = authToken
      ? await this.oauthService.validateJwt(authToken)
      : null;

    // Handle silent refresh (prompt=none)
    if (isSilentRefresh) {
      // Extract origin from redirectUri for secure postMessage
      const targetOrigin = this.extractOrigin(redirectUri);

      if (!user) {
        // No session - return error via postMessage
        return this.sendSilentRefreshResponse(
          res,
          {
            error: "login_required",
            error_description: "User is not authenticated",
            state,
          },
          targetOrigin,
        );
      }

      try {
        // Generate authorization code
        const code = await this.oauthService.authorize(user.userId, {
          clientId,
          redirectUri,
          responseType,
          scope,
          state,
          nonce,
          codeChallenge,
          codeChallengeMethod,
        });

        // Return success via postMessage
        return this.sendSilentRefreshResponse(
          res,
          { code, state },
          targetOrigin,
        );
      } catch (error) {
        return this.sendSilentRefreshResponse(
          res,
          {
            error: "server_error",
            error_description:
              error instanceof Error ? error.message : "Authorization failed",
            state,
          },
          targetOrigin,
        );
      }
    }

    // Normal flow - build the OAuth authorize URL for after login
    const authorizeParams = new URLSearchParams();
    if (clientId) authorizeParams.set("client_id", clientId);
    if (redirectUri) authorizeParams.set("redirect_uri", redirectUri);
    if (responseType) authorizeParams.set("response_type", responseType);
    if (scope) authorizeParams.set("scope", scope);
    if (state) authorizeParams.set("state", state);
    if (nonce) authorizeParams.set("nonce", nonce);
    if (codeChallenge) authorizeParams.set("code_challenge", codeChallenge);
    if (codeChallengeMethod)
      authorizeParams.set("code_challenge_method", codeChallengeMethod);

    const oauthAuthorizeUrl = `/oauth/authorize?${authorizeParams.toString()}`;

    // If screen=signup, always redirect to signup page (regardless of existing session)
    // This allows users to create new accounts even when already logged in
    if (screen === "signup") {
      const frontendUrl = this.configService.get<string>(
        "BASE_URL",
        "http://localhost:8000",
      );
      const authParams = new URLSearchParams();
      authParams.set("redirect_uri", oauthAuthorizeUrl);
      if (clientId) authParams.set("client_id", clientId);
      const signupUrl = `${frontendUrl}/auth/signup?${authParams.toString()}`;
      return res.redirect(signupUrl);
    }

    if (!user) {
      // Not authenticated - redirect to IDP login or signup page
      const frontendUrl = this.configService.get<string>(
        "BASE_URL",
        "http://localhost:8000",
      );
      const authPage = screen === "signup" ? "/auth/signup" : "/auth/login";
      // Pass client_id directly so login page can fetch branding without parsing redirect_uri
      const authParams = new URLSearchParams();
      authParams.set("redirect_uri", oauthAuthorizeUrl);
      if (clientId) authParams.set("client_id", clientId);
      const authUrl = `${frontendUrl}${authPage}?${authParams.toString()}`;
      return res.redirect(authUrl);
    }

    // Validate redirect_uri against application's allowed list
    // This is a critical security check per OAuth 2.0 spec
    const validation = await this.oauthService.validateRedirectUri(
      clientId,
      redirectUri,
    );
    if (!validation.valid) {
      console.error(
        `[OAuth] Invalid redirect_uri: ${redirectUri} not in allowed list for client ${clientId}`,
      );
      console.error(`[OAuth] Reason: ${validation.reason}`);
      const errorMsg = validation.reason
        ? `${validation.reason} Registered redirect URI must include "${redirectUri}" or match a pattern (e.g., "http://{tenant}.localhost/api/auth/callback" for dynamic tenant subdomains).`
        : `Invalid redirect_uri: ${redirectUri} is not registered for this application`;
      throw new BadRequestException(errorMsg);
    }

    // Extract tenant from redirect_uri subdomain (e.g., "core" from "core.localhost:3000")
    // This binds the auth code to the tenant so the JWT will include tenant_id
    let tenantId: string | undefined;
    let tenantSubdomain: string | undefined;

    try {
      const redirectUrl = new URL(redirectUri);
      const hostname = redirectUrl.hostname;

      // Extract subdomain from localhost (e.g., "core.localhost" → "core")
      if (hostname.endsWith(".localhost")) {
        const parts = hostname.split(".");
        if (parts.length >= 2 && parts[0] !== "localhost") {
          tenantSubdomain = parts[0];
        }
      } else if (hostname.includes(".")) {
        // For production: "acme.myapp.com" → "acme"
        const parts = hostname.split(".");
        if (parts.length >= 3) {
          tenantSubdomain = parts[0];
        }
      }

      // Look up tenant by subdomain
      if (tenantSubdomain) {
        const tenant = await this.prisma.tenant.findFirst({
          where: { slug: tenantSubdomain },
          select: { id: true, slug: true },
        });
        if (tenant) {
          tenantId = tenant.id;
          console.log(
            `[OAuth] Tenant from redirect_uri: ${tenantSubdomain} (${tenantId})`,
          );
        }
      }
    } catch (err) {
      console.warn("[OAuth] Could not extract tenant from redirect_uri:", err);
    }

    // User is authenticated and redirect_uri is valid - generate auth code and redirect
    try {
      const code = await this.oauthService.authorize(user.userId, {
        clientId,
        redirectUri,
        responseType,
        scope,
        state,
        nonce,
        codeChallenge,
        codeChallengeMethod,
        // Bind auth code to tenant so JWT will include tenant_id/tenant_subdomain
        tenantId,
        tenantSubdomain,
      });

      // Redirect to the exact redirect_uri provided with auth code
      const finalRedirectUrl = new URL(redirectUri);
      finalRedirectUrl.searchParams.set("code", code);
      if (state) {
        finalRedirectUrl.searchParams.set("state", state);
      }

      console.log(`[OAuth] Redirecting to: ${finalRedirectUrl.toString()}`);
      return res.redirect(finalRedirectUrl.toString());
    } catch (error) {
      // If user session is invalid (stale cookie), clear it and redirect to login
      if (error instanceof UnauthorizedException) {
        const clearOpts = getBaseCookieOptions();
        res.clearCookie("auth_token", clearOpts);
        res.clearCookie("idp_session", clearOpts);

        // Redirect to login
        const frontendUrl = this.configService.get<string>(
          "BASE_URL",
          "http://localhost:8000",
        );
        const oauthRedirect = `/oauth/authorize?${authorizeParams.toString()}`;
        const loginUrl = `${frontendUrl}/auth/login?redirect_uri=${encodeURIComponent(oauthRedirect)}`;
        return res.redirect(loginUrl);
      }
      throw error;
    }
  }

  /**
   * Extract origin from a URL for secure postMessage targeting
   * Throws BadRequestException if URL is invalid - NEVER returns '*' to prevent XS-Leaks
   */
  private extractOrigin(url: string | undefined): string {
    if (!url) {
      throw new BadRequestException(
        "redirect_uri is required for silent refresh",
      );
    }
    try {
      const origin = new URL(url).origin;
      if (origin === "null") {
        throw new BadRequestException("Invalid redirect_uri origin");
      }
      return origin;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException("Invalid redirect_uri format");
    }
  }

  /**
   * Validate redirect path for same-origin redirects only
   * Returns '/' as safe fallback for invalid/malicious paths
   */
  private validateRedirectPath(redirect: string | undefined): string {
    if (!redirect) return "/";
    // Only allow same-origin (relative) redirects
    if (!redirect.startsWith("/") || redirect.startsWith("//")) {
      return "/"; // Fall back to home instead of throwing
    }
    return redirect;
  }

  /**
   * Send silent refresh response via postMessage
   * Returns a minimal HTML page that posts the result to the parent window
   *
   * Security: Uses specific targetOrigin instead of wildcard '*' to prevent
   * cross-origin data leakage. The origin should be derived from the OAuth
   * client's redirect_uri.
   */
  private sendSilentRefreshResponse(
    res: Response,
    data: {
      code?: string;
      error?: string;
      error_description?: string;
      state?: string;
    },
    targetOrigin = "*", // TODO: Always pass specific origin from redirect_uri
  ) {
    if (targetOrigin === "*") {
      console.warn(
        "[OAuth] Silent refresh using wildcard origin - should use specific origin",
      );
    }

    const html = `
<!DOCTYPE html>
<html>
<head><title>Silent Refresh</title></head>
<body>
<script>
  (function() {
    var result = ${JSON.stringify({
      type: "silent_refresh_response",
      ...data,
    })};
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(result, ${JSON.stringify(targetOrigin)});
    }
  })();
</script>
</body>
</html>
    `.trim();

    res.setHeader("Content-Type", "text/html");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    return res.send(html);
  }

  /**
   * Token Endpoint
   * Exchange authorization code for tokens, or refresh tokens
   */
  @Post("token")
  @HttpCode(HttpStatus.OK)
  async token(
    @Body("grant_type") grantType: string,
    @Body("code") code: string,
    @Body("redirect_uri") redirectUri: string,
    @Body("client_id") clientId: string,
    @Body("client_secret") clientSecret: string,
    @Body("refresh_token") refreshToken: string,
    @Body("code_verifier") codeVerifier: string,
    @Body("scope") scope: string,
  ) {
    return this.oauthService.token({
      grantType,
      code,
      redirectUri,
      clientId,
      clientSecret,
      refreshToken,
      codeVerifier,
      scope,
    });
  }

  /**
   * Trampoline Endpoint - Server-Side Token Exchange with Cookie Setting
   *
   * This endpoint handles the OAuth callback server-side:
   * 1. Receives code + state (with encoded PKCE verifier)
   * 2. Extracts verifier from state
   * 3. Exchanges code for tokens
   * 4. Sets auth cookie on the response
   * 5. Redirects to final destination
   *
   * State format: `{csrf}:{base64url_verifier}`
   *
   * Use this when:
   * - Backend needs to handle OAuth callback (can't use sessionStorage)
   * - Cross-domain auth where cookies need to be set server-side
   * - You want httpOnly cookies instead of localStorage tokens
   */
  @Get("trampoline")
  async trampoline(
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("error") error: string,
    @Query("error_description") errorDescription: string,
    @Query("redirect") finalRedirect: string,
    @Query("client_id") clientId: string,
    @Query("redirect_uri") redirectUri: string,
    @Res() res: Response,
  ) {
    // Validate finalRedirect to prevent open redirect attacks
    const safeRedirect = this.validateRedirectPath(finalRedirect);

    // Handle OAuth errors
    if (error) {
      console.error(
        "[OAuth Trampoline] Error from IDP:",
        error,
        errorDescription,
      );
      // Use URLSearchParams instead of URL constructor to avoid issues with relative paths
      const errorParams = new URLSearchParams();
      errorParams.set("error", error);
      if (errorDescription) {
        errorParams.set("error_description", errorDescription);
      }
      const separator = safeRedirect.includes("?") ? "&" : "?";
      return res.redirect(
        `${safeRedirect}${separator}${errorParams.toString()}`,
      );
    }

    if (!code || !state) {
      throw new BadRequestException("Missing code or state parameter");
    }

    // Decode state to extract CSRF and verifier
    // State format: `{csrf}:{base64url_verifier}`
    const colonIndex = state.indexOf(":");
    if (colonIndex === -1) {
      throw new BadRequestException("Invalid state format - missing verifier");
    }

    const encodedVerifier = state.substring(colonIndex + 1);
    let codeVerifier: string;

    try {
      // Decode base64url to get verifier
      const padded =
        encodedVerifier +
        "===".slice(0, (4 - (encodedVerifier.length % 4)) % 4);
      codeVerifier = Buffer.from(
        padded.replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf-8");
    } catch (err) {
      throw new BadRequestException(
        "Invalid state format - could not decode verifier",
      );
    }

    console.log(
      "[OAuth Trampoline] Extracted verifier from state, exchanging code for tokens...",
    );

    try {
      // Exchange code for tokens
      const tokens = await this.oauthService.token({
        grantType: "authorization_code",
        code,
        redirectUri: redirectUri || `${this.issuer}/oauth/trampoline`,
        clientId: clientId || "",
        codeVerifier,
      });

      console.log("[OAuth Trampoline] Token exchange successful");

      // Set auth cookie with access token
      const cookieOptions = {
        ...getBaseCookieOptions(),
        maxAge: tokens.expires_in * 1000,
      };

      // Set the access token as a cookie
      res.cookie("auth_token", tokens.access_token, cookieOptions);

      // Also set refresh token if present
      if (tokens.refresh_token) {
        res.cookie("refresh_token", tokens.refresh_token, {
          ...getBaseCookieOptions(),
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });
      }

      // Redirect to final destination (safeRedirect was validated earlier)
      console.log("[OAuth Trampoline] Redirecting to:", safeRedirect);
      return res.redirect(safeRedirect);
    } catch (err) {
      console.error("[OAuth Trampoline] Token exchange failed:", err);
      // Use URLSearchParams instead of URL constructor to avoid issues with relative paths
      const errorParams = new URLSearchParams();
      errorParams.set("error", "token_exchange_failed");
      errorParams.set(
        "error_description",
        err instanceof Error ? err.message : "Unknown error",
      );
      const separator = safeRedirect.includes("?") ? "&" : "?";
      return res.redirect(
        `${safeRedirect}${separator}${errorParams.toString()}`,
      );
    }
  }

  /**
   * Token Introspection Endpoint (RFC 7662)
   * Allows resource servers to validate tokens
   */
  @Post("introspect")
  @HttpCode(HttpStatus.OK)
  async introspect(
    @Body("token") token: string,
    @Body("token_type_hint") tokenTypeHint?: string,
  ) {
    if (!token) {
      throw new BadRequestException("Token is required");
    }
    return this.oauthService.introspect(token, tokenTypeHint);
  }

  /**
   * UserInfo Endpoint (OIDC)
   * Returns claims about the authenticated user
   * Uses OAuthTokenGuard to validate RS256 access tokens
   */
  @Get("userinfo")
  @UseGuards(OAuthTokenGuard)
  async userinfo(@Req() req: Request & { user: { id: string } }) {
    return this.oauthService.getUserInfo(req.user.id);
  }

  /**
   * Tenants Endpoint
   * Returns only tenant_id and tenant_name for each tenant the user belongs to.
   * Use this instead of parsing tenants from the JWT (tenants are no longer in the JWT).
   * Uses OAuthTokenGuard to validate RS256 access tokens.
   */
  @Get("tenants")
  @UseGuards(OAuthTokenGuard)
  async getTenants(@Req() req: Request & { user: { id: string } }) {
    return this.oauthService.getTenants(req.user.id);
  }

  /**
   * Token Revocation Endpoint (RFC 7009)
   */
  @Post("revoke")
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Body("token") token: string,
    @Body("token_type_hint") tokenTypeHint?: string,
  ) {
    if (!token) {
      throw new BadRequestException("Token is required");
    }
    await this.oauthService.revokeToken(token, tokenTypeHint);
    return { success: true };
  }

  // ===========================================================================
  // TOKEN GHOSTING: Session Management Endpoints
  // ===========================================================================

  /**
   * Logout Endpoint - Revoke current session (Token Ghosting)
   *
   * Reads the refresh token from HttpOnly cookie or request body,
   * extracts the session ID (sid), and revokes that specific session.
   *
   * This allows instant session invalidation without key rotation.
   */
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body("refresh_token") refreshTokenBody?: string,
  ) {
    // Get refresh token from cookie or body
    const refreshToken = req.cookies?.["refresh_token"] || refreshTokenBody;

    if (!refreshToken) {
      // No token = nothing to revoke, but still clear cookies
      this.clearAuthCookies(res);
      return { success: true, message: "Logged out (no active session)" };
    }

    try {
      // Try to extract session ID from JWT
      const { sid } =
        await this.oauthService.verifyRefreshTokenJwt(refreshToken);

      // Revoke the session
      const result = await this.oauthService.revokeSession(sid);

      // Clear auth cookies
      this.clearAuthCookies(res);

      return result;
    } catch (error) {
      // JWT invalid/expired - just clear cookies (nothing to revoke)
      this.clearAuthCookies(res);
      return { success: true, message: "Logged out" };
    }
  }

  /**
   * Logout All Endpoint - Revoke all sessions for the user (Token Ghosting)
   *
   * Requires authentication. Revokes all active sessions for the user,
   * effectively logging them out of all devices.
   */
  @Post("logout-all")
  @UseGuards(OAuthTokenGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @Req() req: Request & { user: { id: string } },
    @Res({ passthrough: true }) res: Response,
    @Body("application_id") applicationId?: string,
  ) {
    const result = await this.oauthService.revokeAllUserSessions(
      req.user.id,
      applicationId,
    );

    // Clear auth cookies for current session
    this.clearAuthCookies(res);

    return {
      success: true,
      message: `Revoked ${result.count} session(s)`,
      count: result.count,
    };
  }

  /**
   * Get Active Sessions - List all active sessions for the user (Token Ghosting)
   *
   * Returns a list of active sessions for the authenticated user,
   * useful for "manage sessions" UI.
   */
  @Get("sessions")
  @UseGuards(OAuthTokenGuard)
  async getSessions(
    @Req() req: Request & { user: { id: string } },
    @Query("application_id") applicationId?: string,
  ) {
    const sessions = await this.oauthService.getUserSessions(
      req.user.id,
      applicationId,
    );

    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        tenant: s.tenantSubdomain,
      })),
      count: sessions.length,
    };
  }

  /**
   * Revoke Specific Session - Revoke a session by ID (Token Ghosting)
   *
   * Allows revoking a specific session (e.g., from "manage sessions" UI).
   * User must be authenticated and can only revoke their own sessions.
   */
  @Post("sessions/:sessionId/revoke")
  @UseGuards(OAuthTokenGuard)
  @HttpCode(HttpStatus.OK)
  async revokeSessionById(
    @Req() req: Request & { user: { id: string } },
    @Param("sessionId") sessionId: string,
  ) {
    // Verify the session belongs to this user before revoking
    const session = await this.prisma.refreshToken.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });

    if (!session) {
      throw new NotFoundException("Session not found");
    }

    if (session.userId !== req.user.id) {
      throw new UnauthorizedException("Cannot revoke another user's session");
    }

    return this.oauthService.revokeSession(sessionId);
  }

  /**
   * Helper: Clear auth cookies
   */
  private clearAuthCookies(res: Response) {
    const cookieOptions = getBaseCookieOptions();
    res.clearCookie("auth_token", cookieOptions);
    res.clearCookie("refresh_token", cookieOptions);
  }
}
