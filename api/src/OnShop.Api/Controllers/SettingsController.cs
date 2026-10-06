using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Controllers;

[ApiController]
public class SettingsController(AppDbContext db) : ControllerBase
{
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
