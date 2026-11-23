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
            [HasPasswordKey] = string.IsNullOrWhiteSpace(s.MellatUserPassword) ? "false" : "true"
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

        var error = Validate(candidate);
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
        return NoContent();
    }

    /// <summary>Null when the configuration can serve payments; otherwise a message for the admin.</summary>
    private static string? Validate(PaymentSettings s)
    {
        switch (PaymentGateways.Canonical(s.Gateway))
        {
            case PaymentGateways.Mellat:
                if (string.IsNullOrWhiteSpace(s.MellatTerminalId))
                    return "شماره ترمینال ملت را وارد کنید.";
                if (!s.MellatTerminalId.All(char.IsAsciiDigit))
                    return "شماره ترمینال ملت باید فقط رقم باشد.";
                if (string.IsNullOrWhiteSpace(s.MellatUserName))
                    return "نام کاربری درگاه ملت را وارد کنید.";
                if (string.IsNullOrWhiteSpace(s.MellatUserPassword))
                    return "رمز درگاه ملت را وارد کنید.";
                if (!IsHttpUrl(s.MellatServiceUrl))
                    return "آدرس سرویس ملت باید یک نشانی کامل http یا https باشد.";
                if (!IsHttpUrl(s.MellatStartPayUrl))
                    return "آدرس صفحه پرداخت ملت باید یک نشانی کامل http یا https باشد.";
                return null;

            case PaymentGateways.Zarinpal:
                return string.IsNullOrWhiteSpace(s.ZarinpalMerchantId)
                    ? "شناسه پذیرنده (Merchant ID) زرین‌پال را وارد کنید."
                    : null;

            case PaymentGateways.Zibal:
                return string.IsNullOrWhiteSpace(s.ZibalMerchant)
                    ? "کد پذیرنده (Merchant) زیبال را وارد کنید."
                    : null;

            case PaymentGateways.Offline:
            case PaymentGateways.Fake:
                return null;

            default:
                return "درگاه پرداخت انتخاب‌شده معتبر نیست.";
        }
    }

    private static bool IsHttpUrl(string value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
}
