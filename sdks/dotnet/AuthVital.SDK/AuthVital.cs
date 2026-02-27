namespace AuthVital.SDK;

/// <summary>
/// Official .NET SDK for AuthVital Identity Platform.
/// 
/// <para><strong>Status: Coming Soon</strong></para>
/// 
/// <para>This package is a placeholder. The full SDK is under active development.
/// Follow <see href="https://github.com/authvital/authvital">the main repository</see> for updates!</para>
/// </summary>
public class AuthVitalClient
{
    /// <summary>
    /// Current SDK version.
    /// </summary>
    public const string Version = "0.0.1";

    /// <summary>
    /// Creates a new AuthVital client builder.
    /// </summary>
    /// <returns>A new builder instance.</returns>
    /// <exception cref="NotImplementedException">Always thrown as this is a placeholder.</exception>
    public static AuthVitalClientBuilder Builder()
    {
        throw new NotImplementedException(
            "AuthVital .NET SDK is coming soon! " +
            "Follow https://github.com/authvital/authvital for updates."
        );
    }
}

/// <summary>
/// Builder for creating AuthVital clients.
/// </summary>
public class AuthVitalClientBuilder
{
    private string? _host;
    private string? _clientId;
    private string? _clientSecret;

    /// <summary>
    /// Sets the AuthVital host URL.
    /// </summary>
    /// <param name="host">The host URL.</param>
    /// <returns>This builder instance.</returns>
    public AuthVitalClientBuilder WithHost(string host)
    {
        _host = host;
        return this;
    }

    /// <summary>
    /// Sets the OAuth client ID.
    /// </summary>
    /// <param name="clientId">The client ID.</param>
    /// <returns>This builder instance.</returns>
    public AuthVitalClientBuilder WithClientId(string clientId)
    {
        _clientId = clientId;
        return this;
    }

    /// <summary>
    /// Sets the OAuth client secret.
    /// </summary>
    /// <param name="clientSecret">The client secret.</param>
    /// <returns>This builder instance.</returns>
    public AuthVitalClientBuilder WithClientSecret(string clientSecret)
    {
        _clientSecret = clientSecret;
        return this;
    }

    /// <summary>
    /// Builds the AuthVital client.
    /// </summary>
    /// <returns>The client instance.</returns>
    /// <exception cref="NotImplementedException">Always thrown as this is a placeholder.</exception>
    public AuthVitalClient Build()
    {
        throw new NotImplementedException("Coming soon!");
    }
}
