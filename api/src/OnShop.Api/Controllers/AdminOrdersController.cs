using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnShop.Api.Common;
using OnShop.Api.Contracts;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Controllers;

[ApiController, Route("api/admin/orders"), Authorize(Policy = Permissions.OrdersManage)]
public class AdminOrdersController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<PagedResult<OrderListItem>> List(
        [FromQuery] OrderStatus? status, [FromQuery] string? q,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var (p, size) = Paging.Clamp(page, pageSize);
        var query = db.Orders.AsNoTracking().AsQueryable();
        if (status is not null) query = query.Where(o => o.Status == status);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var pattern = $"%{Text.Normalize(q).Trim()}%";
            query = query.Where(o => EF.Functions.ILike(o.Number, pattern)
                                     || EF.Functions.ILike(o.Phone, pattern)
                                     || EF.Functions.ILike(o.FullName, pattern));
        }
        var total = await query.CountAsync();
        var items = await query.OrderByDescending(o => o.Id).Skip((p - 1) * size).Take(size)
            .Select(o => new OrderListItem(o.Id, o.Number, o.Status, o.Total, o.FullName, o.Phone, o.CreatedAt, o.PaidAt))
            .ToListAsync();
        return new PagedResult<OrderListItem>(items, total, p, size);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<OrderDetailDto>> Get(int id)
    {
        var o = await db.Orders.AsNoTracking().Include(x => x.Items).FirstOrDefaultAsync(x => x.Id == id);
        return o is null ? NotFound() : ToDetail(o);
    }

    [HttpPut("{id:int}/status")]
    public async Task<ActionResult<OrderDetailDto>> SetStatus(int id, UpdateOrderStatus req)
    {
        var o = await db.Orders.Include(x => x.Items).FirstOrDefaultAsync(x => x.Id == id);
        if (o is null) return NotFound();
        if (o.Status == OrderStatus.Pending && req.Status is not (OrderStatus.Pending or OrderStatus.Cancelled))
            return BadRequest(new { error = "سفارش پرداخت‌نشده فقط قابل لغو است." });

        o.Status = req.Status;
        o.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return ToDetail(o);
    }

    public static OrderDetailDto ToDetail(Order o) => new(
        o.Id, o.Number, o.Status, o.Subtotal, o.ShippingCost, o.Total,
        o.FullName, o.Phone, o.Province, o.City, o.Address, o.PostalCode, o.Note,
        o.PaymentRef, o.CreatedAt, o.PaidAt,
        o.Items.Select(i => new OrderItemDto(i.ProductId, i.Name, i.Sku, i.UnitPrice, i.Quantity)).ToList(),
        o.Lat, o.Lng);
}
