-- Session-level AMR (RFC 8176) tracking.
--
-- The IdP session JWT now records HOW the user actually authenticated
-- (["pwd"], ["pwd","otp"], ["fed"], ...). The authorize endpoint persists
-- that amr onto the authorization code, and the token endpoint copies it
-- onto the refresh-token session so every refresh re-stamps the ORIGINAL
-- login's amr. Existing rows default to '{}' (empty), which token minting
-- treats as the legacy approximation ["pwd"].

-- AlterTable: authorization_codes gains amr
ALTER TABLE "authorization_codes" ADD COLUMN "amr" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable: refresh_tokens gains amr
ALTER TABLE "refresh_tokens" ADD COLUMN "amr" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
