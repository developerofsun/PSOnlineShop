using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnShop.Api.Common;
using OnShop.Api.Contracts;
using OnShop.Domain;
using OnShop.Infrastructure.Identity;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Controllers;

/// <summary>Everything a logged-in customer can see or change about their own account.</summary>
[ApiController, Route("api/me"), Authorize]
public class MeController(UserManager<AppUser> users, AppDbContext db) : ControllerBase
{
    private int UserId => int.TryParse(User.FindFirstValue("sub"), out var id) ? id : 0;

    // ---------------- profile ----------------

    [HttpGet("profile")]
    public async Task<ActionResult<ProfileDto>> Profile()
    {
        var u = await users.FindByIdAsync(UserId.ToString());
        return u is null ? Unauthorized() : new ProfileDto(u.FullName, u.PhoneNumber, u.Email, u.CreatedAt);
    }

    [HttpPut("profile")]
    public async Task<ActionResult<ProfileDto>> UpdateProfile(ProfileInput input)
    {
        var u = await users.FindByIdAsync(UserId.ToString());
        if (u is null) return Unauthorized();
        if (string.IsNullOrWhiteSpace(input.FullName)) return BadRequest(new { error = "نام را وارد کنید." });

        u.FullName = input.FullName.Trim();
        u.Email = string.IsNullOrWhiteSpace(input.Email) ? null : input.Email.Trim();
        var result = await users.UpdateAsync(u);
        if (!result.Succeeded) return BadRequest(new { error = string.Join(" ", result.Errors.Select(e => e.Description)) });
        return new ProfileDto(u.FullName, u.PhoneNumber, u.Email, u.CreatedAt);
    }

    [HttpPut("password")]
    public async Task<IActionResult> ChangePassword(PasswordInput input)
    {
        var u = await users.FindByIdAsync(UserId.ToString());
        if (u is null) return Unauthorized();
        var result = await users.ChangePasswordAsync(u, input.CurrentPassword, input.NewPassword);
        return result.Succeeded
            ? NoContent()
            : BadRequest(new { error = string.Join(" ", result.Errors.Select(e => e.Description)) });
    }

    // ---------------- orders and payments ----------------

    [HttpGet("orders")]
    public async Task<PagedResult<OrderListItem>> Orders([FromQuery] int page = 1, [FromQuery] int pageSize = 10)
    {
        var (p, size) = Paging.Clamp(page, pageSize, 50);
        var query = db.Orders.AsNoTracking().Where(o => o.UserId == UserId);
        var total = await query.CountAsync();
        var items = await query.OrderByDescending(o => o.Id).Skip((p - 1) * size).Take(size)
            .Select(o => new OrderListItem(o.Id, o.Number, o.Status, o.Total, o.FullName, o.Phone, o.CreatedAt, o.PaidAt))
            .ToListAsync();
        return new PagedResult<OrderListItem>(items, total, p, size);
    }

    [HttpGet("orders/{number}")]
    public async Task<ActionResult<OrderDetailDto>> Order(string number)
    {
        var o = await db.Orders.AsNoTracking().Include(x => x.Items)
            .FirstOrDefaultAsync(x => x.Number == number && x.UserId == UserId);
        return o is null ? NotFound() : AdminOrdersController.ToDetail(o);
    }

    [HttpGet("payments")]
    public async Task<List<PaymentDto>> Payments() =>
        await db.Orders.AsNoTracking().Where(o => o.UserId == UserId && o.PaidAt != null)
            .OrderByDescending(o => o.PaidAt)
            .Select(o => new PaymentDto(o.Number, o.Total, o.PaymentRef, o.PaidAt!.Value, o.Status.ToString()))
            .ToListAsync();

    // ---------------- addresses ----------------

    private static AddressDto ToDto(Address a) =>
        new(a.Id, a.Title, a.FullName, a.Phone, a.Province, a.City, a.Line, a.PostalCode, a.IsDefault, a.Lat, a.Lng);

    [HttpGet("addresses")]
    public async Task<List<AddressDto>> Addresses() =>
        (await db.Addresses.AsNoTracking().Where(a => a.UserId == UserId)
            .OrderByDescending(a => a.IsDefault).ThenByDescending(a => a.Id).ToListAsync()).Select(ToDto).ToList();

    [HttpPost("addresses")]
    public async Task<ActionResult<AddressDto>> AddAddress(AddressInput input)
    {
        var a = new Address { UserId = UserId };
        var error = Apply(a, input);
        if (error is not null) return BadRequest(new { error });

        var hasAny = await db.Addresses.AnyAsync(x => x.UserId == UserId);
        if (a.IsDefault || !hasAny)
        {
            a.IsDefault = true;
            await ClearDefaultAsync();
        }
        db.Addresses.Add(a);
        await db.SaveChangesAsync();
        return ToDto(a);
    }

    [HttpPut("addresses/{id:int}")]
    public async Task<ActionResult<AddressDto>> UpdateAddress(int id, AddressInput input)
    {
        var a = await db.Addresses.FirstOrDefaultAsync(x => x.Id == id && x.UserId == UserId);
        if (a is null) return NotFound();
        var error = Apply(a, input);
        if (error is not null) return BadRequest(new { error });
        if (a.IsDefault) await ClearDefaultAsync(except: id);
        await db.SaveChangesAsync();
        return ToDto(a);
    }

    [HttpDelete("addresses/{id:int}")]
    public async Task<IActionResult> DeleteAddress(int id)
    {
        var a = await db.Addresses.FirstOrDefaultAsync(x => x.Id == id && x.UserId == UserId);
        if (a is null) return NotFound();
        db.Addresses.Remove(a);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private Task ClearDefaultAsync(int except = 0) =>
        db.Addresses.Where(x => x.UserId == UserId && x.IsDefault && x.Id != except)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.IsDefault, false));

    private static string? Apply(Address a, AddressInput i)
    {
        var phone = Text.NormalizePhone(i.Phone);
        var postal = Text.Normalize(i.PostalCode).Trim();
        if (string.IsNullOrWhiteSpace(i.FullName) || string.IsNullOrWhiteSpace(i.Province)
            || string.IsNullOrWhiteSpace(i.City) || string.IsNullOrWhiteSpace(i.Line)) return "اطلاعات آدرس کامل نیست.";
        if (!Text.IsMobile(phone)) return "شماره موبایل نامعتبر است.";
        if (!Text.IsPostalCode(postal)) return "کد پستی باید ۱۰ رقم باشد.";
        if (!Text.IsValidCoordinate(i.Lat, i.Lng)) return "موقعیت روی نقشه نامعتبر است.";
        a.Lat = i.Lat;
        a.Lng = i.Lng;
        a.Title = string.IsNullOrWhiteSpace(i.Title) ? "آدرس" : i.Title.Trim();
        a.FullName = i.FullName.Trim();
        a.Phone = phone;
        a.Province = i.Province.Trim();
        a.City = i.City.Trim();
        a.Line = i.Line.Trim();
        a.PostalCode = postal;
        a.IsDefault = i.IsDefault;
        return null;
    }

    // ---------------- favorites ----------------

    [HttpGet("favorites")]
    public async Task<List<int>> Favorites() =>
        await db.Favorites.AsNoTracking().Where(f => f.UserId == UserId)
            .OrderByDescending(f => f.CreatedAt).Select(f => f.ProductId).ToListAsync();

    /// <summary>Adds several favorites at once (used to merge a guest's local favorites after login).</summary>
    [HttpPost("favorites/merge")]
    public async Task<List<int>> MergeFavorites(List<int> ids)
    {
        var wanted = ids.Distinct().Take(200).ToList();
        var valid = await db.Products.Where(p => wanted.Contains(p.Id)).Select(p => p.Id).ToListAsync();
        var have = await db.Favorites.Where(f => f.UserId == UserId).Select(f => f.ProductId).ToListAsync();
        foreach (var id in valid.Except(have))
            db.Favorites.Add(new Favorite { UserId = UserId, ProductId = id });
        await db.SaveChangesAsync();
        return await Favorites();
    }

    [HttpPut("favorites/{productId:int}")]
    public async Task<IActionResult> AddFavorite(int productId)
    {
        if (!await db.Products.AnyAsync(p => p.Id == productId)) return NotFound();
        if (!await db.Favorites.AnyAsync(f => f.UserId == UserId && f.ProductId == productId))
        {
            db.Favorites.Add(new Favorite { UserId = UserId, ProductId = productId });
            await db.SaveChangesAsync();
        }
        return NoContent();
    }

    [HttpDelete("favorites/{productId:int}")]
    public async Task<IActionResult> RemoveFavorite(int productId)
    {
        await db.Favorites.Where(f => f.UserId == UserId && f.ProductId == productId).ExecuteDeleteAsync();
        return NoContent();
    }
}
