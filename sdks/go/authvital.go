// Package authvital provides the official Go SDK for AuthVital Identity Platform.
//
// Status: Coming Soon
//
// This package is a placeholder. The full SDK is under active development.
// Follow https://github.com/authvital/authvital for updates!
package authvital

import "errors"

// ErrNotImplemented is returned when calling placeholder methods.
var ErrNotImplemented = errors.New("authvital: SDK is coming soon! Follow https://github.com/authvital/authvital for updates")

// Version is the current SDK version.
const Version = "0.0.1"

// Client is a placeholder for the AuthVital client.
type Client struct{}

// New creates a new AuthVital client.
//
// Note: This is a placeholder. The full SDK is coming soon!
func New(opts ...Option) (*Client, error) {
	return nil, ErrNotImplemented
}

// Option configures the AuthVital client.
type Option func(*Client)

// WithHost sets the AuthVital host URL.
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
