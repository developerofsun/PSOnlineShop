using Microsoft.EntityFrameworkCore;
using OnShop.Api.Common;
using OnShop.Api.Contracts;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Services;

public record ProductFilter(string? Q, string[] Categories, long? MinPrice, long? MaxPrice, bool InStock, bool OnSale);

/// <summary>Product queries shared by the catalog API and the page-block resolver.</summary>
public class CatalogService(AppDbContext db, ILogger<CatalogService> log)
{
    private const double FuzzyThreshold = 0.45;

    public static string Lang(string? l) => l is not null && Languages.Supported.Contains(l) ? l : Languages.Default;

    public static ProductFilter FilterFrom(ProductQuery q) =>
        new(q.Q, ParseList(q.Categories), q.MinPrice, q.MaxPrice, q.InStock, q.OnSale);

    private static string[] ParseList(string? csv) =>
        string.IsNullOrWhiteSpace(csv)
            ? []
            : csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Take(20).ToArray();

    public IQueryable<Product> Published() => db.Products.AsNoTracking().Where(p => p.IsPublished);

    // ---------------- categories ----------------

    /// <summary>Category slugs (any language) to ids, including all descendants. Null = no category filter.</summary>
    public async Task<List<int>?> CategoryIdsAsync(string[] slugs)
    {
        if (slugs.Length == 0) return null;
        var cats = await db.Categories.AsNoTracking()
            .Select(c => new { c.Id, c.ParentId, Slugs = c.Translations.Select(t => t.Slug).ToList() })
            .ToListAsync();

        var result = cats.Where(c => c.Slugs.Any(s => slugs.Contains(s))).Select(c => c.Id).ToHashSet();
        bool grew;
        do
        {
            grew = false;
            foreach (var c in cats)
                if (c.ParentId is int parent && result.Contains(parent) && result.Add(c.Id)) grew = true;
        } while (grew);
        return result.ToList();
    }

    /// <summary>A category id plus the ids of all its descendants.</summary>
    public async Task<List<int>> DescendantIdsAsync(int categoryId)
    {
        var cats = await db.Categories.AsNoTracking().Select(c => new { c.Id, c.ParentId }).ToListAsync();
        var result = new HashSet<int> { categoryId };
        bool grew;
        do
        {
            grew = false;
            foreach (var c in cats)
                if (c.ParentId is int parent && result.Contains(parent) && result.Add(c.Id)) grew = true;
        } while (grew);
        return result.ToList();
    }

    public async Task<List<CategoryItem>> CategoriesAsync(string? langRaw, bool topLevelOnly = false)
    {
        var lang = Lang(langRaw);
        var def = Languages.Default;
        var q = db.Categories.AsNoTracking().Where(c => c.IsActive);
        if (topLevelOnly) q = q.Where(c => c.ParentId == null);
        return await q.OrderBy(c => c.SortOrder).ThenBy(c => c.Id)
            .Select(c => new CategoryItem(
                c.Id, c.ParentId,
                c.Translations.Where(t => t.Lang == lang).Select(t => t.Name).FirstOrDefault()
                    ?? c.Translations.Where(t => t.Lang == def).Select(t => t.Name).FirstOrDefault(),
                c.Translations.Where(t => t.Lang == lang).Select(t => t.Slug).FirstOrDefault()
                    ?? c.Translations.Where(t => t.Lang == def).Select(t => t.Slug).FirstOrDefault(),
                c.Products.Count(p => p.IsPublished),
                c.ImageUrl))
            .ToListAsync();
    }

    // ---------------- filtering / sorting ----------------

    public IQueryable<Product> Apply(
        IQueryable<Product> q, ProductFilter f, List<int>? categoryIds,
        bool skipCategory = false, bool skipPrice = false)
    {
        // Every search word must match somewhere (name/description/sku or category name).
        foreach (var token in Normalizer.Tokens(f.Q))
        {
            var pattern = $"%{Text.EscapeLike(token)}%";
            q = q.Where(p =>
                p.Translations.Any(t => EF.Functions.ILike(t.SearchText, pattern))
                || EF.Functions.ILike(p.Sku, pattern)
                || (p.Category != null && p.Category.Translations.Any(ct => EF.Functions.ILike(ct.Name, pattern))));
        }

        if (!skipCategory && categoryIds is not null)
            q = q.Where(p => p.CategoryId != null && categoryIds.Contains(p.CategoryId.Value));

        if (!skipPrice)
        {
            if (f.MinPrice is long min) q = q.Where(p => (p.SalePrice ?? p.Price) >= min);
            if (f.MaxPrice is long max) q = q.Where(p => (p.SalePrice ?? p.Price) <= max);
        }

        if (f.InStock) q = q.Where(p => p.Stock > 0);
        if (f.OnSale) q = q.Where(p => p.SalePrice != null && p.SalePrice < p.Price);
        return q;
    }

    public IQueryable<Product> Sort(IQueryable<Product> q, string? sort, string? search)
    {
        var tokens = Normalizer.Tokens(search);
        if (string.IsNullOrEmpty(sort)) sort = tokens.Count > 0 ? "relevance" : "newest";

        switch (sort)
        {
            case "price_asc":
                return q.OrderBy(p => p.SalePrice ?? p.Price).ThenByDescending(p => p.Id);
            case "price_desc":
                return q.OrderByDescending(p => p.SalePrice ?? p.Price).ThenByDescending(p => p.Id);
            case "discount":
                return q.OrderByDescending(p =>
                        p.SalePrice != null && p.SalePrice < p.Price ? (p.Price - p.SalePrice.Value) * 100 / p.Price : 0L)
                    .ThenByDescending(p => p.Id);
            case "relevance" when tokens.Count > 0:
                var full = string.Join(' ', tokens);
                var prefix = Text.EscapeLike(tokens[0]) + "%";
                return q.OrderBy(p =>
                        p.Translations.Any(t => t.SearchText == full) ? 0
                        : p.Translations.Any(t => EF.Functions.ILike(t.SearchText, prefix)) ? 1 : 2)
                    .ThenByDescending(p => p.Id);
            default:
                return q.OrderByDescending(p => p.CreatedAt).ThenByDescending(p => p.Id);
        }
    }

    /// <summary>Typo-tolerant match (pg_trgm), best match first. Only call when SearchCapabilities.Trigram.</summary>
    private static IQueryable<Product> FuzzyOrdered(IQueryable<Product> q, string search) =>
        q.Where(p => p.Translations.Any(t => EF.Functions.TrigramsWordSimilarity(search, t.SearchText) > FuzzyThreshold))
         .OrderByDescending(p => p.Translations.Max(t => EF.Functions.TrigramsWordSimilarity(search, t.SearchText)));

    public IQueryable<ProductListItem> ToListItems(IQueryable<Product> q, string lang)
    {
        var def = Languages.Default;
        return q.Select(p => new ProductListItem(
            p.Id, p.Sku, p.Price, p.SalePrice, p.Stock,
            p.Translations.Where(t => t.Lang == lang).Select(t => t.Name).FirstOrDefault()
                ?? p.Translations.Where(t => t.Lang == def).Select(t => t.Name).FirstOrDefault(),
            p.Translations.Where(t => t.Lang == lang).Select(t => t.Slug).FirstOrDefault()
                ?? p.Translations.Where(t => t.Lang == def).Select(t => t.Slug).FirstOrDefault(),
            p.Images.OrderBy(i => i.SortOrder).Select(i => i.Url).FirstOrDefault()));
    }

    // ---------------- search / list ----------------

    public async Task<ProductsResult> SearchAsync(ProductQuery q, int maxPageSize = 60)
    {
        var lang = Lang(q.Lang);
        var (page, size) = Paging.Clamp(q.Page, q.PageSize, maxPageSize);
        var f = FilterFrom(q);
        var ids = await CategoryIdsAsync(f.Categories);

        var query = Apply(Published(), f, ids);
        var total = await query.CountAsync();
        var fuzzy = false;
        IQueryable<Product> ordered;

        var search = Normalizer.ForSearch(f.Q);
        if (total == 0 && search.Length >= 3 && SearchCapabilities.Trigram)
        {
            try
            {
                var fq = FuzzyOrdered(Apply(Published(), f with { Q = null }, ids), search);
                var fuzzyTotal = await fq.CountAsync();
                if (fuzzyTotal > 0) { total = fuzzyTotal; fuzzy = true; }
                ordered = fq;
            }
            catch (Exception ex)
            {
                log.LogWarning(ex, "Fuzzy search failed; falling back to exact search.");
                ordered = Sort(query, q.Sort, f.Q);
            }
        }
        else
        {
            ordered = Sort(query, q.Sort, f.Q);
        }

        var items = await ToListItems(ordered.Skip((page - 1) * size).Take(size), lang).ToListAsync();
        return new ProductsResult(items, total, page, size, fuzzy);
    }

    // ---------------- facets (progressive filters) ----------------

    public async Task<Facets> FacetsAsync(ProductQuery q)
    {
        var lang = Lang(q.Lang);
        var def = Languages.Default;
        var f = FilterFrom(q);
        var ids = await CategoryIdsAsync(f.Categories);

        // Category counts: every filter EXCEPT the category filter, so siblings stay visible with correct counts.
        var counts = await Apply(Published(), f, ids, skipCategory: true)
            .Where(p => p.CategoryId != null)
            .GroupBy(p => p.CategoryId!.Value)
            .Select(g => new { Id = g.Key, Count = g.Count() })
            .ToListAsync();
        var own = counts.ToDictionary(x => x.Id, x => x.Count);

        var cats = await db.Categories.AsNoTracking().Where(c => c.IsActive)
            .OrderBy(c => c.SortOrder).ThenBy(c => c.Id)
            .Select(c => new
            {
                c.Id,
                c.ParentId,
                Name = c.Translations.Where(t => t.Lang == lang).Select(t => t.Name).FirstOrDefault()
                       ?? c.Translations.Where(t => t.Lang == def).Select(t => t.Name).FirstOrDefault(),
                Slug = c.Translations.Where(t => t.Lang == lang).Select(t => t.Slug).FirstOrDefault()
                       ?? c.Translations.Where(t => t.Lang == def).Select(t => t.Slug).FirstOrDefault()
            })
            .ToListAsync();

        int Rolled(int id, int depth = 0) =>
            own.GetValueOrDefault(id) + (depth > 8 ? 0 : cats.Where(c => c.ParentId == id).Sum(c => Rolled(c.Id, depth + 1)));

        var facetCats = cats.Select(c => new FacetCategory(c.Id, c.ParentId, c.Name, c.Slug, Rolled(c.Id))).ToList();

        // Price range: every filter except price.
        var forPrice = Apply(Published(), f, ids, skipPrice: true);
        var min = await forPrice.MinAsync(p => (long?)(p.SalePrice ?? p.Price)) ?? 0;
        var max = await forPrice.MaxAsync(p => (long?)(p.SalePrice ?? p.Price)) ?? 0;

        // Toggle counts: what would you get by switching each toggle on.
        var forToggles = Apply(Published(), f with { InStock = false, OnSale = false }, ids);
        var inStock = await forToggles.CountAsync(p => p.Stock > 0);
        var onSale = await forToggles.CountAsync(p => p.SalePrice != null && p.SalePrice < p.Price);

        var total = await Apply(Published(), f, ids).CountAsync();
        return new Facets(facetCats, min, max, inStock, onSale, total);
    }

    // ---------------- suggestions (search-as-you-type) ----------------

    public async Task<SuggestResult> SuggestAsync(string? q, string? langRaw)
    {
        var lang = Lang(langRaw);
        var def = Languages.Default;
        var search = Normalizer.ForSearch(q);
        if (search.Length < 2) return new SuggestResult([], []);

        var query = Apply(Published(), new ProductFilter(q, [], null, null, false, false), null);
        var items = await ToListItems(Sort(query, "relevance", q).Take(6), lang).ToListAsync();

        if (items.Count == 0 && search.Length >= 3 && SearchCapabilities.Trigram)
        {
            try
            {
                items = await ToListItems(FuzzyOrdered(Published(), search).Take(6), lang).ToListAsync();
            }
            catch (Exception ex)
            {
                log.LogWarning(ex, "Fuzzy suggest failed.");
            }
        }

        var catQuery = db.Categories.AsNoTracking().Where(c => c.IsActive);
        foreach (var token in Normalizer.Tokens(q, 4))
        {
            var pattern = $"%{Text.EscapeLike(token)}%";
            catQuery = catQuery.Where(c => c.Translations.Any(t => EF.Functions.ILike(t.Name, pattern)));
        }
        var cats = await catQuery.Take(4)
            .Select(c => new CategoryRef(
                c.Id,
                c.Translations.Where(t => t.Lang == lang).Select(t => t.Name).FirstOrDefault()
                    ?? c.Translations.Where(t => t.Lang == def).Select(t => t.Name).FirstOrDefault(),
                c.Translations.Where(t => t.Lang == lang).Select(t => t.Slug).FirstOrDefault()
                    ?? c.Translations.Where(t => t.Lang == def).Select(t => t.Slug).FirstOrDefault()))
            .ToListAsync();

        return new SuggestResult(items, cats);
    }

    // ---------------- by ids (compare / favorites) ----------------

    public async Task<List<ProductCompareItem>> ByIdsAsync(IEnumerable<int> ids, string? langRaw)
    {
        var lang = Lang(langRaw);
        var def = Languages.Default;
        var list = ids.Distinct().Take(24).ToList();

        var rows = await Published().Where(p => list.Contains(p.Id))
            .Select(p => new ProductCompareItem(
                p.Id, p.Sku, p.Price, p.SalePrice, p.Stock,
                p.Translations.Where(t => t.Lang == lang).Select(t => t.Name).FirstOrDefault()
                    ?? p.Translations.Where(t => t.Lang == def).Select(t => t.Name).FirstOrDefault(),
                p.Translations.Where(t => t.Lang == lang).Select(t => t.Slug).FirstOrDefault()
                    ?? p.Translations.Where(t => t.Lang == def).Select(t => t.Slug).FirstOrDefault(),
                p.Images.OrderBy(i => i.SortOrder).Select(i => i.Url).FirstOrDefault(),
                p.Category == null ? null
                    : (p.Category.Translations.Where(t => t.Lang == lang).Select(t => t.Name).FirstOrDefault()
                       ?? p.Category.Translations.Where(t => t.Lang == def).Select(t => t.Name).FirstOrDefault()),
                p.Translations.Where(t => t.Lang == lang).Select(t => t.ShortDescription).FirstOrDefault()
                    ?? p.Translations.Where(t => t.Lang == def).Select(t => t.ShortDescription).FirstOrDefault()))
            .ToListAsync();

        return list.Select(id => rows.FirstOrDefault(r => r.Id == id)).Where(r => r is not null).Select(r => r!).ToList();
    }
}
