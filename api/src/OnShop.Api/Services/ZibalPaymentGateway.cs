using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace OnShop.Api.Services;

/// <summary>
/// Zibal payment gateway (REST API v1).
/// Docs: https://help.zibal.ir/ipg/
///
/// Amounts in this shop are stored in Toman; Zibal expects Rial, so every amount is multiplied by 10.
/// Configure with:
///   Payment:Gateway = "Zibal"
///   Payment:Zibal:Merchant = "your-merchant"   ("zibal" is Zibal's public test merchant)
///
/// The callback is a GET with ?trackId=&amp;success=1&amp;status=2&amp;orderId=...; the payment is only
/// accepted after POST /v1/verify returns result 100 (fresh) or 201 (already verified).
/// </summary>
public class ZibalPaymentGateway(HttpClient http, ILogger<ZibalPaymentGateway> log) : IPaymentGateway
{
    private const string BaseUrl = "https://gateway.zibal.ir";

    public string Name => PaymentGateways.Zibal;
    public bool RequiresPayment => true;

    private static string MerchantId(PaymentSettings settings) =>
        !string.IsNullOrWhiteSpace(settings.ZibalMerchant)
            ? settings.ZibalMerchant.Trim()
            : throw new PaymentConfigurationException(
                "Payment:Zibal:Merchant is not configured. Set it in Admin → Settings → Payments.");

    public async Task<PaymentRequestResult> RequestAsync(
        PaymentRequest request, PaymentSettings settings, CancellationToken ct)
    {
        var body = new Dictionary<string, object>
        {
            ["merchant"] = MerchantId(settings),
            ["amount"] = ToRial(request.Amount),
            ["callbackUrl"] = request.CallbackUrl,
            ["description"] = $"پرداخت سفارش {request.OrderNumber}",
            ["orderId"] = request.OrderNumber
        };
        if (!string.IsNullOrWhiteSpace(request.Phone)) body["mobile"] = request.Phone;

        try
        {
            using var res = await http.PostAsJsonAsync($"{BaseUrl}/v1/request", body, ct);
            var payload = await res.Content.ReadFromJsonAsync<ZibalResponse>(ct);

            if (payload?.Result == 100 && payload.TrackId is not null)
                return new PaymentRequestResult(
                    true,
                    payload.TrackId.Value.ToString(),
                    $"{BaseUrl}/start/{payload.TrackId.Value}",
                    null);

            var error = payload?.Message ?? $"Zibal rejected the request (HTTP {(int)res.StatusCode}).";
            log.LogWarning("Zibal request failed for {Order}: {Error}", request.OrderNumber, error);
            return new PaymentRequestResult(false, null, null, error);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            log.LogError(ex, "Zibal request threw for {Order}", request.OrderNumber);
            return new PaymentRequestResult(false, null, null, ex.Message);
        }
    }

    public async Task<PaymentVerifyResult> VerifyAsync(
        PaymentVerify verify, PaymentSettings settings, CancellationToken ct)
    {
        // Zibal's trackId is an integer, so send it back as one rather than as the stored string.
        if (!long.TryParse(verify.Authority, out var trackId))
            return new PaymentVerifyResult(false, null, "The payment tracking id is not a Zibal trackId.");

        // success=1 in the callback only means "the payer made it back"; only verify confirms money.
        var body = new Dictionary<string, object>
        {
            ["merchant"] = MerchantId(settings),
            ["trackId"] = trackId
        };

        try
        {
            using var res = await http.PostAsJsonAsync($"{BaseUrl}/v1/verify", body, ct);
            var payload = await res.Content.ReadFromJsonAsync<ZibalResponse>(ct);

            // 100 = verified now, 201 = already verified (a retried callback): both mean the money is in.
            if (payload?.Result is 100 or 201)
            {
                // The gateway reports the settled amount in Rial; a mismatch must not be delivered.
                if (payload.Amount is > 0 && payload.Amount != ToRial(verify.Amount))
                {
                    var mismatch = $"Zibal amount {payload.Amount} does not match the order amount {ToRial(verify.Amount)}.";
                    log.LogError("Zibal verify amount mismatch for {Order}: {Error}", verify.OrderNumber, mismatch);
                    return new PaymentVerifyResult(false, null, mismatch);
                }

                return new PaymentVerifyResult(true, payload.RefNumber?.ToString(), null);
            }

            var error = payload?.Message ?? $"Zibal could not verify the payment (HTTP {(int)res.StatusCode}).";
            log.LogWarning("Zibal verify failed for {Order}: {Error}", verify.OrderNumber, error);
            return new PaymentVerifyResult(false, null, error);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            log.LogError(ex, "Zibal verify threw for {Order}", verify.OrderNumber);
            return new PaymentVerifyResult(false, null, ex.Message);
        }
    }

    public Task<PaymentCallback?> ReadCallbackAsync(HttpRequest request, CancellationToken ct)
    {
        var q = request.Query;
        var trackId = q["trackId"].ToString();
        if (string.IsNullOrEmpty(trackId)) return Task.FromResult<PaymentCallback?>(null);

        var orderNumber = q["orderId"].ToString();
        string status;
        if (q["success"].ToString() == "1") status = "OK";
        else status = q["status"].ToString() is { Length: > 0 } s ? s : "failed";

        return Task.FromResult<PaymentCallback?>(new PaymentCallback(
            string.IsNullOrEmpty(orderNumber) ? null : orderNumber, trackId, status));
    }

    /// <summary>Toman → Rial. Zibal rejects zero, so a free order is sent as the smallest payable amount.</summary>
    private static long ToRial(long toman) => Math.Max(toman * 10, 1000);

    private sealed class ZibalResponse
    {
        [JsonPropertyName("result")] public int Result { get; set; }
        [JsonPropertyName("trackId")] public long? TrackId { get; set; }
        [JsonPropertyName("refNumber")] public long? RefNumber { get; set; }
        [JsonPropertyName("amount")] public long? Amount { get; set; }
        [JsonPropertyName("message")] public string? Message { get; set; }
    }
}
