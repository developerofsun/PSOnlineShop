using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnShop.Api.Common;
using OnShop.Api.Contracts;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Controllers;

[ApiController, Route("api/admin/stories"), Authorize(Policy = Permissions.ContentManage)]
public class AdminStoriesController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<List<StoryRow>> List() =>
        await db.Stories.AsNoTracking().OrderBy(s => s.SortOrder).ThenByDescending(s => s.Id)
            .Select(s => new StoryRow(s.Id, s.Name, s.IsActive, s.SortOrder, s.Items.Count, s.ExpiresAt)).ToListAsync();

    [HttpGet("{id:int}")]
    public async Task<ActionResult<StoryDetail>> Get(int id)
    {
        var s = await db.Stories.AsNoTracking().Include(x => x.Items).FirstOrDefaultAsync(x => x.Id == id);
        if (s is null) return NotFound();
        return new StoryDetail(s.Id, s.Name, s.IsActive, s.SortOrder, s.CoverUrl, Localized.Parse(s.TitleJson), s.ExpiresAt,
            s.Items.OrderBy(i => i.SortOrder).Select(i =>
                new StoryItemInput(i.ImageUrl, i.LinkUrl, Localized.Parse(i.CaptionJson), i.DurationSec)).ToList());
    }

    [HttpPost]
    public async Task<ActionResult<StoryDetail>> Create(StoryInput input)
    {
        var s = new Story();
        var error = Apply(s, input);
        if (error is not null) return BadRequest(new { error });
        db.Stories.Add(s);
        await db.SaveChangesAsync();
        return await Get(s.Id);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<StoryDetail>> Update(int id, StoryInput input)
    {
        var s = await db.Stories.Include(x => x.Items).FirstOrDefaultAsync(x => x.Id == id);
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
        var s = await db.Stories.FindAsync(id);
        if (s is null) return NotFound();
        db.Stories.Remove(s);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private string? Apply(Story s, StoryInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Name)) return "نام استوری الزامی است.";
        if (!Text.IsLocalImage(input.CoverUrl)) return "فقط تصاویر آپلودشده‌ی محلی مجاز هستند.";
        if (input.Items.Count is 0 or > 30) return "هر استوری باید بین ۱ تا ۳۰ اسلاید داشته باشد.";
        foreach (var i in input.Items)
        {
            if (!Text.IsLocalImage(i.ImageUrl)) return "فقط تصاویر آپلودشده‌ی محلی مجاز هستند.";
            if (!Text.IsSafeLink(i.LinkUrl)) return "لینک نامعتبر است.";
            var hasText = i.Caption?.Values.Any(v => !string.IsNullOrWhiteSpace(v)) == true;
            if (string.IsNullOrEmpty(i.ImageUrl) && !hasText) return "هر اسلاید باید تصویر یا متن داشته باشد.";
        }

        s.Name = input.Name.Trim();
        s.IsActive = input.IsActive;
        s.SortOrder = input.SortOrder;
        s.CoverUrl = input.CoverUrl ?? "";
        s.TitleJson = Localized.ToJson(input.Title);
        s.ExpiresAt = input.ExpiresAt is DateTime d
            ? (d.Kind == DateTimeKind.Unspecified ? DateTime.SpecifyKind(d, DateTimeKind.Utc) : d.ToUniversalTime())
            : null;

        db.StoryItems.RemoveRange(s.Items);
        s.Items.Clear();
        var order = 0;
        foreach (var i in input.Items)
            s.Items.Add(new StoryItem
            {
                SortOrder = order++,
                ImageUrl = i.ImageUrl ?? "",
                LinkUrl = string.IsNullOrWhiteSpace(i.LinkUrl) ? null : i.LinkUrl.Trim(),
                CaptionJson = Localized.ToJson(i.Caption),
                DurationSec = Math.Clamp(i.DurationSec, 3, 15)
            });
        return null;
    }
}
