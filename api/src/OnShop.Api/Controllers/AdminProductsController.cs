using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnShop.Api.Common;
using OnShop.Api.Contracts;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Controllers;

[ApiController, Route("api/admin/products"), Authorize(Policy = Permissions.ProductsManage)]
public class AdminProductsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<PagedResult<AdminProductListItem>> List(
        [FromQuery] string? q, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var (p, size) = Paging.Clamp(page, pageSize);
        var def = Languages.Default;
        var query = db.Products.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(q))
        {
            var pattern = $"%{Text.Normalize(q).Trim()}%";
            query = query.Where(x => EF.Functions.ILike(x.Sku, pattern)
                                     || x.Translations.Any(t => EF.Functions.ILike(t.Name, pattern)));
        }

        var total = await query.CountAsync();
        var items = await query.OrderByDescending(x => x.Id).Skip((p - 1) * size).Take(size)
            .Select(x => new AdminProductListItem(
                x.Id, x.Sku,
                x.Translations.Where(t => t.Lang == def).Select(t => t.Name).FirstOrDefault(),
                x.Price, x.SalePrice, x.Stock, x.IsPublished,
                x.Images.OrderBy(i => i.SortOrder).Select(i => i.Url).FirstOrDefault(),
                x.CreatedAt))
            .ToListAsync();
        return new PagedResult<AdminProductListItem>(items, total, p, size);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<AdminProductDetail>> Get(int id)
    {
        var x = await db.Products.AsNoTracking()
            .Include(p => p.Translations).Include(p => p.Images)
            .FirstOrDefaultAsync(p => p.Id == id);
        if (x is null) return NotFound();
        return new AdminProductDetail(
            x.Id, x.Sku, x.Price, x.SalePrice, x.Stock, x.IsPublished, x.CategoryId,
            x.Translations.Select(t => new TranslationInput(
                t.Lang, t.Name, t.Slug, t.ShortDescription, t.Description, t.SeoTitle, t.SeoDescription)).ToList(),
            x.Images.OrderBy(i => i.SortOrder).Select(i => i.Url).ToList());
    }

    [HttpPost]
    public async Task<ActionResult<AdminProductDetail>> Create(ProductInput input)
    {
        var product = new Product();
        var error = await Apply(product, input, null);
        if (error is not null) return BadRequest(new { error });
        db.Products.Add(product);
        await db.SaveChangesAsync();
        return await Get(product.Id);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<AdminProductDetail>> Update(int id, ProductInput input)
    {
        var product = await db.Products
            .Include(p => p.Translations).Include(p => p.Images)
            .FirstOrDefaultAsync(p => p.Id == id);
        if (product is null) return NotFound();

        var error = await Apply(product, input, id);
        if (error is not null) return BadRequest(new { error });
        product.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await Get(id);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var product = await db.Products.FindAsync(id);
        if (product is null) return NotFound();
        db.Products.Remove(product); // order items keep their snapshot; FK is set to null
        await db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Copies input onto the entity. Returns an error message, or null on success.</summary>
    private async Task<string?> Apply(Product p, ProductInput input, int? existingId)
    {
        if (string.IsNullOrWhiteSpace(input.Sku)) return "کد کالا (SKU) الزامی است.";
        if (input.Price < 0 || input.Stock < 0) return "قیمت و موجودی نمی‌تواند منفی باشد.";
        if (input.SalePrice is < 0) return "قیمت حراج نامعتبر است.";
        if (input.Translations.All(t => t.Lang != Languages.Default || string.IsNullOrWhiteSpace(t.Name)))
            return "نام فارسی محصول الزامی است.";

        var sku = input.Sku.Trim();
        if (await db.Products.AnyAsync(x => x.Sku == sku && x.Id != (existingId ?? 0)))
            return "این SKU قبلاً استفاده شده است.";

        var translations = input.Translations
            .Where(t => !string.IsNullOrWhiteSpace(t.Name))
            .GroupBy(t => t.Lang).Select(g => g.First()).ToList();

        foreach (var t in translations)
        {
            if (!Languages.Supported.Contains(t.Lang)) return $"زبان «{t.Lang}» پشتیبانی نمی‌شود.";
            var slug = Text.Slugify(string.IsNullOrWhiteSpace(t.Slug) ? t.Name : t.Slug);
            if (slug.Length == 0) return "نامک (slug) نامعتبر است.";
            if (await db.ProductTranslations.AnyAsync(x => x.Lang == t.Lang && x.Slug == slug && x.ProductId != (existingId ?? 0)))
                return $"نامک «{slug}» قبلاً استفاده شده است.";
        }

        p.Sku = sku;
        p.Price = input.Price;
        p.SalePrice = input.SalePrice;
        p.Stock = input.Stock;
        p.IsPublished = input.IsPublished;
        p.CategoryId = input.CategoryId;

        // Update translations in place (matched by Lang) to avoid unique-index conflicts in one batch.
        foreach (var t in translations)
        {
            var slug = Text.Slugify(string.IsNullOrWhiteSpace(t.Slug) ? t.Name : t.Slug);
            var row = p.Translations.FirstOrDefault(x => x.Lang == t.Lang);
            if (row is null) { row = new ProductTranslation { Lang = t.Lang }; p.Translations.Add(row); }
            row.Name = Text.Normalize(t.Name).Trim();
            row.Slug = slug;
            row.ShortDescription = t.ShortDescription;
            row.Description = t.Description;
            row.SeoTitle = t.SeoTitle;
            row.SeoDescription = t.SeoDescription;
            row.SearchText = Normalizer.BuildSearchText(row.Name, row.ShortDescription, sku);
        }
        var keep = translations.Select(t => t.Lang).ToHashSet();
        foreach (var gone in p.Translations.Where(x => !keep.Contains(x.Lang)).ToList())
        {
            p.Translations.Remove(gone);
            if (gone.Id != 0) db.ProductTranslations.Remove(gone);
        }

        // Images: only local /uploads URLs are accepted (nothing remote).
        db.ProductImages.RemoveRange(p.Images);
        p.Images.Clear();
        var order = 0;
        foreach (var url in input.Images.Distinct())
        {
            if (!url.StartsWith("/uploads/", StringComparison.Ordinal)) return "فقط تصاویر آپلودشده‌ی محلی مجاز هستند.";
            p.Images.Add(new ProductImage { Url = url, SortOrder = order++ });
        }
        return null;
    }
}
