namespace OnShop.Api.Services;

public record PaymentRequest(string OrderNumber, long Amount, string CallbackUrl, string? Phone);
public record PaymentRequestResult(bool Success, string? Authority, string? RedirectUrl, string? Error);
public record PaymentVerify(
    string OrderNumber, long Amount, string Authority, string? Status, string? Reference = null);
public record PaymentVerifyResult(bool Success, string? RefId, string? Error);

/// <summary>
/// What a provider sent back, normalized. OrderNumber is null when the provider does not echo it
/// (Zarinpal), in which case the caller finds the order by Authority. Reference carries a
/// provider-specific identifier that VerifyAsync needs (Mellat's SaleReferenceId).
/// </summary>
public record PaymentCallback(string? OrderNumber, string? Authority, string? Status, string? Reference = null);

/// <summary>
/// Abstraction over a payment provider. Implement one class per gateway (Zarinpal, Zibal, Mellat, ...)
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

    /// <summary>
    /// Reads the provider's return request (query string, or a posted form for Mellat) into the common
    /// shape. Returning null means "this request is not a payment callback" (the endpoint answers 400).
    /// The default reads ?order=&amp;authority=&amp;status=, which is what Zarinpal and the Fake gateway use.
    /// </summary>
    Task<PaymentCallback?> ReadCallbackAsync(HttpRequest request, CancellationToken ct)
    {
        var authority = request.Query["authority"].ToString();
        if (string.IsNullOrEmpty(authority)) return Task.FromResult<PaymentCallback?>(null);

        var order = request.Query["order"].ToString();
        var status = request.Query["status"].ToString();
        return Task.FromResult<PaymentCallback?>(new PaymentCallback(
            string.IsNullOrEmpty(order) ? null : order,
            authority,
            string.IsNullOrEmpty(status) ? null : status));
    }

    /// <summary>
    /// HTML page that forwards the browser to the provider with a POST. Null when the provider accepts
    /// a plain GET redirect; Mellat needs this (its startpay page only reads a posted RefId).
    /// </summary>
    string? BuildRedirectPage(string authority) => null;
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
