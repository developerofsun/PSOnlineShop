using System.Globalization;
using System.Net;
using System.Text;
using System.Xml;
using System.Xml.Linq;

namespace OnShop.Api.Services;

/// <summary>
/// Behpardakht Mellat (درگاه به‌پرداخت ملت) payment gateway — the bank's SOAP service.
/// Docs: Behpardakht Mellat PGW user guide (bpPayRequest / bpVerifyRequest / bpSettleRequest).
///
/// Amounts in this shop are stored in Toman; the bank expects Rial, so every amount is multiplied by 10.
/// Configure with:
///   Payment:Gateway = "BehpardakhtMellat"   (aliases: "Mellat", "Behpardakht")
///   Payment:Mellat:TerminalId   = "1234567"
///   Payment:Mellat:UserName     = "your-terminal-user"
///   Payment:Mellat:UserPassword = "your-terminal-password"
///   Payment:Mellat:ServiceUrl   = "https://bpm.shaparak.ir/pgwchannel/services/pgw"   (optional)
///   Payment:Mellat:StartPayUrl  = "https://bpm.shaparak.ir/pgwchannel/startpay.mellat" (optional)
///
/// The bank only accepts a numeric order id, and the browser must POST RefId to startpay.mellat,
/// so checkout redirects to our own auto-submit page (/api/payments/start/{order}).
/// </summary>
public class MellatPaymentGateway(HttpClient http, IConfiguration config, ILogger<MellatPaymentGateway> log)
    : IPaymentGateway
{
    private const string InterfaceNamespace = "http://interfaces.core.sw.bps.com/";
    private const string CallbackPath = "/api/payments/callback";

    public string Name => "BehpardakhtMellat";
    public bool RequiresPayment => true;

    private string TerminalId => Required("Payment:Mellat:TerminalId");
    private string UserName => Required("Payment:Mellat:UserName");
    private string UserPassword => Required("Payment:Mellat:UserPassword");

    private string ServiceUrl => ValueOrDefault(
        "Payment:Mellat:ServiceUrl", "https://bpm.shaparak.ir/pgwchannel/services/pgw");
    private string StartPayUrl => ValueOrDefault(
        "Payment:Mellat:StartPayUrl", "https://bpm.shaparak.ir/pgwchannel/startpay.mellat");

    public async Task<PaymentRequestResult> RequestAsync(PaymentRequest request, CancellationToken ct)
    {
        // The bank's localDate/localTime are Tehran time (Iran has had no DST since 2022).
        var now = DateTime.UtcNow.AddHours(3.5);
        var code = OrderCode(request.OrderNumber).ToString(CultureInfo.InvariantCulture);

        var args = new (string Name, string Value)[]
        {
            ("terminalId", TerminalId),
            ("userName", UserName),
            ("userPassword", UserPassword),
            ("orderId", code),
            ("amount", ToRial(request.Amount).ToString(CultureInfo.InvariantCulture)),
            ("localDate", now.ToString("yyyyMMdd", CultureInfo.InvariantCulture)),
            ("localTime", now.ToString("HHmmss", CultureInfo.InvariantCulture)),
            ("additionalData", $"سفارش {request.OrderNumber}"),
            ("callBackUrl", request.CallbackUrl),
            ("payerId", "0")
        };

        var result = await CallAsync("bpPayRequest", args, ct);
        if (result.Code != "0" || string.IsNullOrWhiteSpace(result.ReferenceId))
        {
            var error = result.Error ?? $"Behpardakht Mellat rejected the request (code {result.Code}).";
            log.LogWarning("Mellat bpPayRequest failed for {Order}: {Error}", request.OrderNumber, error);
            return new PaymentRequestResult(false, null, null, error);
        }

        // RefId is stored as the order's payment authority; the start page posts it to the bank.
        return new PaymentRequestResult(
            true, result.ReferenceId, $"{ApiBase(request.CallbackUrl)}/api/payments/start/{request.OrderNumber}", null);
    }

    public async Task<PaymentVerifyResult> VerifyAsync(PaymentVerify verify, CancellationToken ct)
    {
        if (!string.Equals(verify.Status, "OK", StringComparison.OrdinalIgnoreCase))
            return new PaymentVerifyResult(false, null, "Payment was cancelled or failed at the gateway.");
        if (string.IsNullOrWhiteSpace(verify.Reference))
            return new PaymentVerifyResult(false, null, "The bank did not return a sale reference id.");

        var code = OrderCode(verify.OrderNumber).ToString(CultureInfo.InvariantCulture);
        var args = new (string Name, string Value)[]
        {
            ("terminalId", TerminalId),
            ("userName", UserName),
            ("userPassword", UserPassword),
            ("orderId", code),
            ("saleOrderId", code),
            ("saleReferenceId", verify.Reference)
        };

        var verified = await CallAsync("bpVerifyRequest", args, ct);
        // 0 = verified now, 43 = already verified (a retried callback): both mean the money is in.
        if (verified.Code is not ("0" or "43"))
        {
            var error = verified.Error ?? $"The bank could not verify the payment (code {verified.Code}).";
            log.LogWarning("Mellat bpVerifyRequest failed for {Order}: {Error}", verify.OrderNumber, error);
            return new PaymentVerifyResult(false, null, error);
        }

        // Settlement moves the money into the merchant account; without it the bank reverses the
        // payment after a while. 0 = settled now, 45 = already settled.
        var settled = await CallAsync("bpSettleRequest", args, ct);
        if (settled.Code is not ("0" or "45"))
            log.LogError("Mellat bpSettleRequest failed for {Order}: code {Code} {Error}",
                verify.OrderNumber, settled.Code, settled.Error);

        return new PaymentVerifyResult(true, verify.Reference, null);
    }

    public async Task<PaymentCallback?> ReadCallbackAsync(HttpRequest request, CancellationToken ct)
    {
        // The bank returns the customer with a POSTed form, but accept the query string as well so a
        // manually retried callback URL still works.
        IFormCollection? form = null;
        if (request.HasFormContentType) form = await request.ReadFormAsync(ct);

        string? Get(string key)
        {
            var value = form?[key].ToString();
            if (!string.IsNullOrEmpty(value)) return value;
            value = request.Query[key].ToString();
            return string.IsNullOrEmpty(value) ? null : value;
        }

        if (!long.TryParse(Get("SaleOrderId"), NumberStyles.Integer, CultureInfo.InvariantCulture, out var code))
            return null;

        var resCode = Get("ResCode") ?? "";
        return new PaymentCallback(
            OrderNumberFromCode(code),
            Get("RefId"),
            resCode == "0" ? "OK" : resCode,
            Get("SaleReferenceId"));
    }

    public string? BuildRedirectPage(string authority)
    {
        var action = WebUtility.HtmlEncode(StartPayUrl);
        var refId = WebUtility.HtmlEncode(authority);
        return $$"""
            <!DOCTYPE html>
            <html lang="fa" dir="rtl">
            <head><meta charset="utf-8"><title>در حال انتقال به درگاه پرداخت…</title></head>
            <body onload="document.forms[0].submit()">
            <form method="post" action="{{ action }}">
            <input type="hidden" name="RefId" value="{{ refId }}" />
            <noscript><button type="submit">ادامه پرداخت</button></noscript>
            </form>
            </body>
            </html>
            """;
    }

    // ---------- SOAP plumbing ----------

    private sealed record SoapResult(string Code, string? ReferenceId, string? Error);

    private async Task<SoapResult> CallAsync(
        string operation, (string Name, string Value)[] args, CancellationToken ct)
    {
        try
        {
            using var content = new StringContent(BuildEnvelope(operation, args), Encoding.UTF8, "text/xml");
            using var message = new HttpRequestMessage(HttpMethod.Post, ServiceUrl) { Content = content };
            message.Headers.TryAddWithoutValidation("SOAPAction", "\"\"");

            using var response = await http.SendAsync(message, ct);
            var xml = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
                return new SoapResult("", null, $"The bank returned HTTP {(int)response.StatusCode}.");

            var doc = XDocument.Parse(xml);
            var fault = doc.Descendants().FirstOrDefault(e => e.Name.LocalName == "Fault");
            if (fault is not null)
                return new SoapResult("", null, fault.Value.Trim());

            var value = doc.Descendants().FirstOrDefault(e => e.Name.LocalName == "return")?.Value;
            if (value is null)
                return new SoapResult("", null, "Unexpected response from the bank.");

            // bpPayRequest answers "0,<RefId>"; bpVerifyRequest/bpSettleRequest answer a bare code.
            var parts = value.Split(',', 2);
            return new SoapResult(
                parts[0].Trim(),
                parts.Length > 1 && parts[1].Trim().Length > 0 ? parts[1].Trim() : null,
                null);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or XmlException)
        {
            log.LogError(ex, "Mellat SOAP call {Operation} threw", operation);
            return new SoapResult("", null, ex.Message);
        }
    }

    private static string BuildEnvelope(string operation, (string Name, string Value)[] args)
    {
        XNamespace soap = "http://schemas.xmlsoap.org/soap/envelope/";
        XNamespace intf = InterfaceNamespace;

        var doc = new XDocument(
            new XElement(soap + "Envelope",
                new XAttribute(XNamespace.Xmlns + "soapenv", soap.NamespaceName),
                new XAttribute(XNamespace.Xmlns + "intf", intf.NamespaceName),
                new XElement(soap + "Body",
                    new XElement(intf + operation,
                        args.Select(a => new XElement(intf + a.Name, a.Value))))));

        return "<?xml version=\"1.0\" encoding=\"utf-8\"?>" + doc.ToString(SaveOptions.DisableFormatting);
    }

    // ---------- helpers ----------

    /// <summary>
    /// The bank needs numeric order ids. Order numbers are "OS" + yyMMdd + 6 random digits, so their
    /// 12 digits form a unique long that maps back exactly.
    /// </summary>
    private static long OrderCode(string orderNumber)
    {
        var digits = new string(orderNumber.Where(char.IsAsciiDigit).ToArray());
        if (!long.TryParse(digits, NumberStyles.None, CultureInfo.InvariantCulture, out var code))
            throw new InvalidOperationException(
                $"Order number '{orderNumber}' cannot be mapped to a numeric Mellat order id.");
        return code;
    }

    private static string OrderNumberFromCode(long code) =>
        "OS" + code.ToString("D12", CultureInfo.InvariantCulture);

    /// <summary>Toman → Rial. The bank rejects zero, so a free order is sent as the smallest payable amount.</summary>
    private static long ToRial(long toman) => Math.Max(toman * 10, 1000);

    /// <summary>The API's own public origin, needed for the POST-redirect page.</summary>
    private string ApiBase(string callbackUrl)
    {
        var configured = config["Api:PublicBaseUrl"];
        if (!string.IsNullOrWhiteSpace(configured)) return configured.TrimEnd('/');

        return callbackUrl.EndsWith(CallbackPath, StringComparison.OrdinalIgnoreCase)
            ? callbackUrl[..^CallbackPath.Length].TrimEnd('/')
            : callbackUrl.TrimEnd('/');
    }

    private string Required(string key) => ValueOrDefault(key, "");

    private string ValueOrDefault(string key, string fallback) =>
        config[key] is { Length: > 0 } value ? value : fallback;
}
