using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Controllers;

[ApiController]
public partial class SettingsController(AppDbContext db) : ControllerBase
{
    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex ColorRx();

    /// <summary>Only keys starting with "site." are public (site name, description...).</summary>
    [HttpGet("api/settings/public"), AllowAnonymous]
    public async Task<Dictionary<string, string?>> Public()
        => await db.Settings.AsNoTracking().Where(s => s.Key.StartsWith("site."))
            .ToDictionaryAsync(s => s.Key, s => s.Value);

    [HttpGet("api/admin/settings"), Authorize(Policy = Permissions.SettingsManage)]
    public async Task<Dictionary<string, string?>> All()
        => await db.Settings.AsNoTracking().ToDictionaryAsync(s => s.Key, s => s.Value);

    [HttpPut("api/admin/settings"), Authorize(Policy = Permissions.SettingsManage)]
    public async Task<IActionResult> Save(Dictionary<string, string?> values)
    {
        if (values.Keys.Any(k => string.IsNullOrWhiteSpace(k) || k.Length > 128))
            return BadRequest(new { error = "کلید تنظیمات نامعتبر است." });

        // Logo: only a local upload (or empty). Minutes: a whole number 0..1440 (0 = unlimited).
        if (values.TryGetValue("site.logo_url", out var logo) && !Common.Text.IsLocalImage(logo))
            return BadRequest(new { error = "فقط تصاویر آپلودشده‌ی محلی برای لوگو مجاز هستند." });
        if (values.TryGetValue("site.favicon_url", out var favicon) && !Common.Text.IsLocalImage(favicon))
            return BadRequest(new { error = "فقط تصاویر آپلودشده‌ی محلی برای فاوآیکون مجاز هستند." });

        // Header sizes/colours (admin → Settings → Header). Ranges match the storefront's parser.
        foreach (var (key, min, max, label) in new[]
                 {
                     ("site.header_height", 48, 120, "ارتفاع نوار هدر"),
                     ("site.header_logo_height", 24, 96, "ارتفاع لوگو"),
                     ("site.header_search_width", 0, 900, "عرض کادر جستجو"),
                     ("site.header_icon_size", 16, 36, "اندازه آیکون‌ها"),
                     ("site.header_cart_height", 32, 64, "ارتفاع دکمه سبد خرید"),
                 })
        {
            if (!values.TryGetValue(key, out var v) || string.IsNullOrWhiteSpace(v)) continue;
            if (!int.TryParse(v, out var n) || n < min || n > max)
                return BadRequest(new { error = $"{label} باید عددی بین {min} تا {max} باشد." });
        }
        foreach (var key in new[] { "site.header_bg_color", "site.header_text_color", "site.header_accent_color" })
        {
            if (!values.TryGetValue(key, out var c) || string.IsNullOrWhiteSpace(c)) continue;
            if (!ColorRx().IsMatch(c)) return BadRequest(new { error = "رنگ‌های هدر باید به شکل #RRGGBB باشند." });
        }
        if (values.TryGetValue("site.header_preset", out var presetUp) && !string.IsNullOrWhiteSpace(presetUp)
            && !new[] { "brand", "dark", "light", "warm" }.Contains(presetUp))
            return BadRequest(new { error = "قالب هدر نامعتبر است." });
        if (values.TryGetValue("site.shop3d_daily_minutes", out var mins)
            && !(int.TryParse(mins, out var m) && m is >= 0 and <= 1440))
            return BadRequest(new { error = "محدودیت روزانه باید عددی بین ۰ تا ۱۴۴۰ دقیقه باشد." });

        var existing = await db.Settings.ToDictionaryAsync(s => s.Key);
        foreach (var (k, v) in values)
        {
            if (existing.TryGetValue(k, out var row)) row.Value = v;
            else db.Settings.Add(new SiteSetting { Key = k, Value = v });
        }
        await db.SaveChangesAsync();
        return NoContent();
    }
}
