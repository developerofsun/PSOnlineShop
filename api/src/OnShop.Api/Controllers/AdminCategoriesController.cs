using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnShop.Api.Common;
using OnShop.Api.Contracts;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Controllers;

[ApiController, Route("api/admin/categories"), Authorize(Policy = Permissions.CategoriesManage)]
public class AdminCategoriesController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<List<AdminCategoryItem>> List()
    {
        var def = Languages.Default;
        return await db.Categories.AsNoTracking()
            .OrderBy(c => c.SortOrder).ThenBy(c => c.Id)
            .Select(c => new AdminCategoryItem(
                c.Id, c.ParentId, c.SortOrder, c.IsActive,
                c.Translations.Where(t => t.Lang == def).Select(t => t.Name).FirstOrDefault(),
                c.Products.Count))
            .ToListAsync();
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<AdminCategoryDetail>> Get(int id)
    {
        var c = await db.Categories.AsNoTracking().Include(x => x.Translations).FirstOrDefaultAsync(x => x.Id == id);
        if (c is null) return NotFound();
        return new AdminCategoryDetail(c.Id, c.ParentId, c.SortOrder, c.IsActive,
            c.Translations.Select(t => new CategoryTranslationInput(t.Lang, t.Name, t.Slug, t.Description)).ToList(),
            c.ImageUrl);
    }

    [HttpPost]
    public async Task<ActionResult<AdminCategoryDetail>> Create(CategoryInput input)
    {
        var cat = new Category();
        var error = await Apply(cat, input, null);
        if (error is not null) return BadRequest(new { error });
        db.Categories.Add(cat);
        await db.SaveChangesAsync();
        return await Get(cat.Id);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<AdminCategoryDetail>> Update(int id, CategoryInput input)
    {
        var cat = await db.Categories.Include(c => c.Translations).FirstOrDefaultAsync(c => c.Id == id);
        if (cat is null) return NotFound();
        if (input.ParentId == id) return BadRequest(new { error = "دسته نمی‌تواند والد خودش باشد." });
        var error = await Apply(cat, input, id);
        if (error is not null) return BadRequest(new { error });
        cat.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await Get(id);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        if (await db.Categories.AnyAsync(c => c.ParentId == id))
            return BadRequest(new { error = "ابتدا زیردسته‌ها را حذف یا منتقل کنید." });
        var cat = await db.Categories.FindAsync(id);
        if (cat is null) return NotFound();
        db.Categories.Remove(cat); // products keep existing, their CategoryId becomes null
        await db.SaveChangesAsync();
        return NoContent();
    }

    private async Task<string?> Apply(Category cat, CategoryInput input, int? existingId)
    {
        var translations = input.Translations
            .Where(t => !string.IsNullOrWhiteSpace(t.Name))
            .GroupBy(t => t.Lang).Select(g => g.First()).ToList();
        if (translations.All(t => t.Lang != Languages.Default)) return "نام فارسی دسته الزامی است.";

        foreach (var t in translations)
        {
            if (!Languages.Supported.Contains(t.Lang)) return $"زبان «{t.Lang}» پشتیبانی نمی‌شود.";
            var slug = Text.Slugify(string.IsNullOrWhiteSpace(t.Slug) ? t.Name : t.Slug);
            if (slug.Length == 0) return "نامک (slug) نامعتبر است.";
            if (await db.CategoryTranslations.AnyAsync(x => x.Lang == t.Lang && x.Slug == slug && x.CategoryId != (existingId ?? 0)))
                return $"نامک «{slug}» قبلاً استفاده شده است.";
        }

        if (!Text.IsLocalImage(input.ImageUrl)) return "فقط تصاویر آپلودشده‌ی محلی مجاز هستند.";

        cat.ParentId = input.ParentId;
        cat.ImageUrl = string.IsNullOrEmpty(input.ImageUrl) ? null : input.ImageUrl;
        cat.SortOrder = input.SortOrder;
        cat.IsActive = input.IsActive;

        foreach (var t in translations)
        {
            var row = cat.Translations.FirstOrDefault(x => x.Lang == t.Lang);
            if (row is null) { row = new CategoryTranslation { Lang = t.Lang }; cat.Translations.Add(row); }
            row.Name = Text.Normalize(t.Name).Trim();
            row.Slug = Text.Slugify(string.IsNullOrWhiteSpace(t.Slug) ? t.Name : t.Slug);
            row.Description = t.Description;
        }
        var keep = translations.Select(t => t.Lang).ToHashSet();
        foreach (var gone in cat.Translations.Where(x => !keep.Contains(x.Lang)).ToList())
        {
            cat.Translations.Remove(gone);
            if (gone.Id != 0) db.CategoryTranslations.Remove(gone);
        }
        return null;
    }
}
