using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnShop.Api.Common;
using OnShop.Api.Contracts;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Controllers;

/// <summary>The footer designer: one shared layout of columns, each holding a stack of elements, plus social links.</summary>
[ApiController, Route("api/admin/footer"), Authorize(Policy = Permissions.ContentManage)]
public partial class AdminFooterController(AppDbContext db) : ControllerBase
{
    public const int MaxColumns = 6;
    public const int MaxElements = 15;
    public const int MaxLinks = 20;

    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex ColorRx();

    [GeneratedRegex(@"^#[0-9a-fA-F]{3,8}$")]
    private static partial Regex BgColorRx();

    private static JsonElement ParseConfig(string? json)
    {
        try
        {
            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json);
            return doc.RootElement.Clone();
        }
        catch (JsonException) { return JsonDocument.Parse("{}").RootElement.Clone(); }
    }

    private static FooterDetail ToDetail(FooterLayout f) => new(
        f.Id,
        f.IsActive,
        f.Theme,
        f.HeadingColor,
        f.LinkColor,
        ParseColor(f.BackgroundJson),
        ParseColor(f.TextColorJson),
        ParseColor(f.MutedColorJson),
        Localized.Parse(f.CopyrightJson),
        Localized.Parse(f.PageSlugJson),
        f.Columns.OrderBy(c => c.SortOrder).Select(c => new FooterColumnDetail(c.Id, c.Width,
            c.Elements.OrderBy(e => e.SortOrder).Select(e => new FooterElementDetail(e.Id, e.Type, ParseConfig(e.ConfigJson))).ToList())).ToList(),
        f.Socials.OrderBy(s => s.SortOrder).Select(s => new FooterSocialDto(s.Network, s.Url)).ToList());

    private static JsonElement ParseColor(string json)
    {
        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json);
        return doc.RootElement.Clone();
    }

    [HttpGet]
    public async Task<ActionResult<FooterDetail>> Get()
    {
        var f = await db.FooterLayouts.AsNoTracking()
            .Include(x => x.Columns).ThenInclude(c => c.Elements)
            .Include(x => x.Socials)
            .OrderBy(x => x.Id).FirstOrDefaultAsync();
        return f is null ? NotFound() : ToDetail(f);
    }

    [HttpPut]
    public async Task<ActionResult<FooterDetail>> Save(FooterInput input)
    {
        var f = await db.FooterLayouts
            .Include(x => x.Columns).ThenInclude(c => c.Elements)
            .Include(x => x.Socials)
            .OrderBy(x => x.Id).FirstOrDefaultAsync();
        f ??= new FooterLayout();

        var error = await Apply(f, input);
        if (error is not null) return BadRequest(new { error });

        if (f.Id == 0) db.FooterLayouts.Add(f);
        else f.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return ToDetail(f);
    }

    /// <summary>Restores the classic four-column footer the storefront shipped with.</summary>
    [HttpPost("reset")]
    public async Task<ActionResult<FooterDetail>> Reset()
    {
        var f = await db.FooterLayouts
            .Include(x => x.Columns).ThenInclude(c => c.Elements)
            .Include(x => x.Socials)
            .OrderBy(x => x.Id).FirstOrDefaultAsync();
        f ??= new FooterLayout();

        var error = await Apply(f, Defaults());
        if (error is not null) return BadRequest(new { error });

        if (f.Id == 0) db.FooterLayouts.Add(f);
        else f.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return ToDetail(f);
    }

    private static FooterInput Defaults() => new(
        true,
        "dark",
        null,
        null,
        new Dictionary<string, string> { ["fa"] = "#f1efea", ["en"] = "#f1efea" },
        new Dictionary<string, string> { ["fa"] = "#1f1e1a", ["en"] = "#1f1e1a" },
        new Dictionary<string, string> { ["fa"] = "#5c584f", ["en"] = "#5c584f" },
        new Dictionary<string, string> { ["fa"] = "همه حقوق محفوظ است.", ["en"] = "All rights reserved." },
        new Dictionary<string, string>(),
        [
            new FooterColumnInput(0.25,
            [
                Element(FooterElementTypes.Logo, new { logo = true, text = true }),
            ]),
            new FooterColumnInput(0.25,
            [
                Element(FooterElementTypes.Heading, new { text = new { fa = "فروشگاه", en = "Shop" } }),
                Element(FooterElementTypes.Links, new { items = new object[]
                {
                    new { text = new { fa = "محصولات", en = "Products" }, link = "/products" },
                    new { text = new { fa = "تخفیف‌ها", en = "Offers" }, link = "/products?onSale=true" },
                    new { text = new { fa = "مقایسه", en = "Compare" }, link = "/compare" },
                } }),
            ]),
            new FooterColumnInput(0.25,
            [
                Element(FooterElementTypes.Heading, new { text = new { fa = "مشتریان", en = "Customers" } }),
                Element(FooterElementTypes.Links, new { items = new object[]
                {
                    new { text = new { fa = "حساب کاربری", en = "Account" }, link = "/account" },
                    new { text = new { fa = "علاقه‌مندی‌ها", en = "Favorites" }, link = "/favorites" },
                    new { text = new { fa = "سبد خرید", en = "Cart" }, link = "/cart" },
                } }),
            ]),
            new FooterColumnInput(0.25,
            [
                Element(FooterElementTypes.Heading, new { text = new { fa = "خرید با اطمینان", en = "Shop with confidence" } }),
                Element(new { text = new { fa = "کیفیت و تازگی تضمین‌شده\nارسال سریع به درب منزل\nپرداخت امن", en = "Guaranteed quality and freshness\nFast delivery to your door\nSecure payment" } }),
            ]),
        ],
        []);

    /// <summary>An element whose config is built from an anonymous object (used by the defaults above).</summary>
    private static FooterElementInput Element(object value, string type = FooterElementTypes.Text)
    {
        using var doc = JsonDocument.Parse(System.Text.Json.JsonSerializer.Serialize(value));
        return new FooterElementInput(type, doc.RootElement.Clone());
    }

    private static FooterElementInput Element(string type, object value) => Element(value, type);

    private static string? Str(JsonElement cfg, string name) =>
        cfg.ValueKind == JsonValueKind.Object && cfg.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString() : null;

    /// <summary>start (right in RTL) | center | end. A missing value keeps the column's natural start alignment.</summary>
    private static string? Align(JsonElement cfg)
    {
        var align = Str(cfg, "align");
        return align is "start" or "center" or "end" ? align : null;
    }

    private static bool Bool(JsonElement cfg, string name) =>
        cfg.ValueKind == JsonValueKind.Object && cfg.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.True;

    private static Dictionary<string, string> Langs(JsonElement cfg, string name, params string[] whitelist)
    {
        var map = new Dictionary<string, string>();
        if (cfg.ValueKind != JsonValueKind.Object || !cfg.TryGetProperty(name, out var o) || o.ValueKind != JsonValueKind.Object) return map;
        foreach (var p in o.EnumerateObject())
        {
            if (p.Value.ValueKind != JsonValueKind.String) continue;
            var s = p.Value.GetString();
            if (string.IsNullOrWhiteSpace(s)) continue;
            if (whitelist.Length > 0 && !whitelist.Contains(s)) continue;
            map[p.Name] = s.Trim();
        }
        return map;
    }

    private static string? Color(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : (ColorRx().IsMatch(value.Trim()) ? value.Trim().ToLowerInvariant() : "invalid");

    private static JsonElement ParseColorMap(Dictionary<string, string>? map)
    {
        using var doc = JsonDocument.Parse(Localized.ToJson(map));
        return doc.RootElement.Clone();
    }

    /// <summary>Validates one element's config; returns the sanitized JSON to store, or null with <paramref name="error"/> set.</summary>
    private static string? Config(JsonElement cfg, string type, out string? error)
    {
        error = null;
        if (cfg.ValueKind != JsonValueKind.Object) { error = "تنظیمات این المان نامعتبر است."; return null; }

        // Size preset (sm | md | lg | xl) applies to every element type.
        var size = Str(cfg, "size");
        if (size is not null && !FooterElementTypes.Sizes.Contains(size))
            size = "md";

        object clean;
        switch (type)
        {
            case FooterElementTypes.Heading:
            case FooterElementTypes.Text:
                clean = new { text = Langs(cfg, "text"), size };
                break;
            case FooterElementTypes.Links:
            {
                var items = new List<object>();
                if (cfg.TryGetProperty("items", out var arr) && arr.ValueKind == JsonValueKind.Array)
                {
                    foreach (var it in arr.EnumerateArray())
                    {
                        if (items.Count >= MaxLinks) break;
                        var link = it.ValueKind == JsonValueKind.Object ? Str(it, "link") : null;
                        if (!Text.IsSafeLink(link)) { error = "لینک نامعتبر است (فقط آدرس داخلی یا http/https)."; return null; }
                        var text = it.ValueKind == JsonValueKind.Object ? Langs(it, "text") : new();
                        if (text.Count == 0) continue;
                        items.Add(new { text, link = string.IsNullOrWhiteSpace(link) ? null : link.Trim() });
                    }
                }
                clean = new { items, size };
                break;
            }
            case FooterElementTypes.Contact:
            {
                var items = new List<object>();
                if (cfg.TryGetProperty("items", out var arr) && arr.ValueKind == JsonValueKind.Array)
                {
                    foreach (var it in arr.EnumerateArray())
                    {
                        if (items.Count >= MaxLinks) break;
                        var link = it.ValueKind == JsonValueKind.Object ? Str(it, "link") : null;
                        // tel:/mailto: are allowed here in addition to the usual safe links
                        var okLink = Text.IsSafeLink(link)
                                     || (link is not null && (link.StartsWith("tel:") || link.StartsWith("mailto:")));
                        if (!okLink) { error = "لینک نامعتبر است (فقط آدرس داخلی، http/https، tel: یا mailto:)."; return null; }
                        var text = it.ValueKind == JsonValueKind.Object ? Langs(it, "text") : new();
                        if (text.Count == 0) continue;
                        var icon = (it.ValueKind == JsonValueKind.Object ? Str(it, "icon") : null) ?? "phone";
                        if (!FooterElementTypes.Icons.Contains(icon)) icon = "phone";
                        items.Add(new { icon, text, link = string.IsNullOrWhiteSpace(link) ? null : link.Trim() });
                    }
                }
                clean = new { items, size };
                break;
            }
            case FooterElementTypes.Logo:
                clean = new { logo = Bool(cfg, "logo"), text = Bool(cfg, "text"), size, align = Align(cfg) };
                break;
            case FooterElementTypes.Image:
            {
                var url = Str(cfg, "imageUrl");
                if (!Text.IsLocalImage(url)) { error = "فقط تصاویر آپلودشده‌ی محلی مجاز هستند."; return null; }
                clean = new { imageUrl = url?.Trim(), size, align = Align(cfg) };
                break;
            }
            case FooterElementTypes.Html:
            {
                var html = Str(cfg, "html") ?? "";
                if (html.Length > FooterHtml.MaxLength)
                {
                    error = $"کد HTML حداکثر {FooterHtml.MaxLength} کاراکتر می‌تواند باشد.";
                    return null;
                }
                var cleanHtml = FooterHtml.Sanitize(html);
                if (!string.IsNullOrWhiteSpace(html) && string.IsNullOrWhiteSpace(cleanHtml))
                {
                    error = "کد HTML نامعتبر است (اسکریپت، استایل و تگ‌های ناشناخته مجاز نیستند).";
                    return null;
                }
                clean = new { html = cleanHtml, size, align = Align(cfg) };
                break;
            }
            // Newsletter and socials are a single control / a fixed icon set; only their size varies.
            case FooterElementTypes.Newsletter:
            case FooterElementTypes.Socials:
                clean = new { size };
                break;
            default:
                error = $"نوع المان «{type}» نامعتبر است.";
                return null;
        }

        return System.Text.Json.JsonSerializer.Serialize(clean);
    }

    private async Task<string?> Apply(FooterLayout f, FooterInput input)
    {
        if (input.Columns.Count is 0 or > MaxColumns) return $"تعداد ستون‌ها باید بین ۱ تا {MaxColumns} باشد.";
        foreach (var c in input.Columns)
        {
            if (c.Width <= 0 || c.Width > 1) return "عرض هر ستون باید بین ۰ و ۱ باشد.";
            if (c.Elements.Count > MaxElements) return $"هر ستون حداکثر {MaxElements} المان می‌تواند داشته باشد.";
        }

        var theme = input.Theme == "custom" ? "custom" : "dark";
        var heading = Color(input.HeadingColor);
        var link = Color(input.LinkColor);
        if (heading == "invalid" || link == "invalid") return "رنگ‌ها باید به شکل #RRGGBB باشند.";

        var bg = ParseColorMap(input.Background);
        var foreground = ParseColorMap(input.TextColor);
        var muted = ParseColorMap(input.MutedColor);
        foreach (var map in new[] { bg, foreground, muted })
            foreach (var (lang, value) in Localized.Parse(map.GetRawText()))
                if (!BgColorRx().IsMatch(value)) return "رنگ پس‌زمینه یا متن نامعتبر است.";

        var slugMap = (input.PageSlug ?? new())
            .Where(kv => !string.IsNullOrWhiteSpace(kv.Value))
            .ToDictionary(kv => kv.Key, kv => kv.Value.Trim());
        foreach (var (lang, slug) in slugMap)
        {
            if (!Languages.Supported.Contains(lang)) return $"زبان «{lang}» پشتیبانی نمی‌شود.";
            if (!await db.PageTranslations.AnyAsync(t => t.Lang == lang && t.Slug == slug))
                return $"صفحه‌ای با نامک «{slug}» پیدا نشد.";
        }

        var socials = new List<(string network, string url)>();
        foreach (var s in input.Socials)
        {
            if (!FooterSocials.All.Contains(s.Network)) return $"شبکه‌ی «{s.Network}» پشتیبانی نمی‌شود.";
            var url = s.Url?.Trim() ?? "";
            var ok = s.Network == "telegram"
                ? url.StartsWith("https://t.me/", StringComparison.OrdinalIgnoreCase) || url.StartsWith("tg://")
                : Text.IsSafeLink(url) && url.StartsWith("http", StringComparison.OrdinalIgnoreCase);
            if (!ok) return "آدرس شبکه‌های اجتماعی نامعتبر است (باید با https:// شروع شود؛ تلگرام: https://t.me/...).";
            socials.Add((s.Network, url));
        }

        // Elements are validated first so a bad one leaves the stored layout untouched.
        var columns = new List<(double width, List<(string type, string json)>)>();
        foreach (var c in input.Columns)
        {
            var elements = new List<(string, string)>();
            foreach (var e in c.Elements)
            {
                var json = Config(e.Config, e.Type, out var cfgError);
                if (json is null) return cfgError;
                elements.Add((e.Type, json));
            }
            columns.Add((c.Width, elements));
        }

        f.IsActive = input.IsActive;
        f.Theme = theme;
        f.HeadingColor = heading;
        f.LinkColor = link;
        f.BackgroundJson = bg.GetRawText();
        f.TextColorJson = foreground.GetRawText();
        f.MutedColorJson = muted.GetRawText();
        f.CopyrightJson = Localized.ToJson(input.Copyright);
        f.PageSlugJson = Localized.ToJson(slugMap);

        db.FooterColumns.RemoveRange(f.Columns);
        f.Columns.Clear();
        db.FooterSocials.RemoveRange(f.Socials);
        f.Socials.Clear();

        var order = 0;
        foreach (var (width, elements) in columns)
        {
            var column = new FooterColumn { SortOrder = order++, Width = Math.Round(width, 4) };
            var eOrder = 0;
            foreach (var (type, json) in elements)
                column.Elements.Add(new FooterElement { SortOrder = eOrder++, Type = type, ConfigJson = json });
            f.Columns.Add(column);
        }
        order = 0;
        foreach (var (network, url) in socials)
            f.Socials.Add(new FooterSocial { SortOrder = order++, Network = network, Url = url });

        return null;
    }
}
