namespace AuthVader.SDK;

/// <summary>
/// Official .NET SDK for AuthVader Identity Platform.
/// 
/// <para><strong>Status: Coming Soon</strong></para>
/// 
/// <para>This package is a placeholder. The full SDK is under active development.
/// Follow <see href="https://github.com/authvader/authvader">the main repository</see> for updates!</para>
/// </summary>
public class AuthVaderClient
{
    /// <summary>
    /// Current SDK version.
    /// </summary>
    public const string Version = "0.0.1";

    /// <summary>
    /// Creates a new AuthVader client builder.
    /// </summary>
    /// <returns>A new builder instance.</returns>
    /// <exception cref="NotImplementedException">Always thrown as this is a placeholder.</exception>
    public static AuthVaderClientBuilder Builder()
    {
        throw new NotImplementedException(
            "AuthVader .NET SDK is coming soon! " +
            "Follow https://github.com/authvader/authvader for updates."
        );
    }
}

/// <summary>
/// Builder for creating AuthVader clients.
/// </summary>
public class AuthVaderClientBuilder
{
    private string? _host;
    private string? _clientId;
    private string? _clientSecret;

    /// <summary>
    /// Sets the AuthVader host URL.
    /// </summary>
    /// <param name="host">The host URL.</param>
    /// <returns>This builder instance.</returns>
    public AuthVaderClientBuilder WithHost(string host)
    {
        _host = host;
        return this;
    }

    /// <summary>
    /// Sets the OAuth client ID.
    /// </summary>
    /// <param name="clientId">The client ID.</param>
    /// <returns>This builder instance.</returns>
    public AuthVaderClientBuilder WithClientId(string clientId)
    {
        _clientId = clientId;
        return this;
    }

    /// <summary>
    /// Sets the OAuth client secret.
    /// </summary>
    /// <param name="clientSecret">The client secret.</param>
    /// <returns>This builder instance.</returns>
    public AuthVaderClientBuilder WithClientSecret(string clientSecret)
    {
        _clientSecret = clientSecret;
        return this;
    }

    /// <summary>
    /// Builds the AuthVader client.
    /// </summary>
    /// <returns>The client instance.</returns>
    /// <exception cref="NotImplementedException">Always thrown as this is a placeholder.</exception>
    public AuthVaderClient Build()
    {
        throw new NotImplementedException("Coming soon!");
    }
}
