using Microsoft.EntityFrameworkCore;
using OnShop.Api.Contracts;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Services;

/// <param name="Key">buyAgain | forYou | popular</param>
public record RecommendationSection(string Key, List<ProductListItem> Items);

/// <summary>
/// Local recommender (no external service). Signals, in order of strength:
///  1. buyAgain  - things this customer already bought (groceries repeat).
///  2. forYou    - items other customers bought together with the customer's purchases / cart / favorites,
///                 then best sellers of the same categories.
///  3. popular   - best sellers of the last 90 days (newest products when there is no sales history yet).
/// </summary>
public class RecommendationService(AppDbContext db, CatalogService catalog)
{
    private static readonly OrderStatus[] Real =
        [OrderStatus.Paid, OrderStatus.Processing, OrderStatus.Shipped, OrderStatus.Delivered];

    public async Task<List<RecommendationSection>> BuildAsync(int? userId, IEnumerable<int> seedInput, string? lang, int limit = 5)
    {
        limit = Math.Clamp(limit, 1, 20);
        var seeds = seedInput.Where(x => x > 0).Distinct().Take(50).ToHashSet();
        var sections = new List<RecommendationSection>();
        var used = new HashSet<int>();

        // 1) buy again
        if (userId is int uid)
        {
            var bought = await db.OrderItems.AsNoTracking()
                .Where(i => i.ProductId != null && i.Order.UserId == uid && Real.Contains(i.Order.Status))
                .GroupBy(i => i.ProductId!.Value)
                .Select(g => new { Id = g.Key, Orders = g.Count() })
                .OrderByDescending(x => x.Orders).Take(50).ToListAsync();

            var again = await LoadAsync(bought.Select(b => b.Id), lang, limit);
            if (again.Count > 0)
            {
                sections.Add(new RecommendationSection("buyAgain", again));
                foreach (var p in again) used.Add(p.Id);
            }
            foreach (var b in bought) seeds.Add(b.Id);
        }

        // 2) for you: bought together + same categories
        if (seeds.Count > 0)
        {
            var seedList = seeds.ToList();
            var orderIds = db.OrderItems
                .Where(i => i.ProductId != null && seedList.Contains(i.ProductId.Value) && Real.Contains(i.Order.Status))
                .Select(i => i.OrderId);

            var together = await db.OrderItems.AsNoTracking()
                .Where(i => i.ProductId != null && orderIds.Contains(i.OrderId) && !seedList.Contains(i.ProductId.Value))
                .GroupBy(i => i.ProductId!.Value)
                .Select(g => new { Id = g.Key, N = g.Count() })
                .OrderByDescending(x => x.N).Take(limit * 3).ToListAsync();

            var candidates = together.Select(x => x.Id).ToList();

            var cats = await db.Products.AsNoTracking()
                .Where(p => seedList.Contains(p.Id) && p.CategoryId != null)
                .Select(p => p.CategoryId!.Value).Distinct().ToListAsync();
            if (cats.Count > 0)
            {
                var sameCategory = await catalog.Published()
                    .Where(p => p.CategoryId != null && cats.Contains(p.CategoryId.Value) && !seedList.Contains(p.Id) && p.Stock > 0)
                    .OrderByDescending(p => db.OrderItems.Where(i => i.ProductId == p.Id).Sum(i => (int?)i.Quantity) ?? 0)
                    .ThenByDescending(p => p.Id)
                    .Select(p => p.Id).Take(limit * 3).ToListAsync();
                candidates.AddRange(sameCategory);
            }

            var forYou = await LoadAsync(candidates.Where(id => !used.Contains(id)), lang, limit);
            if (forYou.Count > 0)
            {
                sections.Add(new RecommendationSection("forYou", forYou));
                foreach (var p in forYou) used.Add(p.Id);
            }
        }

        // 3) popular (falls back to newest when nothing has been sold yet)
        var since = DateTime.UtcNow.AddDays(-90);
        var pop = await db.OrderItems.AsNoTracking()
            .Where(i => i.ProductId != null && Real.Contains(i.Order.Status) && i.Order.CreatedAt >= since)
            .GroupBy(i => i.ProductId!.Value)
            .Select(g => new { Id = g.Key, Q = g.Sum(x => x.Quantity) })
            .OrderByDescending(x => x.Q).Take(limit * 3).ToListAsync();
        var popIds = pop.Select(x => x.Id).ToList();
        if (popIds.Count < limit * 2)
        {
            var newest = await catalog.Published().Where(p => p.Stock > 0)
                .OrderByDescending(p => p.CreatedAt).Select(p => p.Id).Take(limit * 3).ToListAsync();
            popIds.AddRange(newest);
        }
        var popular = await LoadAsync(popIds.Where(id => !used.Contains(id) && !seeds.Contains(id)), lang, limit);
        if (popular.Count > 0) sections.Add(new RecommendationSection("popular", popular));

        return sections;
    }

    /// <summary>Loads published, in-stock products keeping the given order.</summary>
    private async Task<List<ProductListItem>> LoadAsync(IEnumerable<int> ids, string? lang, int limit)
    {
        var list = ids.Distinct().Take(limit * 4).ToList();
        if (list.Count == 0) return [];
        var rows = await catalog.ToListItems(
            catalog.Published().Where(p => list.Contains(p.Id) && p.Stock > 0), CatalogService.Lang(lang)).ToListAsync();
        return list.Select(id => rows.FirstOrDefault(r => r.Id == id)).Where(r => r is not null).Select(r => r!).Take(limit).ToList();
    }
}
