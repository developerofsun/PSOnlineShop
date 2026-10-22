using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnShop.Api.Services.ProductSync;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Controllers;

public record ProductSyncRunDto(
    int Id, DateTime StartedAt, DateTime? FinishedAt, string Status, string Trigger,
    int Fetched, int Created, int Updated, int Unchanged, int Skipped, int NotInFeed, string? Error, string? Warnings);

public record ProductSyncStatus(
    bool Configured, bool Running, bool Enabled, int IntervalMinutes,
    int PendingReview, int MissingFromFeed, List<ProductSyncRunDto> Runs);

public record ProductSyncSettingsInput(bool Enabled, int IntervalMinutes);

/// <summary>Null means "accept the suggested category".</summary>
public record ReviewCategoryInput(int? CategoryId);

[ApiController, Route("api/admin/product-sync"), Authorize(Policy = Permissions.ProductsManage)]
public class AdminProductSyncController(AppDbContext db, ProductSyncRunner runner, KyanClient kyan) : ControllerBase
{
    [HttpGet]
    public async Task<ProductSyncStatus> Status(CancellationToken ct)
    {
        var settings = await ProductSyncSettings.ReadAsync(db, ct);
        var runs = await db.ProductSyncRuns.AsNoTracking()
            .OrderByDescending(r => r.StartedAt).Take(20)
            .Select(r => new ProductSyncRunDto(r.Id, r.StartedAt, r.FinishedAt, r.Status, r.Trigger,
                r.Fetched, r.Created, r.Updated, r.Unchanged, r.Skipped, r.NotInFeed, r.Error, r.Warnings))
            .ToListAsync(ct);
        return new ProductSyncStatus(
            kyan.IsConfigured, runner.IsRunning, settings.Enabled, settings.IntervalMinutes,
            await db.Products.CountAsync(p => p.NeedsReview, ct),
            await db.Products.CountAsync(p => p.MissingFromFeed, ct),
            runs);
    }

    /// <summary>Runs a sync now and waits for it. 409 when one is already running.</summary>
    [HttpPost("run")]
    public async Task<IActionResult> Run(CancellationToken ct)
    {
        if (!kyan.IsConfigured) return BadRequest(new { error = "Kyan:BaseUrl تنظیم نشده است." });
        var run = await runner.RunAsync("Manual", ct);
        if (run is null) return Conflict(new { error = "همگام‌سازی در حال اجراست." });
        return Ok(new ProductSyncRunDto(run.Id, run.StartedAt, run.FinishedAt, run.Status, run.Trigger,
            run.Fetched, run.Created, run.Updated, run.Unchanged, run.Skipped, run.NotInFeed, run.Error, run.Warnings));
    }

    [HttpPut("settings")]
    public async Task<IActionResult> SaveSettings(ProductSyncSettingsInput input)
    {
        if (input.IntervalMinutes is < 1 or > 1440)
            return BadRequest(new { error = "فاصله‌ی همگام‌سازی باید بین ۱ تا ۱۴۴۰ دقیقه باشد." });

        var values = new Dictionary<string, string>
        {
            [ProductSyncSettings.EnabledKey] = input.Enabled ? "true" : "false",
            [ProductSyncSettings.IntervalKey] = input.IntervalMinutes.ToString()
        };
        var keys = values.Keys.ToArray();
        var existing = await db.Settings.Where(s => keys.Contains(s.Key)).ToDictionaryAsync(s => s.Key);
        foreach (var (k, v) in values)
        {
            if (existing.TryGetValue(k, out var row)) row.Value = v;
            else db.Settings.Add(new SiteSetting { Key = k, Value = v });
        }
        await db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>
    /// The admin's decision for an imported product: take the suggested category (no body value) or pick another.
    /// The product stays unpublished; publishing it in the product editor completes the review.
    /// </summary>
    [HttpPost("review/{productId:int}/category")]
    public async Task<IActionResult> SetCategory(int productId, ReviewCategoryInput input)
    {
        var product = await db.Products.FirstOrDefaultAsync(p => p.Id == productId);
        if (product is null) return NotFound();

        var categoryId = input.CategoryId ?? product.SuggestedCategoryId;
        if (categoryId is null) return BadRequest(new { error = "برای این محصول دسته‌ی پیشنهادی وجود ندارد." });
        if (!await db.Categories.AnyAsync(c => c.Id == categoryId))
            return BadRequest(new { error = "دسته‌بندی یافت نشد." });

        product.CategoryId = categoryId;
        product.SuggestedCategoryId = null;
        product.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return NoContent();
    }
}
