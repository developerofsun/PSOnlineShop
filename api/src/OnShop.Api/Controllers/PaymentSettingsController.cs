using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnShop.Api.Services;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Controllers;

/// <summary>
/// Payment gateway configuration for Admin → Settings → Payments.
///
/// The terminal password is write-only: GET reports whether one is stored (<c>payment.mellat.has_password</c>)
/// but never returns the value, and a blank password on save keeps the stored one. Values come back
/// "effective", i.e. database first, then the server's appsettings/environment as a fallback.
/// </summary>
[ApiController, Route("api/admin/payment")]
[Authorize(Policy = Permissions.SettingsManage)]
public class PaymentSettingsController(
    AppDbContext db, PaymentSettingsStore store, IHostEnvironment env) : ControllerBase
{
    private const string HasPasswordKey = "payment.mellat.has_password";
    /// <summary>Read-only, computed: whether the chosen gateway has everything it needs to take a payment.</summary>
    private const string ReadyKey = "payment.ready";

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var s = await store.GetAsync(ct);
        return Ok(new Dictionary<string, string?>
        {
            [PaymentKeys.Gateway] = s.Gateway,
            [PaymentKeys.ZarinpalMerchantId] = s.ZarinpalMerchantId,
            [PaymentKeys.ZarinpalSandbox] = s.ZarinpalSandbox ? "true" : "false",
            [PaymentKeys.ZibalMerchant] = s.ZibalMerchant,
            [PaymentKeys.MellatTerminalId] = s.MellatTerminalId,
            [PaymentKeys.MellatUserName] = s.MellatUserName,
            [PaymentKeys.MellatServiceUrl] = s.MellatServiceUrl,
            [PaymentKeys.MellatStartPayUrl] = s.MellatStartPayUrl,
            [HasPasswordKey] = string.IsNullOrWhiteSpace(s.MellatUserPassword) ? "false" : "true",
            [ReadyKey] = Incomplete(s) is null ? "true" : "false"
        });
    }

    [HttpPut]
    public async Task<IActionResult> Save(Dictionary<string, string?> values, CancellationToken ct)
    {
        var gateway = PaymentGateways.Canonical(values.GetValueOrDefault(PaymentKeys.Gateway));
        if (gateway is null)
            return BadRequest(new { error = "درگاه پرداخت انتخاب‌شده معتبر نیست." });
        if (gateway == PaymentGateways.Fake && env.IsProduction())
            return BadRequest(new { error = "درگاه آزمایشی (Fake) در محیط عملیاتی مجاز نیست." });

        // Validate what would be in effect after this save, not just the submitted fields: a gateway
        // may already have its credentials stored, and switching to it must not silently break checkout.
        var current = await store.GetAsync(ct);
        string Pick(string key, string fallback) =>
            values.TryGetValue(key, out var v) && v is not null ? v.Trim() : fallback;

        var candidate = current with
        {
            Gateway = gateway,
            ZarinpalMerchantId = Pick(PaymentKeys.ZarinpalMerchantId, current.ZarinpalMerchantId),
            ZarinpalSandbox = Pick(PaymentKeys.ZarinpalSandbox, current.ZarinpalSandbox ? "true" : "false")
                .Equals("true", StringComparison.OrdinalIgnoreCase),
            ZibalMerchant = Pick(PaymentKeys.ZibalMerchant, current.ZibalMerchant),
            MellatTerminalId = Pick(PaymentKeys.MellatTerminalId, current.MellatTerminalId),
            MellatUserName = Pick(PaymentKeys.MellatUserName, current.MellatUserName),
            // A blank password means "keep the stored one", so it never clears the credential.
            MellatUserPassword = values.TryGetValue(PaymentKeys.MellatUserPassword, out var pw)
                                 && !string.IsNullOrWhiteSpace(pw)
                ? pw
                : current.MellatUserPassword,
            MellatServiceUrl = Pick(PaymentKeys.MellatServiceUrl, current.MellatServiceUrl),
            MellatStartPayUrl = Pick(PaymentKeys.MellatStartPayUrl, current.MellatStartPayUrl)
        };

        // Only malformed values are refused. Missing credentials are allowed to be saved: the admin must be
        // able to switch the gateway first and fill the terminal details afterwards without a failed save.
        // Until they are filled the checkout answers with a readable "gateway not configured" message.
        var error = ValidateFormats(candidate);
        if (error is not null) return BadRequest(new { error });

        var existing = await db.Settings.Where(s => s.Key.StartsWith("payment."))
            .ToDictionaryAsync(s => s.Key, ct);

        void Set(string key, string? value)
        {
            if (existing.TryGetValue(key, out var row)) row.Value = value;
            else db.Settings.Add(new SiteSetting { Key = key, Value = value });
        }

        Set(PaymentKeys.Gateway, gateway);
        foreach (var key in PaymentKeys.All)
        {
            if (key == PaymentKeys.Gateway) continue;
            if (!values.TryGetValue(key, out var raw) || raw is null) continue;

            // The password is write-only: an empty box keeps the current one instead of erasing it.
            if (key == PaymentKeys.MellatUserPassword && string.IsNullOrWhiteSpace(raw)) continue;

            Set(key, key == PaymentKeys.MellatUserPassword ? raw : raw.Trim());
        }

        await db.SaveChangesAsync(ct);
        return Ok(new { warning = Incomplete(candidate) });
    }

    /// <summary>Null when the values are well formed; otherwise a message for the admin. Emptiness is fine.</summary>
    private static string? ValidateFormats(PaymentSettings s)
    {
        switch (PaymentGateways.Canonical(s.Gateway))
        {
            case PaymentGateways.Mellat:
                if (!string.IsNullOrWhiteSpace(s.MellatTerminalId) && !s.MellatTerminalId.All(char.IsAsciiDigit))
                    return "شماره ترمینال ملت باید فقط رقم باشد.";
                if (!string.IsNullOrWhiteSpace(s.MellatServiceUrl) && !IsHttpUrl(s.MellatServiceUrl))
                    return "آدرس سرویس ملت باید یک نشانی کامل http یا https باشد.";
                if (!string.IsNullOrWhiteSpace(s.MellatStartPayUrl) && !IsHttpUrl(s.MellatStartPayUrl))
                    return "آدرس صفحه پرداخت ملت باید یک نشانی کامل http یا https باشد.";
                return null;

            case PaymentGateways.Zarinpal:
            case PaymentGateways.Zibal:
            case PaymentGateways.Offline:
            case PaymentGateways.Fake:
                return null;

            default:
                return "درگاه پرداخت انتخاب‌شده معتبر نیست.";
        }
    }

    /// <summary>
    /// What is still missing before the chosen gateway can take a payment, or null when it is ready. Saving is
    /// not blocked by this: the admin panel shows it as a warning so a half-filled gateway is never a mystery.
    /// </summary>
    internal static string? Incomplete(PaymentSettings s) =>
        PaymentGateways.Canonical(s.Gateway) switch
        {
            PaymentGateways.Mellat => new[]
            {
                (string.IsNullOrWhiteSpace(s.MellatTerminalId), "شماره ترمینال"),
                (string.IsNullOrWhiteSpace(s.MellatUserName), "نام کاربری"),
                (string.IsNullOrWhiteSpace(s.MellatUserPassword), "رمز درگاه"),
            }.Where(x => x.Item1).Select(x => x.Item2).ToList() is { Count: > 0 } missing
                ? $"درگاه به‌پرداخت ملت هنوز {string.Join("، ", missing)} را ندارد؛ تا تکمیل آن پرداخت انجام نمی‌شود."
                : null,

            PaymentGateways.Zarinpal when string.IsNullOrWhiteSpace(s.ZarinpalMerchantId) =>
                "شناسه پذیرنده (Merchant ID) زرین‌پال را وارد کنید؛ تا آن زمان پرداخت انجام نمی‌شود.",

            PaymentGateways.Zibal when string.IsNullOrWhiteSpace(s.ZibalMerchant) =>
                "کد پذیرنده (Merchant) زیبال را وارد کنید؛ تا آن زمان پرداخت انجام نمی‌شود.",

            PaymentGateways.Zarinpal or PaymentGateways.Zibal or PaymentGateways.Offline or PaymentGateways.Fake => null,

            _ => "درگاه پرداخت انتخاب‌شده معتبر نیست."
        };

    private static bool IsHttpUrl(string value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
}
