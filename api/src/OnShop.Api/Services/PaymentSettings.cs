using Microsoft.EntityFrameworkCore;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Services;

/// <summary>
/// Canonical gateway names. The admin picks one of these in Admin → Settings → Payments; the same
/// names (plus the Mellat aliases) are accepted from Payment:Gateway in configuration.
/// </summary>
public static class PaymentGateways
{
    public const string Mellat = "BehpardakhtMellat";
    public const string Zarinpal = "Zarinpal";
    public const string Zibal = "Zibal";
    public const string Offline = "Offline";
    public const string Fake = "Fake";

    /// <summary>Gateways offered in the admin panel, in display order.</summary>
    public static readonly string[] All = [Mellat, Zarinpal, Zibal, Offline, Fake];

    /// <summary>The canonical spelling of a configured name, or null when it is not a known gateway.</summary>
    public static string? Canonical(string? name) => name?.Trim().ToLowerInvariant() switch
    {
        "behpardakhtmellat" or "behpardakht" or "mellat" => Mellat,
        "zarinpal" => Zarinpal,
        "zibal" => Zibal,
        "offline" => Offline,
        "fake" => Fake,
        _ => null
    };
}

/// <summary>
/// Setting keys for the payment gateway. These are stored in SiteSetting like everything else, but
/// they are reserved: the generic settings endpoints hide them, because the terminal password is one
/// of them and GET /api/admin/settings returns every row.
/// </summary>
public static class PaymentKeys
{
    public const string Gateway = "payment.gateway";
    public const string ZarinpalMerchantId = "payment.zarinpal.merchant_id";
    public const string ZarinpalSandbox = "payment.zarinpal.sandbox";
    public const string ZibalMerchant = "payment.zibal.merchant";
    public const string MellatTerminalId = "payment.mellat.terminal_id";
    public const string MellatUserName = "payment.mellat.user_name";
    public const string MellatUserPassword = "payment.mellat.user_password";
    public const string MellatServiceUrl = "payment.mellat.service_url";
    public const string MellatStartPayUrl = "payment.mellat.start_pay_url";

    /// <summary>Keys the payment endpoints own; the generic settings endpoint must not read or write them.</summary>
    public static readonly string[] All =
    [
        Gateway,
        ZarinpalMerchantId, ZarinpalSandbox,
        ZibalMerchant,
        MellatTerminalId, MellatUserName, MellatUserPassword, MellatServiceUrl, MellatStartPayUrl
    ];

    public static bool IsReserved(string? key) =>
        key is not null && key.StartsWith("payment.", StringComparison.OrdinalIgnoreCase);
}

/// <summary>
/// The payment configuration in effect for one request: the database wins, configuration is the
/// fallback so an existing deployment keeps working without touching the admin panel.
/// </summary>
public sealed record PaymentSettings
{
    public string Gateway { get; init; } = PaymentGateways.Fake;

    public string ZarinpalMerchantId { get; init; } = "";
    public bool ZarinpalSandbox { get; init; }

    public string ZibalMerchant { get; init; } = "";

    public string MellatTerminalId { get; init; } = "";
    public string MellatUserName { get; init; } = "";
    public string MellatUserPassword { get; init; } = "";
    public string MellatServiceUrl { get; init; } = "";
    public string MellatStartPayUrl { get; init; } = "";
}

/// <summary>
/// Reads the payment settings for the current request. Resolved per request (scoped) instead of at
/// startup, so saving the gateway in the admin panel takes effect without restarting the API.
/// </summary>
public sealed class PaymentSettingsStore(AppDbContext db, IConfiguration config)
{
    private const string DefaultMellatServiceUrl = "https://bpm.shaparak.ir/pgwchannel/services/pgw";
    private const string DefaultMellatStartPayUrl = "https://bpm.shaparak.ir/pgwchannel/startpay.mellat";

    public async Task<PaymentSettings> GetAsync(CancellationToken ct)
    {
        var rows = await db.Settings.AsNoTracking()
            .Where(s => s.Key.StartsWith("payment."))
            .ToDictionaryAsync(s => s.Key, s => s.Value, ct);

        string? Stored(string key) =>
            rows.TryGetValue(key, out var v) && !string.IsNullOrWhiteSpace(v) ? v.Trim() : null;

        string Config(string key) => config[key] is { Length: > 0 } c ? c.Trim() : "";

        static string Or(IConfiguration cfg, string key, string fallback) =>
            cfg[key] is { Length: > 0 } v ? v.Trim() : fallback;

        bool StoredFlag(string key, string configKey)
        {
            var stored = Stored(key);
            if (stored is null) return config.GetValue(configKey, false);

            return stored.Equals("true", StringComparison.OrdinalIgnoreCase) || stored == "1";
        }

        return new PaymentSettings
        {
            Gateway = PaymentGateways.Canonical(Stored(PaymentKeys.Gateway) ?? config["Payment:Gateway"])
                      ?? "",
            ZarinpalMerchantId = Stored(PaymentKeys.ZarinpalMerchantId) ?? Config("Payment:Zarinpal:MerchantId"),
            ZarinpalSandbox = StoredFlag(PaymentKeys.ZarinpalSandbox, "Payment:Zarinpal:Sandbox"),
            ZibalMerchant = Stored(PaymentKeys.ZibalMerchant) ?? Config("Payment:Zibal:Merchant"),
            MellatTerminalId = Stored(PaymentKeys.MellatTerminalId) ?? Config("Payment:Mellat:TerminalId"),
            MellatUserName = Stored(PaymentKeys.MellatUserName) ?? Config("Payment:Mellat:UserName"),
            MellatUserPassword = Stored(PaymentKeys.MellatUserPassword) ?? Config("Payment:Mellat:UserPassword"),
            MellatServiceUrl = Stored(PaymentKeys.MellatServiceUrl) ?? Or(config, "Payment:Mellat:ServiceUrl", DefaultMellatServiceUrl),
            MellatStartPayUrl = Stored(PaymentKeys.MellatStartPayUrl) ?? Or(config, "Payment:Mellat:StartPayUrl", DefaultMellatStartPayUrl)
        };
    }
}

/// <summary>Thrown when the gateway chosen in settings cannot be used as configured.</summary>
public sealed class PaymentConfigurationException(string message) : Exception(message);

/// <summary>
/// Picks the active gateway for the current request. All gateways are registered once at startup and
/// the choice is made here, which is what lets an admin switch providers without a restart.
/// </summary>
public sealed class PaymentGatewayResolver(
    PaymentSettingsStore store,
    MellatPaymentGateway mellat,
    ZarinpalPaymentGateway zarinpal,
    ZibalPaymentGateway zibal,
    OfflinePaymentGateway offline,
    FakePaymentGateway fake,
    IHostEnvironment env)
{
    public async Task<(IPaymentGateway Gateway, PaymentSettings Settings)> ResolveAsync(CancellationToken ct)
    {
        var settings = await store.GetAsync(ct);

        var name = PaymentGateways.Canonical(settings.Gateway)
                   ?? throw new PaymentConfigurationException(
                       $"Unknown payment gateway '{settings.Gateway}'. Choose one in Admin → Settings → Payments.");

        if (name == PaymentGateways.Fake && env.IsProduction())
            throw new PaymentConfigurationException(
                "The Fake payment gateway must not be used in Production. Choose a real gateway in Admin → Settings → Payments.");

        IPaymentGateway gateway = name switch
        {
            PaymentGateways.Mellat => mellat,
            PaymentGateways.Zarinpal => zarinpal,
            PaymentGateways.Zibal => zibal,
            PaymentGateways.Offline => offline,
            _ => fake
        };

        return (gateway, settings);
    }
}
