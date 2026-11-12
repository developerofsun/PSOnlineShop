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

    /// <summary>
    /// False for gateways that take no money online (cash on delivery): checkout then creates the order
    /// as Pending and sends the customer straight to the order page instead of a payment provider.
    /// </summary>
    bool RequiresPayment { get; }

    Task<PaymentRequestResult> RequestAsync(PaymentRequest request, CancellationToken ct);
    Task<PaymentVerifyResult> VerifyAsync(PaymentVerify verify, CancellationToken ct);
}

/// <summary>Local development gateway: no network calls. Refused in Production (see Program.cs).</summary>
public class FakePaymentGateway : IPaymentGateway
{
    public string Name => "Fake";
    public bool RequiresPayment => true;

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

/// <summary>
/// Cash on delivery: no online payment. Checkout leaves the order Pending and the customer pays when
/// the goods arrive; an admin marks it Paid after the courier collects the money.
/// This is a legitimate production option, so it is not blocked when ASPNETCORE_ENVIRONMENT=Production.
/// </summary>
public class OfflinePaymentGateway : IPaymentGateway
{
    public string Name => "Offline";
    public bool RequiresPayment => false;

    public Task<PaymentRequestResult> RequestAsync(PaymentRequest request, CancellationToken ct) =>
        Task.FromResult(new PaymentRequestResult(true, null, null, null));

    public Task<PaymentVerifyResult> VerifyAsync(PaymentVerify verify, CancellationToken ct) =>
        Task.FromResult(new PaymentVerifyResult(false, null, "Offline gateway never verifies payments online."));
}
