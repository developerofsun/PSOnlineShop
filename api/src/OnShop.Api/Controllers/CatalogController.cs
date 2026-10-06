using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnShop.Api.Contracts;
using OnShop.Api.Services;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Controllers;

/// <summary>Public read-only catalog used by the storefront.</summary>
[ApiController, Route("api/catalog"), AllowAnonymous]
public class CatalogController(AppDbContext db, CatalogService catalog) : ControllerBase
{
    [HttpGet("products")]
    public Task<ProductsResult> Products([FromQuery] ProductQuery q) => catalog.SearchAsync(q);

    /// <summary>Counts for the progressive filters (categories tree, price range, toggles) under the current filters.</summary>
    [HttpGet("facets")]
    public Task<Facets> Facets([FromQuery] ProductQuery q) => catalog.FacetsAsync(q);

    [HttpGet("suggest")]
    public Task<SuggestResult> Suggest([FromQuery] string? q, [FromQuery] string? lang) => catalog.SuggestAsync(q, lang);

    /// <summary>Used by compare and favorites: ids=1,2,3</summary>
    [HttpGet("products/by-ids")]
    public async Task<List<ProductCompareItem>> ByIds([FromQuery] string? ids, [FromQuery] string? lang)
    {
        var list = (ids ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(s => int.TryParse(s, out var n) ? n : 0).Where(n => n > 0);
        return await catalog.ByIdsAsync(list, lang);
    }

    [HttpGet("products/{slug}")]
    public async Task<ActionResult<ProductDetail>> Product(string slug, [FromQuery] string? lang)
    {
        var l = CatalogService.Lang(lang);
        slug = Uri.UnescapeDataString(slug);

        var product = await db.Products.AsNoTracking()
            .Include(p => p.Translations).Include(p => p.Images)
            .Include(p => p.Category).ThenInclude(c => c!.Translations)
            .Where(p => p.IsPublished && p.Translations.Any(t => t.Slug == slug))
            .FirstOrDefaultAsync();
        if (product is null) return NotFound();

        var t = product.Translations.FirstOrDefault(x => x.Lang == l)
                ?? product.Translations.First(x => x.Lang == Languages.Default);

        CategoryRef? cat = null;
        if (product.Category is { } c)
        {
            var ct = c.Translations.FirstOrDefault(x => x.Lang == l)
                     ?? c.Translations.FirstOrDefault(x => x.Lang == Languages.Default);
            cat = new CategoryRef(c.Id, ct?.Name, ct?.Slug);
        }

        return new ProductDetail(
            product.Id, product.Sku, product.Price, product.SalePrice, product.Stock,
            t.Name, t.Slug, t.ShortDescription, t.Description, t.SeoTitle, t.SeoDescription,
            cat,
            product.Images.OrderBy(i => i.SortOrder).Select(i => i.Url).ToArray(),
            product.Translations.ToDictionary(x => x.Lang, x => x.Slug));
    }

    [HttpGet("categories")]
    public Task<List<CategoryItem>> Categories([FromQuery] string? lang) => catalog.CategoriesAsync(lang);
}
