using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnShop.Api.Common;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Controllers;

/// <summary>
/// "Tell me when you launch" phone numbers, collected while the site runs in test mode.
/// The storefront shows the form only when the site.test_mode_enabled setting is on; the endpoint
/// checks the same flag, so a disabled test mode cannot collect anything either.
/// </summary>
[ApiController]
[Route("api")]
public class NotifyController(AppDbContext db, ILogger<NotifyController> log) : ControllerBase
{
    public record SignupRequest(string? Phone, string? Source);
    public record SignupResponse(bool Ok, string? Message);

    [HttpPost("notify/signup"), AllowAnonymous]
    public async Task<ActionResult<SignupResponse>> Signup(SignupRequest req, CancellationToken ct)
    {
        var enabled = await db.Settings
            .Where(s => s.Key == "site.test_mode_enabled")
            .Select(s => s.Value)
            .FirstOrDefaultAsync(ct);
        if (enabled != "true")
            return BadRequest(new SignupResponse(false, "این فرم در حال حاضر فعال نیست."));

        var phone = Text.NormalizePhone(req.Phone);
        if (!Text.IsMobile(phone))
            return BadRequest(new SignupResponse(false, "شماره موبایل معتبر نیست."));

        // Unique index on Phone: a repeat signup is a success, not an error the visitor should see.
        if (await db.NotifySignups.AnyAsync(s => s.Phone == phone, ct))
            return new SignupResponse(true, null);

        var source = req.Source is { Length: > 0 } src ? src[..Math.Min(src.Length, 64)] : null;
        db.NotifySignups.Add(new NotifySignup { Phone = phone, Source = source });
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Two requests for the same number at the same moment: the unique index rejected the second.
            // That is still a successful signup from the visitor's point of view.
            log.LogInformation("Duplicate notify signup for {Phone} ignored.", phone);
        }
        return new SignupResponse(true, null);
    }

    [HttpGet("admin/notify/signups"), Authorize(Policy = Permissions.SettingsManage)]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var rows = await db.NotifySignups.AsNoTracking()
            .OrderByDescending(s => s.CreatedAt)
            .Select(s => new { s.Id, s.Phone, s.Source, s.CreatedAt })
            .ToListAsync(ct);
        return Ok(rows);
    }

    [HttpDelete("admin/notify/signups/{id:int}"), Authorize(Policy = Permissions.SettingsManage)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        await db.NotifySignups.Where(s => s.Id == id).ExecuteDeleteAsync(ct);
        return NoContent();
    }

    /// <summary>CSV export so the list can go into an SMS panel. One phone number per line.</summary>
    [HttpGet("admin/notify/signups.csv"), Authorize(Policy = Permissions.SettingsManage)]
    public async Task<IActionResult> Export(CancellationToken ct)
    {
        var phones = await db.NotifySignups.AsNoTracking()
            .OrderBy(s => s.CreatedAt)
            .Select(s => s.Phone)
            .ToListAsync(ct);
        return File(System.Text.Encoding.UTF8.GetBytes(string.Join("\n", phones)),
            "text/csv", "notify-signups.csv");
    }
}
