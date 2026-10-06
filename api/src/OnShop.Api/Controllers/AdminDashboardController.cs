using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnShop.Api.Contracts;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Controllers;

[ApiController, Route("api/admin/dashboard"), Authorize(Policy = Permissions.DashboardView)]
public class AdminDashboardController(AppDbContext db) : ControllerBase
{
    private static readonly OrderStatus[] Revenue =
        [OrderStatus.Paid, OrderStatus.Processing, OrderStatus.Shipped, OrderStatus.Delivered];

    [HttpGet]
    public async Task<DashboardDto> Get()
    {
        var today = DateTime.UtcNow.Date;
        var from14 = today.AddDays(-13);
        var from30 = today.AddDays(-29);
        var def = Languages.Default;

        var threshold = int.TryParse(
            await db.Settings.Where(s => s.Key == "shop.low_stock_threshold").Select(s => s.Value).FirstOrDefaultAsync(),
            out var t) ? t : 5;

        var productsCount = await db.Products.CountAsync();
        var ordersToday = await db.Orders.CountAsync(o => o.CreatedAt >= today);
        var pending = await db.Orders.CountAsync(o => o.Status == OrderStatus.Paid || o.Status == OrderStatus.Processing);
        var revenue30 = await db.Orders.Where(o => Revenue.Contains(o.Status) && o.PaidAt >= from30).SumAsync(o => (long?)o.Total) ?? 0;
        var customers = await db.UserRoles.CountAsync(ur => db.Roles.Any(r => r.Id == ur.RoleId && r.Name == Roles.Customer));

        var paidRows = await db.Orders.AsNoTracking()
            .Where(o => Revenue.Contains(o.Status) && o.PaidAt >= from14)
            .Select(o => new { o.PaidAt, o.Total }).ToListAsync();
        var byDay = paidRows.GroupBy(r => r.PaidAt!.Value.Date).ToDictionary(g => g.Key, g => g.ToList());
        var days = Enumerable.Range(0, 14).Select(i =>
        {
            var d = from14.AddDays(i);
            byDay.TryGetValue(d, out var rows);
            return new DayPoint(d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                rows?.Sum(r => r.Total) ?? 0, rows?.Count ?? 0);
        }).ToList();

        var low = await db.Products.AsNoTracking().Where(p => p.Stock <= threshold)
            .OrderBy(p => p.Stock).Take(8)
            .Select(p => new LowStockItem(p.Id, p.Sku,
                p.Translations.Where(x => x.Lang == def).Select(x => x.Name).FirstOrDefault(), p.Stock))
            .ToListAsync();

        var recent = await db.Orders.AsNoTracking().OrderByDescending(o => o.Id).Take(8)
            .Select(o => new OrderListItem(o.Id, o.Number, o.Status, o.Total, o.FullName, o.Phone, o.CreatedAt, o.PaidAt))
            .ToListAsync();

        return new DashboardDto(productsCount, ordersToday, pending, revenue30, customers, days, low, recent);
    }
}
