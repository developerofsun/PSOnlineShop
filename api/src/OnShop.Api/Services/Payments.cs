namespace OnShop.Api.Services;

public record PaymentRequest(string OrderNumber, long Amount, string CallbackUrl, string? Phone);
public record PaymentRequestResult(bool Success, string? Authority, string? RedirectUrl, string? Error);
public record PaymentVerify(string OrderNumber, long Amount, string Authority, string? Status);
public record PaymentVerifyResult(bool Success, string? RefId, string? Error);

/// <summary>
/// Abstraction over a payment provider. Implement one class per gateway (Zarinpal, IDPay, ...)
/// and register it in Program.cs based on Payment:Gateway.
/// </summary>
public interface IPaymentGateway
{
    string Name { get; }
    Task<PaymentRequestResult> RequestAsync(PaymentRequest request, CancellationToken ct);
    Task<PaymentVerifyResult> VerifyAsync(PaymentVerify verify, CancellationToken ct);
}

/// <summary>Local development gateway: no network calls. Refused in Production (see Program.cs).</summary>
public class FakePaymentGateway : IPaymentGateway
{
    public string Name => "Fake";

    public Task<PaymentRequestResult> RequestAsync(PaymentRequest r, CancellationToken ct)
    {
        var authority = "FAKE-" + r.OrderNumber;
        var url = $"{r.CallbackUrl}?order={Uri.EscapeDataString(r.OrderNumber)}&authority={authority}&status=OK";
        return Task.FromResult(new PaymentRequestResult(true, authority, url, null));
    }

    public Task<PaymentVerifyResult> VerifyAsync(PaymentVerify v, CancellationToken ct)
    {
        var ok = v.Status == "OK" && v.Authority == "FAKE-" + v.OrderNumber;
        return Task.FromResult(ok
            ? new PaymentVerifyResult(true, "FAKE-REF-" + v.OrderNumber, null)
            : new PaymentVerifyResult(false, null, "Payment was not completed."));
    }
}
