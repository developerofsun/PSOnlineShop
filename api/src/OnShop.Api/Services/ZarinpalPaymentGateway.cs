using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace OnShop.Api.Services;

/// <summary>
/// Zarinpal payment gateway (REST API v4).
/// Docs: https://docs.zarinpal.com/paymentGateway/rest/
///
/// Amounts in this shop are stored in Toman; Zarinpal expects Rial, so every amount is multiplied by 10.
/// Configure with:
///   Payment:Gateway = "Zarinpal"
///   Payment:Zarinpal:MerchantId = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
///   Payment:Zarinpal:Sandbox = true   (use the sandbox host while testing)
/// </summary>
public class ZarinpalPaymentGateway(HttpClient http, IConfiguration config, ILogger<ZarinpalPaymentGateway> log)
    : IPaymentGateway
{
    public string Name => "Zarinpal";

    private string MerchantId =>
        config["Payment:Zarinpal:MerchantId"]
        ?? throw new InvalidOperationException("Payment:Zarinpal:MerchantId is not configured.");

    private bool Sandbox => config.GetValue("Payment:Zarinpal:Sandbox", false);

    private string BaseUrl => Sandbox
        ? "https://sandbox.zarinpal.com"
        : "https://payment.zarinpal.com";

    private string StartPayUrl => Sandbox
        ? "https://sandbox.zarinpal.com/pg/StartPay"
        : "https://payment.zarinpal.com/pg/StartPay";

    public async Task<PaymentRequestResult> RequestAsync(PaymentRequest request, CancellationToken ct)
    {
        var body = new
        {
            merchant_id = MerchantId,
            amount = ToRial(request.Amount),
            callback_url = request.CallbackUrl,
            description = $"پرداخت سفارش {request.OrderNumber}",
            metadata = request.Phone is null ? null : new { mobile = request.Phone }
        };

        try
        {
            using var res = await http.PostAsJsonAsync($"{BaseUrl}/pg/v4/payment/request.json", body, ct);
            var payload = await res.Content.ReadFromJsonAsync<ZarinpalResponse>(ct);

            if (payload?.Data?.Code == 100 && !string.IsNullOrWhiteSpace(payload.Data.Authority))
                return new PaymentRequestResult(
                    true, payload.Data.Authority, $"{StartPayUrl}/{payload.Data.Authority}", null);

            var error = payload?.Errors?.FirstOrDefault()?.Message
                        ?? $"Zarinpal rejected the request (HTTP {(int)res.StatusCode}).";
            log.LogWarning("Zarinpal request failed for {Order}: {Error}", request.OrderNumber, error);
            return new PaymentRequestResult(false, null, null, error);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            log.LogError(ex, "Zarinpal request threw for {Order}", request.OrderNumber);
            return new PaymentRequestResult(false, null, null, ex.Message);
        }
    }

    public async Task<PaymentVerifyResult> VerifyAsync(PaymentVerify verify, CancellationToken ct)
    {
        // Zarinpal reports the outcome of the user's visit in the callback query string.
        if (!string.Equals(verify.Status, "OK", StringComparison.OrdinalIgnoreCase))
            return new PaymentVerifyResult(false, null, "Payment was cancelled or failed at the gateway.");

        var body = new
        {
            merchant_id = MerchantId,
            amount = ToRial(verify.Amount),
            authority = verify.Authority
        };

        try
        {
            using var res = await http.PostAsJsonAsync($"{BaseUrl}/pg/v4/payment/verify.json", body, ct);
            var payload = await res.Content.ReadFromJsonAsync<ZarinpalResponse>(ct);

            // 100 = verified now, 101 = already verified (a retried callback): both mean the money is in.
            if (payload?.Data?.Code is 100 or 101)
                return new PaymentVerifyResult(true, payload.Data.RefId?.ToString(), null);

            var error = payload?.Errors?.FirstOrDefault()?.Message
                        ?? $"Zarinpal could not verify the payment (HTTP {(int)res.StatusCode}).";
            log.LogWarning("Zarinpal verify failed for {Order}: {Error}", verify.OrderNumber, error);
            return new PaymentVerifyResult(false, null, error);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            log.LogError(ex, "Zarinpal verify threw for {Order}", verify.OrderNumber);
            return new PaymentVerifyResult(false, null, ex.Message);
        }
    }

    /// <summary>Toman → Rial. Zarinpal rejects zero, so a free order is sent as the smallest payable amount.</summary>
    private static long ToRial(long toman) => Math.Max(toman * 10, 1000);

    private sealed class ZarinpalResponse
    {
        [JsonPropertyName("data")] public ZarinpalData? Data { get; set; }
        [JsonPropertyName("errors")] public List<ZarinpalError>? Errors { get; set; }
    }

    private sealed class ZarinpalData
    {
        [JsonPropertyName("code")] public int Code { get; set; }
        [JsonPropertyName("authority")] public string? Authority { get; set; }
        [JsonPropertyName("ref_id")] public long? RefId { get; set; }
    }

    private sealed class ZarinpalError
    {
        [JsonPropertyName("code")] public int Code { get; set; }
        [JsonPropertyName("message")] public string? Message { get; set; }
    }
}
