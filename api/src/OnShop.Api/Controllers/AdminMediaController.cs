using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnShop.Api.Common;
using OnShop.Api.Contracts;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Processing;

namespace OnShop.Api.Controllers;

public record UploadsOptions(string PhysicalPath);

/// <summary>Uploading images is needed by product, content and media editors, so any of those permissions is enough.</summary>
public static class MediaPolicy
{
    public const string Name = "media.access";
    public static readonly string[] AnyOf = [Permissions.MediaManage, Permissions.ProductsManage, Permissions.ContentManage];
}

[ApiController, Route("api/admin/media"), Authorize(Policy = MediaPolicy.Name)]
public class AdminMediaController(AppDbContext db, UploadsOptions uploads) : ControllerBase
{
    private const long MaxBytes = 10 * 1024 * 1024;
    private const int MaxDimension = 2400;

    private static readonly Dictionary<string, string> AllowedTypes = new()
    {
        [".jpg"] = "image/jpeg", [".jpeg"] = "image/jpeg", [".png"] = "image/png",
        [".webp"] = "image/webp", [".gif"] = "image/gif"
    };

    [HttpGet]
    public async Task<PagedResult<MediaDto>> List([FromQuery] int page = 1, [FromQuery] int pageSize = 30)
    {
        var (p, size) = Paging.Clamp(page, pageSize);
        var total = await db.MediaFiles.CountAsync();
        var items = await db.MediaFiles.AsNoTracking().OrderByDescending(m => m.Id)
            .Skip((p - 1) * size).Take(size)
            .Select(m => new MediaDto(m.Id, m.Url, m.OriginalName, m.ContentType, m.Size, m.CreatedAt))
            .ToListAsync();
        return new PagedResult<MediaDto>(items, total, p, size);
    }

    [HttpPost, RequestSizeLimit(MaxBytes + 1024)]
    public async Task<ActionResult<MediaDto>> Upload(IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0) return BadRequest(new { error = "فایلی ارسال نشد." });
        if (file.Length > MaxBytes) return BadRequest(new { error = "حجم فایل بیشتر از ۱۰ مگابایت است." });

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedTypes.TryGetValue(ext, out var contentType))
            return BadRequest(new { error = "فقط تصاویر JPG, PNG, WEBP و GIF مجاز هستند." });

        // Verify the file signature so a renamed .exe/.html cannot be uploaded as an image.
        var header = new byte[12];
        await using (var s = file.OpenReadStream())
        {
            var read = await s.ReadAsync(header.AsMemory(0, header.Length), ct);
            if (read < 12 || !HasImageSignature(header, ext))
                return BadRequest(new { error = "محتوای فایل با فرمت تصویر مطابقت ندارد." });
        }

        Directory.CreateDirectory(uploads.PhysicalPath);

        // Every image is stored as WebP. Animated GIFs are kept as-is because a still frame would lose the animation.
        var name = $"{Guid.NewGuid():N}.webp";
        long size;
        if (ext == ".gif")
        {
            name = $"{Guid.NewGuid():N}.gif";
            await using var target = System.IO.File.Create(Path.Combine(uploads.PhysicalPath, name));
            await using var source = file.OpenReadStream();
            await source.CopyToAsync(target, ct);
            size = file.Length;
        }
        else
        {
            try
            {
                await using var source = file.OpenReadStream();
                using var image = await Image.LoadAsync(source, ct);
                image.Mutate(x => x.AutoOrient());
                if (image.Width > MaxDimension || image.Height > MaxDimension)
                    image.Mutate(x => x.Resize(new ResizeOptions { Size = new Size(MaxDimension, MaxDimension), Mode = ResizeMode.Max }));
                var path = Path.Combine(uploads.PhysicalPath, name);
                await image.SaveAsWebpAsync(path, new WebpEncoder { Quality = 82 }, ct);
                size = new FileInfo(path).Length;
            }
            catch (Exception e) when (e is UnknownImageFormatException or InvalidImageContentException)
            {
                return BadRequest(new { error = "تصویر قابل پردازش نیست." });
            }
            contentType = "image/webp";
        }

        var media = new MediaFile
        {
            FileName = name,
            OriginalName = Path.GetFileName(file.FileName),
            Url = "/uploads/" + name,
            ContentType = contentType,
            Size = size
        };
        db.MediaFiles.Add(media);
        await db.SaveChangesAsync(ct);
        return new MediaDto(media.Id, media.Url, media.OriginalName, media.ContentType, media.Size, media.CreatedAt);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var m = await db.MediaFiles.FindAsync(id);
        if (m is null) return NotFound();
        var path = Path.Combine(uploads.PhysicalPath, Path.GetFileName(m.FileName)); // GetFileName blocks path traversal
        if (System.IO.File.Exists(path)) System.IO.File.Delete(path);
        db.MediaFiles.Remove(m);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static bool HasImageSignature(byte[] h, string ext) => ext switch
    {
        ".jpg" or ".jpeg" => h[0] == 0xFF && h[1] == 0xD8 && h[2] == 0xFF,
        ".png" => h[0] == 0x89 && h[1] == 0x50 && h[2] == 0x4E && h[3] == 0x47,
        ".gif" => h[0] == 0x47 && h[1] == 0x49 && h[2] == 0x46,
        ".webp" => h[0] == 0x52 && h[1] == 0x49 && h[2] == 0x46 && h[3] == 0x46
                   && h[8] == 0x57 && h[9] == 0x45 && h[10] == 0x42 && h[11] == 0x50,
        _ => false
    };
}
