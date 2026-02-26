// Package authvader provides the official Go SDK for AuthVader Identity Platform.
//
// Status: Coming Soon
//
// This package is a placeholder. The full SDK is under active development.
// Follow https://github.com/authvader/authvader for updates!
package authvader

import "errors"

// ErrNotImplemented is returned when calling placeholder methods.
var ErrNotImplemented = errors.New("authvader: SDK is coming soon! Follow https://github.com/authvader/authvader for updates")

// Version is the current SDK version.
const Version = "0.0.1"

// Client is a placeholder for the AuthVader client.
type Client struct{}

// New creates a new AuthVader client.
//
// Note: This is a placeholder. The full SDK is coming soon!
func New(opts ...Option) (*Client, error) {
	return nil, ErrNotImplemented
}

// Option configures the AuthVader client.
type Option func(*Client)

// WithHost sets the AuthVader host URL.
func WithHost(host string) Option {
	return func(c *Client) {}
}

// WithClientID sets the OAuth client ID.
func WithClientID(clientID string) Option {
	return func(c *Client) {}
}

// WithClientSecret sets the OAuth client secret.
func WithClientSecret(clientSecret string) Option {
	return func(c *Client) {}
}
