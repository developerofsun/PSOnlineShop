using System.Globalization;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnShop.Api.Common;
using OnShop.Api.Contracts;
using OnShop.Api.Services;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Controllers;

[ApiController, Route("api")]
public class OrdersController(
    AppDbContext db, IPaymentGateway gateway, IConfiguration config, ILogger<OrdersController> log) : ControllerBase
{
    // ---------- Checkout (guest or logged in) ----------
    [HttpPost("orders"), AllowAnonymous]
    public async Task<ActionResult<CheckoutResponse>> Checkout(CheckoutRequest req, CancellationToken ct)
    {
        if (req.Items is null || req.Items.Count == 0) return BadRequest(new { error = "سبد خرید خالی است." });
        if (req.Items.Count > 100 || req.Items.Any(i => i.Quantity is < 1 or > 100))
            return BadRequest(new { error = "تعداد اقلام نامعتبر است." });

        // Payments switched off in Admin → Settings: pause checkout. The storefront hides the cart
        // button, but this is the real guard — the API must refuse even if the page is bypassed.
        var paymentsOn = await db.Settings.Where(s => s.Key == "site.payment_enabled")
            .Select(s => s.Value).FirstOrDefaultAsync(ct);
        if (paymentsOn == "false")
            return StatusCode(503, new { error = "فروش موقتاً متوقف شده است؛ پرداخت آنلاین در دسترس نیست." });

        var c = req.Customer;
        var phone = Text.NormalizePhone(c.Phone);
        var postal = Text.Normalize(c.PostalCode).Trim();
        if (string.IsNullOrWhiteSpace(c.FullName) || string.IsNullOrWhiteSpace(c.Province)
            || string.IsNullOrWhiteSpace(c.City) || string.IsNullOrWhiteSpace(c.Address))
            return BadRequest(new { error = "اطلاعات گیرنده کامل نیست." });
        if (!Text.IsMobile(phone)) return BadRequest(new { error = "شماره موبایل نامعتبر است." });
        if (!Text.IsPostalCode(postal)) return BadRequest(new { error = "کد پستی باید ۱۰ رقم باشد." });
        if (!Text.IsValidCoordinate(c.Lat, c.Lng)) return BadRequest(new { error = "موقعیت روی نقشه نامعتبر است." });

        // Merge duplicate lines, load products from DB: the client never decides prices.
        var lines = req.Items.GroupBy(i => i.ProductId)
            .ToDictionary(g => g.Key, g => g.Sum(i => i.Quantity));
        var ids = lines.Keys.ToList();
        var products = await db.Products.Include(p => p.Translations)
            .Where(p => ids.Contains(p.Id) && p.IsPublished).ToListAsync(ct);
        if (products.Count != ids.Count) return BadRequest(new { error = "برخی محصولات دیگر موجود نیستند." });

        var order = new Order
        {
            Number = NewNumber(),
            Locale = req.Locale is not null && Languages.Supported.Contains(req.Locale) ? req.Locale : Languages.Default,
            FullName = c.FullName.Trim(), Phone = phone, Province = c.Province.Trim(), City = c.City.Trim(),
            Address = c.Address.Trim(), PostalCode = postal, Note = c.Note, Lat = c.Lat, Lng = c.Lng
        };
        if (User.Identity?.IsAuthenticated == true && int.TryParse(User.FindFirst("sub")?.Value, out var uid))
            order.UserId = uid;

        foreach (var p in products)
        {
            var qty = lines[p.Id];
            if (p.Stock < qty)
                return BadRequest(new { error = $"موجودی «{p.Translations.FirstOrDefault(t => t.Lang == Languages.Default)?.Name}» کافی نیست." });
            order.Items.Add(new OrderItem
            {
                ProductId = p.Id,
                Name = p.Translations.FirstOrDefault(t => t.Lang == Languages.Default)?.Name ?? p.Sku,
                Sku = p.Sku,
                UnitPrice = p.SalePrice ?? p.Price,
                Quantity = qty
            });
        }

        order.Subtotal = order.Items.Sum(i => i.UnitPrice * i.Quantity);
        var shipping = await db.Settings.Where(s => s.Key == "shop.shipping_cost").Select(s => s.Value).FirstOrDefaultAsync(ct);
        order.ShippingCost = long.TryParse(shipping, out var sc) && sc >= 0 ? sc : 0;
        order.Total = order.Subtotal + order.ShippingCost;

        var callback = (config["Api:PublicBaseUrl"] ?? $"{Request.Scheme}://{Request.Host}").TrimEnd('/') + "/api/payments/callback";

        // Cash on delivery: no gateway round-trip. The order stays Pending and the customer goes
        // straight to the order page, where it shows as awaiting payment on delivery.
        if (!gateway.RequiresPayment)
        {
            db.Orders.Add(order);
            await db.SaveChangesAsync(ct);
            var storefront = (config["Storefront:BaseUrl"] ?? "http://localhost:3000").TrimEnd('/');
            return new CheckoutResponse(order.Number, $"{storefront}/{order.Locale}/order/{order.Number}?status=pending");
        }

        var pay = await gateway.RequestAsync(new PaymentRequest(order.Number, order.Total, callback, phone), ct);
        if (!pay.Success || pay.RedirectUrl is null)
        {
            log.LogError("Payment request failed for {Order}: {Error}", order.Number, pay.Error);
            return StatusCode(502, new { error = "اتصال به درگاه پرداخت ناموفق بود." });
        }

        order.PaymentAuthority = pay.Authority;
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);
        return new CheckoutResponse(order.Number, pay.RedirectUrl);
    }

    // ---------- Gateway callback (GET for Zarinpal/Zibal, POSTed form for Mellat) ----------
    [HttpGet("payments/callback"), HttpPost("payments/callback"), AllowAnonymous]
    public async Task<IActionResult> Callback(CancellationToken ct)
    {
        var storefront = (config["Storefront:BaseUrl"] ?? "http://localhost:3000").TrimEnd('/');

        // Each provider returns its own parameters; the gateway normalizes them.
        var cb = await gateway.ReadCallbackAsync(Request, ct);
        if (cb is null) return BadRequest(new { error = "پاسخ درگاه پرداخت نامعتبر است." });

        // Providers that echo our order number identify the order directly; Zarinpal only returns its
        // authority, so fall back to the authority that checkout stored on the order.
        var o = cb.OrderNumber is not null
            ? await db.Orders.Include(x => x.Items).FirstOrDefaultAsync(x => x.Number == cb.OrderNumber, ct)
            : null;
        o ??= cb.Authority is not null
            ? await db.Orders.Include(x => x.Items).FirstOrDefaultAsync(x => x.PaymentAuthority == cb.Authority, ct)
            : null;
        if (o is null) return NotFound();

        string Back(bool ok) => $"{storefront}/{o.Locale}/order/{o.Number}?status={(ok ? "paid" : "failed")}";

        // A cancelled or declined payment carries no authority (Mellat sends only ResCode), but the order
        // is known, so send the customer back to it instead of to a dead end. Same for a mismatched
        // authority: we know the order, so the order page is the honest answer.
        if (cb.Authority is null) return Redirect(Back(false));

        if (o.Status != OrderStatus.Pending) return Redirect(Back(o.PaidAt != null)); // idempotent
        if (o.PaymentAuthority != cb.Authority) return Redirect(Back(false));

        var verify = await gateway.VerifyAsync(
            new PaymentVerify(o.Number, o.Total, cb.Authority, cb.Status, cb.Reference), ct);
        if (!verify.Success) return Redirect(Back(false));

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var shortage = false;
        foreach (var item in o.Items.Where(i => i.ProductId != null))
        {
            var pid = item.ProductId!.Value;
            var qty = item.Quantity;
            var affected = await db.Products.Where(p => p.Id == pid && p.Stock >= qty)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.Stock, p => p.Stock - qty), ct);
            if (affected == 0) shortage = true;
        }

        o.Status = OrderStatus.Paid;
        o.PaidAt = DateTime.UtcNow;
        o.PaymentRef = verify.RefId;
        if (shortage)
            o.Note = (o.Note is null ? "" : o.Note + "\n") + "⚠ موجودی پس از پرداخت کافی نبود؛ نیاز به بررسی دستی.";
        o.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Redirect(Back(true));
    }

    // ---------- POST-redirect start page (Mellat posts RefId to the bank) ----------
    [HttpGet("payments/start/{order}"), AllowAnonymous]
    public async Task<IActionResult> Start(string order, CancellationToken ct)
    {
        var o = await db.Orders.AsNoTracking().FirstOrDefaultAsync(x => x.Number == order, ct);
        if (o?.PaymentAuthority is null) return NotFound();

        var html = gateway.BuildRedirectPage(o.PaymentAuthority);
        if (html is null) return NotFound();
        return Content(html, "text/html; charset=utf-8");
    }

    // ---------- Guest order lookup (order number + phone) ----------
    [HttpGet("orders/{number}"), AllowAnonymous]
    public async Task<ActionResult<OrderDetailDto>> Lookup(string number, [FromQuery] string? phone)
    {
        var o = await db.Orders.AsNoTracking().Include(x => x.Items).FirstOrDefaultAsync(x => x.Number == number);
        if (o is null) return NotFound();
        // Order numbers are guessable-ish, so require the phone used at checkout.
        if (Text.NormalizePhone(phone) != o.Phone) return NotFound();
        return AdminOrdersController.ToDetail(o);
    }

    private static string NewNumber()
    {
        var rnd = RandomNumberGenerator.GetInt32(0, 1_000_000);
        return "OS" + DateTime.UtcNow.ToString("yyMMdd", CultureInfo.InvariantCulture) + rnd.ToString("D6", CultureInfo.InvariantCulture);
    }
}
