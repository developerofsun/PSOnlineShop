using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnShop.Api.Common;
using OnShop.Api.Contracts;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Controllers;

// ------------------------------------------------------------------ sliders

[ApiController, Route("api/admin/sliders"), Authorize(Policy = Permissions.ContentManage)]
public class AdminSlidersController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<List<SliderListItem>> List() =>
        await db.Sliders.AsNoTracking().OrderByDescending(s => s.Id)
            .Select(s => new SliderListItem(s.Id, s.Name, s.IsActive, s.Slides.Count)).ToListAsync();

    [HttpGet("{id:int}")]
    public async Task<ActionResult<SliderDetail>> Get(int id)
    {
        var s = await db.Sliders.AsNoTracking().Include(x => x.Slides).FirstOrDefaultAsync(x => x.Id == id);
        if (s is null) return NotFound();
        return new SliderDetail(s.Id, s.Name, s.IsActive, s.Slides.OrderBy(x => x.SortOrder).Select(x => new SlideInput(
            x.ImageUrl, x.LinkUrl, Localized.Parse(x.TitleJson), Localized.Parse(x.SubtitleJson), Localized.Parse(x.ButtonTextJson))).ToList());
    }

    [HttpPost]
    public async Task<ActionResult<SliderDetail>> Create(SliderInput input)
    {
        var s = new Slider();
        var error = Apply(s, input);
        if (error is not null) return BadRequest(new { error });
        db.Sliders.Add(s);
        await db.SaveChangesAsync();
        return await Get(s.Id);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<SliderDetail>> Update(int id, SliderInput input)
    {
        var s = await db.Sliders.Include(x => x.Slides).FirstOrDefaultAsync(x => x.Id == id);
        if (s is null) return NotFound();
        var error = Apply(s, input);
        if (error is not null) return BadRequest(new { error });
        s.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await Get(id);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var s = await db.Sliders.FindAsync(id);
        if (s is null) return NotFound();
        db.Sliders.Remove(s);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private string? Apply(Slider s, SliderInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Name)) return "نام اسلایدر الزامی است.";
        if (input.Slides.Count > 20) return "حداکثر ۲۰ اسلاید مجاز است.";
        foreach (var sl in input.Slides)
        {
            if (!Text.IsLocalImage(sl.ImageUrl)) return "فقط تصاویر آپلودشده‌ی محلی مجاز هستند.";
            if (!Text.IsSafeLink(sl.LinkUrl)) return "لینک نامعتبر است.";
        }

        s.Name = input.Name.Trim();
        s.IsActive = input.IsActive;
        db.Slides.RemoveRange(s.Slides);
        s.Slides.Clear();
        var order = 0;
        foreach (var sl in input.Slides)
            s.Slides.Add(new Slide
            {
                SortOrder = order++,
                ImageUrl = sl.ImageUrl ?? "",
                LinkUrl = string.IsNullOrWhiteSpace(sl.LinkUrl) ? null : sl.LinkUrl.Trim(),
                TitleJson = Localized.ToJson(sl.Title),
                SubtitleJson = Localized.ToJson(sl.Subtitle),
                ButtonTextJson = Localized.ToJson(sl.ButtonText)
            });
        return null;
    }
}

// ------------------------------------------------------------------ banners

[ApiController, Route("api/admin/banners"), Authorize(Policy = Permissions.ContentManage)]
public class AdminBannersController(AppDbContext db) : ControllerBase
{
    private static BannerDetail ToDetail(Banner b) =>
        new(b.Id, b.Name, b.ImageUrl, b.LinkUrl, Localized.Parse(b.TitleJson), b.IsActive);

    [HttpGet]
    public async Task<List<BannerDetail>> List() =>
        (await db.Banners.AsNoTracking().OrderByDescending(b => b.Id).ToListAsync()).Select(ToDetail).ToList();

    [HttpGet("{id:int}")]
    public async Task<ActionResult<BannerDetail>> Get(int id)
    {
        var b = await db.Banners.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
        return b is null ? NotFound() : ToDetail(b);
    }

    [HttpPost]
    public async Task<ActionResult<BannerDetail>> Create(BannerInput input)
    {
        var b = new Banner();
        var error = Apply(b, input);
        if (error is not null) return BadRequest(new { error });
        db.Banners.Add(b);
        await db.SaveChangesAsync();
        return ToDetail(b);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<BannerDetail>> Update(int id, BannerInput input)
    {
        var b = await db.Banners.FindAsync(id);
        if (b is null) return NotFound();
        var error = Apply(b, input);
        if (error is not null) return BadRequest(new { error });
        b.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return ToDetail(b);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var b = await db.Banners.FindAsync(id);
        if (b is null) return NotFound();
        db.Banners.Remove(b);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static string? Apply(Banner b, BannerInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Name)) return "نام بنر الزامی است.";
        if (!Text.IsLocalImage(input.ImageUrl)) return "فقط تصاویر آپلودشده‌ی محلی مجاز هستند.";
        if (!Text.IsSafeLink(input.LinkUrl)) return "لینک نامعتبر است.";
        b.Name = input.Name.Trim();
        b.ImageUrl = input.ImageUrl ?? "";
        b.LinkUrl = string.IsNullOrWhiteSpace(input.LinkUrl) ? null : input.LinkUrl.Trim();
        b.TitleJson = Localized.ToJson(input.Title);
        b.IsActive = input.IsActive;
        return null;
    }
}

// ------------------------------------------------------------------ fixed texts

[ApiController, Route("api/admin/texts"), Authorize(Policy = Permissions.ContentManage)]
public class AdminTextsController(AppDbContext db) : ControllerBase
{
    private static TextDetail ToDetail(ContentText t) => new(t.Id, t.Name, t.Key, Localized.Parse(t.ContentJson), t.IsActive);

    [HttpGet]
    public async Task<List<TextDetail>> List() =>
        (await db.ContentTexts.AsNoTracking().OrderBy(t => t.Key).ToListAsync()).Select(ToDetail).ToList();

    [HttpPost]
    public async Task<ActionResult<TextDetail>> Create(TextInput input)
    {
        var t = new ContentText();
        var error = await Apply(t, input, null);
        if (error is not null) return BadRequest(new { error });
        db.ContentTexts.Add(t);
        await db.SaveChangesAsync();
        return ToDetail(t);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<TextDetail>> Update(int id, TextInput input)
    {
        var t = await db.ContentTexts.FindAsync(id);
        if (t is null) return NotFound();
        var error = await Apply(t, input, id);
        if (error is not null) return BadRequest(new { error });
        t.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return ToDetail(t);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var t = await db.ContentTexts.FindAsync(id);
        if (t is null) return NotFound();
        db.ContentTexts.Remove(t);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private async Task<string?> Apply(ContentText t, TextInput input, int? id)
    {
        if (string.IsNullOrWhiteSpace(input.Name)) return "نام متن الزامی است.";
        var key = Text.Slugify(input.Key);
        if (key.Length == 0) return "کلید نامعتبر است (مثلاً footer).";
        if (await db.ContentTexts.AnyAsync(x => x.Key == key && x.Id != (id ?? 0))) return "این کلید قبلاً استفاده شده است.";
        t.Name = input.Name.Trim();
        t.Key = key;
        t.ContentJson = Localized.ToJson(input.Content);
        t.IsActive = input.IsActive;
        return null;
    }
}

// ------------------------------------------------------------------ pages

[ApiController, Route("api/admin/pages"), Authorize(Policy = Permissions.ContentManage)]
public class AdminPagesController(AppDbContext db) : ControllerBase
{
    private static readonly string[] Sorts = ["newest", "price_asc", "price_desc", "discount"];

    private static JsonElement ParseConfig(string? json)
    {
        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json);
        return doc.RootElement.Clone();
    }

    [HttpGet]
    public async Task<List<PageListItem>> List()
    {
        var def = Languages.Default;
        return await db.Pages.AsNoTracking().OrderByDescending(p => p.IsHome).ThenByDescending(p => p.Id)
            .Select(p => new PageListItem(
                p.Id,
                p.Translations.Where(t => t.Lang == def).Select(t => t.Title).FirstOrDefault(),
                p.Translations.Where(t => t.Lang == def).Select(t => t.Slug).FirstOrDefault(),
                p.IsPublished, p.IsHome, p.Blocks.Count, p.CreatedAt))
            .ToListAsync();
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<PageDetail>> Get(int id)
    {
        var p = await db.Pages.AsNoTracking().Include(x => x.Translations).Include(x => x.Blocks)
            .FirstOrDefaultAsync(x => x.Id == id);
        if (p is null) return NotFound();
        return new PageDetail(p.Id, p.IsPublished, p.IsHome,
            p.Translations.Select(t => new PageTranslationInput(t.Lang, t.Title, t.Slug, t.SeoTitle, t.SeoDescription)).ToList(),
            p.Blocks.OrderBy(b => b.SortOrder).Select(b => new BlockDetail(b.Id, b.Type, b.IsActive, ParseConfig(b.ConfigJson))).ToList());
    }

    [HttpPost]
    public async Task<ActionResult<PageDetail>> Create(PageInput input)
    {
        var page = new Page();
        var error = await Apply(page, input, null);
        if (error is not null) return BadRequest(new { error });
        db.Pages.Add(page);
        await db.SaveChangesAsync();
        await EnsureSingleHome(page);
        return await Get(page.Id);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<PageDetail>> Update(int id, PageInput input)
    {
        var page = await db.Pages.Include(p => p.Translations).Include(p => p.Blocks).FirstOrDefaultAsync(p => p.Id == id);
        if (page is null) return NotFound();
        var error = await Apply(page, input, id);
        if (error is not null) return BadRequest(new { error });
        page.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await EnsureSingleHome(page);
        return await Get(id);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var page = await db.Pages.FindAsync(id);
        if (page is null) return NotFound();
        db.Pages.Remove(page);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private async Task EnsureSingleHome(Page page)
    {
        if (!page.IsHome) return;
        await db.Pages.Where(p => p.IsHome && p.Id != page.Id).ExecuteUpdateAsync(s => s.SetProperty(p => p.IsHome, false));
    }

    private static bool TryInt(JsonElement cfg, string name, out int value)
    {
        value = 0;
        return cfg.ValueKind == JsonValueKind.Object && cfg.TryGetProperty(name, out var v)
               && v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out value);
    }

    private async Task<string?> ValidateBlock(BlockInput b)
    {
        if (!BlockTypes.All.Contains(b.Type)) return $"نوع بلوک «{b.Type}» نامعتبر است.";
        var cfg = b.Config;
        switch (b.Type)
        {
            case BlockTypes.Slider:
                if (!TryInt(cfg, "sliderId", out var sid) || !await db.Sliders.AnyAsync(s => s.Id == sid)) return "اسلایدر انتخاب‌شده وجود ندارد.";
                break;
            case BlockTypes.Banner:
                if (!TryInt(cfg, "bannerId", out var bid) || !await db.Banners.AnyAsync(x => x.Id == bid)) return "بنر انتخاب‌شده وجود ندارد.";
                break;
            case BlockTypes.Text:
                if (!TryInt(cfg, "textId", out var tid) || !await db.ContentTexts.AnyAsync(x => x.Id == tid)) return "متن انتخاب‌شده وجود ندارد.";
                break;
            case BlockTypes.Products:
                if (TryInt(cfg, "categoryId", out var cid) && !await db.Categories.AnyAsync(c => c.Id == cid)) return "دسته انتخاب‌شده وجود ندارد.";
                if (TryInt(cfg, "limit", out var limit) && (limit < 1 || limit > 24)) return "تعداد محصولات باید بین ۱ تا ۲۴ باشد.";
                if (cfg.ValueKind == JsonValueKind.Object && cfg.TryGetProperty("sort", out var so) && so.ValueKind == JsonValueKind.String
                    && !Sorts.Contains(so.GetString())) return "نوع مرتب‌سازی نامعتبر است.";
                break;
        }
        return null;
    }

    private async Task<string?> Apply(Page page, PageInput input, int? id)
    {
        var translations = input.Translations
            .Where(t => !string.IsNullOrWhiteSpace(t.Title)).GroupBy(t => t.Lang).Select(g => g.First()).ToList();
        if (translations.All(t => t.Lang != Languages.Default)) return "عنوان فارسی صفحه الزامی است.";
        if (input.Blocks.Count > 50) return "حداکثر ۵۰ بلوک در هر صفحه مجاز است.";

        foreach (var t in translations)
        {
            if (!Languages.Supported.Contains(t.Lang)) return $"زبان «{t.Lang}» پشتیبانی نمی‌شود.";
            var slug = Text.Slugify(string.IsNullOrWhiteSpace(t.Slug) ? t.Title : t.Slug);
            if (slug.Length == 0) return "نامک نامعتبر است.";
            if (await db.PageTranslations.AnyAsync(x => x.Lang == t.Lang && x.Slug == slug && x.PageId != (id ?? 0)))
                return $"نامک «{slug}» قبلاً استفاده شده است.";
        }
        foreach (var b in input.Blocks)
        {
            var err = await ValidateBlock(b);
            if (err is not null) return err;
        }

        page.IsPublished = input.IsPublished;
        page.IsHome = input.IsHome;

        foreach (var t in translations)
        {
            var row = page.Translations.FirstOrDefault(x => x.Lang == t.Lang);
            if (row is null) { row = new PageTranslation { Lang = t.Lang }; page.Translations.Add(row); }
            row.Title = t.Title.Trim();
            row.Slug = Text.Slugify(string.IsNullOrWhiteSpace(t.Slug) ? t.Title : t.Slug);
            row.SeoTitle = t.SeoTitle;
            row.SeoDescription = t.SeoDescription;
        }
        var keep = translations.Select(t => t.Lang).ToHashSet();
        foreach (var gone in page.Translations.Where(x => !keep.Contains(x.Lang)).ToList())
        {
            page.Translations.Remove(gone);
            if (gone.Id != 0) db.PageTranslations.Remove(gone);
        }

        db.PageBlocks.RemoveRange(page.Blocks);
        page.Blocks.Clear();
        var order = 0;
        foreach (var b in input.Blocks)
            page.Blocks.Add(new PageBlock
            {
                SortOrder = order++,
                Type = b.Type,
                IsActive = b.IsActive,
                ConfigJson = b.Config.ValueKind == JsonValueKind.Object ? b.Config.GetRawText() : "{}"
            });
        return null;
    }
}
