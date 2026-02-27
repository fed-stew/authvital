package com.authvital.sdk;

/**
 * Official Java SDK for AuthVital Identity Platform.
 * 
 * <p><strong>Status: Coming Soon</strong></p>
 * 
 * <p>This package is a placeholder. The full SDK is under active development.
 * Follow <a href="https://github.com/authvital/authvital">the main repository</a> for updates!</p>
 * 
 * @author AuthVital Contributors
 * @version 0.0.1
 */
public class AuthVital {
    
    /** Current SDK version. */
    public static final String VERSION = "0.0.1";
    
    /**
     * Creates a new AuthVital client builder.
     * 
     * @return a new builder instance
     * @throws UnsupportedOperationException always, as this is a placeholder
     */
    public static Builder builder() {
        throw new UnsupportedOperationException(
            "AuthVital Java SDK is coming soon! " +
            "Follow https://github.com/authvital/authvital for updates."
        );
    }
    
    /**
     * Builder for creating AuthVital clients.
     */
    public static class Builder {
        private String host;
        private String clientId;
        private String clientSecret;
        
        /**
         * Sets the AuthVital host URL.
         * @param host the host URL
         * @return this builder
         */
        public Builder host(String host) {
            this.host = host;
            return this;
        }
        
        /**
         * Sets the OAuth client ID.
         * @param clientId the client ID
         * @return this builder
         */
        public Builder clientId(String clientId) {
            this.clientId = clientId;
            return this;
        }
        
        /**
         * Sets the OAuth client secret.
         * @param clientSecret the client secret
         * @return this builder
         */
        public Builder clientSecret(String clientSecret) {
            this.clientSecret = clientSecret;
            return this;
        }
        
        /**
         * Builds the AuthVital client.
         * @return the client instance
         */
        public AuthVital build() {
            throw new UnsupportedOperationException("Coming soon!");
        }
    }
}
