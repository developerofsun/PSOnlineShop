using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnShop.Api.Contracts;
using OnShop.Api.Services;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Controllers;

/// <summary>Pages and their blocks, resolved for one language so the storefront can render them directly.</summary>
[ApiController, Route("api/content"), AllowAnonymous]
public class PublicContentController(AppDbContext db, CatalogService catalog) : ControllerBase
{
    [HttpGet("home")]
    public async Task<ActionResult<PublicPage>> Home([FromQuery] string? lang)
    {
        var page = await db.Pages.AsNoTracking().Include(p => p.Translations).Include(p => p.Blocks)
            .FirstOrDefaultAsync(p => p.IsHome && p.IsPublished);
        return page is null ? NotFound() : await Build(page, CatalogService.Lang(lang));
    }

    [HttpGet("pages/{slug}")]
    public async Task<ActionResult<PublicPage>> GetPage(string slug, [FromQuery] string? lang)
    {
        slug = Uri.UnescapeDataString(slug);
        var page = await db.Pages.AsNoTracking().Include(p => p.Translations).Include(p => p.Blocks)
            .FirstOrDefaultAsync(p => p.IsPublished && p.Translations.Any(t => t.Slug == slug));
        return page is null ? NotFound() : await Build(page, CatalogService.Lang(lang));
    }

    /// <summary>Active, non-expired story groups for the circles at the top of the storefront.</summary>
    [HttpGet("stories")]
    public async Task<List<StoryGroupDto>> Stories([FromQuery] string? lang)
    {
        var l = CatalogService.Lang(lang);
        var now = DateTime.UtcNow;
        var rows = await db.Stories.AsNoTracking().Include(s => s.Items)
            .Where(s => s.IsActive && (s.ExpiresAt == null || s.ExpiresAt > now))
            .OrderBy(s => s.SortOrder).ThenByDescending(s => s.Id).ToListAsync();

        return rows.Where(s => s.Items.Count > 0).Select(s => new StoryGroupDto(
            s.Id,
            Localized.Pick(s.TitleJson, l) ?? s.Name,
            s.CoverUrl,
            s.Items.OrderBy(i => i.SortOrder)
                .Select(i => new StoryItemDto(i.ImageUrl, Localized.Pick(i.CaptionJson, l), i.LinkUrl, i.DurationSec)).ToList())).ToList();
    }

    [HttpGet("texts/{key}")]
    public async Task<ActionResult<PublicText>> Text(string key, [FromQuery] string? lang)
    {
        var t = await db.ContentTexts.AsNoTracking().FirstOrDefaultAsync(x => x.Key == key && x.IsActive);
        return t is null ? NotFound() : new PublicText(Localized.Pick(t.ContentJson, CatalogService.Lang(lang)));
    }

    // ------------------------------------------------------------------

    private async Task<PublicPage> Build(Page page, string lang)
    {
        var t = page.Translations.FirstOrDefault(x => x.Lang == lang)
                ?? page.Translations.FirstOrDefault(x => x.Lang == Languages.Default)
                ?? page.Translations.First();

        var blocks = new List<BlockDto>();
        foreach (var b in page.Blocks.Where(x => x.IsActive).OrderBy(x => x.SortOrder))
        {
            var data = await Resolve(b, lang);
            if (data is not null) blocks.Add(new BlockDto(b.Id, b.Type, data));
        }

        return new PublicPage(page.Id, t.Title, t.Slug, t.SeoTitle, t.SeoDescription,
            page.Translations.ToDictionary(x => x.Lang, x => x.Slug), blocks);
    }

    private static int? Int(JsonElement cfg, string name) =>
        cfg.ValueKind == JsonValueKind.Object && cfg.TryGetProperty(name, out var v)
        && v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var n) ? n : null;

    private static string? Str(JsonElement cfg, string name) =>
        cfg.ValueKind == JsonValueKind.Object && cfg.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString() : null;

    private static string? Title(JsonElement cfg, string lang)
    {
        if (cfg.ValueKind != JsonValueKind.Object || !cfg.TryGetProperty("title", out var t) || t.ValueKind != JsonValueKind.Object)
            return null;
        return Localized.Pick(t.GetRawText(), lang);
    }

    /// <summary>Returns the data for the block, or null when it should not be shown (missing/inactive/empty).</summary>
    private async Task<object?> Resolve(PageBlock b, string lang)
    {
        JsonElement cfg;
        try { using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(b.ConfigJson) ? "{}" : b.ConfigJson); cfg = doc.RootElement.Clone(); }
        catch (JsonException) { return null; }

        switch (b.Type)
        {
            case BlockTypes.Slider:
            {
                var id = Int(cfg, "sliderId");
                var slider = await db.Sliders.AsNoTracking().Include(s => s.Slides)
                    .FirstOrDefaultAsync(s => s.Id == id && s.IsActive);
                if (slider is null || slider.Slides.Count == 0) return null;
                return new SliderData(slider.Slides.OrderBy(s => s.SortOrder).Select(s => new SlideDto(
                    s.ImageUrl, s.LinkUrl,
                    Localized.Pick(s.TitleJson, lang), Localized.Pick(s.SubtitleJson, lang), Localized.Pick(s.ButtonTextJson, lang))).ToList());
            }
            case BlockTypes.Banner:
            {
                var id = Int(cfg, "bannerId");
                var banner = await db.Banners.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.IsActive);
                return banner is null ? null : new BannerData(banner.ImageUrl, banner.LinkUrl, Localized.Pick(banner.TitleJson, lang));
            }
            case BlockTypes.Text:
            {
                var id = Int(cfg, "textId");
                var text = await db.ContentTexts.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.IsActive);
                return text is null ? null : new TextData(Localized.Pick(text.ContentJson, lang));
            }
            case BlockTypes.Categories:
            {
                var items = await catalog.CategoriesAsync(lang, topLevelOnly: true);
                return items.Count == 0 ? null : new CategoriesData(Title(cfg, lang), items);
            }
            case BlockTypes.Products:
            {
                var limit = Math.Clamp(Int(cfg, "limit") ?? 8, 1, 24);
                var categoryId = Int(cfg, "categoryId");
                var filter = new ProductFilter(null, [], null, null, false, false);
                List<int>? ids = categoryId is int cid ? await catalog.DescendantIdsAsync(cid) : null;

                var query = catalog.Sort(catalog.Apply(catalog.Published(), filter, ids), Str(cfg, "sort"), null).Take(limit);
                var items = await catalog.ToListItems(query, lang).ToListAsync();
                if (items.Count == 0) return null;

                string? slug = null;
                if (categoryId is int c)
                    slug = await db.CategoryTranslations.AsNoTracking()
                        .Where(x => x.CategoryId == c && (x.Lang == lang || x.Lang == Languages.Default))
                        .OrderBy(x => x.Lang == lang ? 0 : 1).Select(x => x.Slug).FirstOrDefaultAsync();
                return new ProductsData(Title(cfg, lang), slug, items);
            }
            default:
                return null;
        }
    }
}
