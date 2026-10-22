using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Controllers;

public record Shop3dStatus(bool Enabled, int LimitMinutes, int UsedSeconds, int? RemainingSeconds);

/// <summary>
/// Daily time limit for the 3D store, counted on the server. The page calls <c>start</c> when the store opens and
/// <c>beat</c> about every 10 seconds while it is visible. Time is added from the clock between beats (capped), so two
/// open tabs cannot double count and a client cannot claim more time than really passed.
/// The limit applies to signed-in customers; if the admin lets guests in, guests are not limited.
/// </summary>
[ApiController, Route("api/me/shop3d"), Authorize]
public class Shop3dController(AppDbContext db) : ControllerBase
{
    private const int MaxGapSeconds = 30; // the most one beat may add
    private const int StaleSeconds = 60; // beats further apart than this start a new stretch (nothing is added)

    private int UserId => int.TryParse(User.FindFirstValue("sub"), out var id) ? id : 0;

    [HttpGet]
    public async Task<Shop3dStatus> Status() => await BuildAsync(await GetRowAsync(create: false), await LimitAsync());

    [HttpPost("start")]
    public async Task<Shop3dStatus> Start()
    {
        var limit = await LimitAsync();
        var row = await GetRowAsync(create: true);
        // The customer has just entered the store: a new stretch begins now. (Time spent on the launcher page, or between
        // two visits, must never be added by the next beat.)
        row.LastBeatAt = DateTime.UtcNow;
        await SaveAsync();
        return await BuildAsync(row, limit);
    }

    [HttpPost("beat")]
    public async Task<Shop3dStatus> Beat()
    {
        var limit = await LimitAsync();
        var row = await GetRowAsync(create: true);
        var now = DateTime.UtcNow;
        if (row.LastBeatAt is DateTime last && (now - last).TotalSeconds <= StaleSeconds)
            row.Seconds += (int)Math.Clamp((now - last).TotalSeconds, 0, MaxGapSeconds);
        row.LastBeatAt = now;
        await SaveAsync();
        return await BuildAsync(row, limit);
    }

    // ---------------------------------------------------------------- helpers

    private async Task<int> LimitAsync()
    {
        var v = await db.Settings.AsNoTracking().Where(s => s.Key == "site.shop3d_daily_minutes").Select(s => s.Value).FirstOrDefaultAsync();
        return int.TryParse(v, out var m) && m > 0 ? Math.Min(m, 1440) : 0; // 0 = unlimited
    }

    private async Task<Shop3dStatus> BuildAsync(Shop3dUsage? row, int limitMinutes)
    {
        var enabled = await db.Settings.AsNoTracking().Where(s => s.Key == "site.shop3d_enabled").Select(s => s.Value).FirstOrDefaultAsync() != "false";
        var used = row?.Seconds ?? 0;
        int? remaining = limitMinutes > 0 ? Math.Max(0, limitMinutes * 60 - used) : null;
        return new Shop3dStatus(enabled, limitMinutes, used, remaining);
    }

    private async Task<Shop3dUsage?> GetRowAsync(bool create)
    {
        var day = Today();
        var uid = UserId;
        var row = await db.Shop3dUsages.FirstOrDefaultAsync(x => x.UserId == uid && x.Day == day);
        if (row is null && create)
        {
            row = new Shop3dUsage { UserId = uid, Day = day };
            db.Shop3dUsages.Add(row);
        }
        return row;
    }

    /// <summary>Saves; if two requests created today's row at once, reload the winner and keep going.</summary>
    private async Task SaveAsync()
    {
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            db.ChangeTracker.Clear();
        }
    }

    /// <summary>Calendar day in Tehran time: "the daily limit" resets at local midnight.</summary>
    private static string Today()
    {
        TimeZoneInfo? tz = null;
        foreach (var id in new[] { "Asia/Tehran", "Iran Standard Time" })
        {
            try { tz = TimeZoneInfo.FindSystemTimeZoneById(id); break; }
            catch (TimeZoneNotFoundException) { }
            catch (InvalidTimeZoneException) { }
        }
        tz ??= TimeZoneInfo.CreateCustomTimeZone("irst", TimeSpan.FromHours(3.5), "IRST", "IRST");
        return TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }
}
