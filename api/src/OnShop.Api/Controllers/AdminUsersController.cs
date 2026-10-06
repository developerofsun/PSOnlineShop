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

[ApiController, Route("api/admin/users"), Authorize(Policy = Permissions.UsersManage)]
public class AdminUsersController(UserManager<AppUser> users, RoleManager<IdentityRole<int>> roles, AppDbContext db)
    : ControllerBase
{
    private int CurrentUserId => int.TryParse(User.FindFirstValue("sub"), out var id) ? id : 0;
    private static bool IsDisabled(AppUser u) => u.LockoutEnd != null && u.LockoutEnd > DateTimeOffset.UtcNow;

    [HttpGet]
    public async Task<PagedResult<UserListItem>> List([FromQuery] string? q, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var (p, size) = Paging.Clamp(page, pageSize);
        var query = db.Users.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(q))
        {
            var pattern = $"%{Text.EscapeLike(Text.Normalize(q).Trim())}%";
            query = query.Where(u => EF.Functions.ILike(u.FullName, pattern)
                                     || (u.UserName != null && EF.Functions.ILike(u.UserName, pattern))
                                     || (u.Email != null && EF.Functions.ILike(u.Email, pattern))
                                     || (u.PhoneNumber != null && EF.Functions.ILike(u.PhoneNumber, pattern)));
        }

        var total = await query.CountAsync();
        var rows = await query.OrderByDescending(u => u.Id).Skip((p - 1) * size).Take(size).ToListAsync();
        var ids = rows.Select(u => u.Id).ToList();
        var roleRows = await (from ur in db.UserRoles
                              join r in db.Roles on ur.RoleId equals r.Id
                              where ids.Contains(ur.UserId)
                              select new { ur.UserId, Name = r.Name! }).ToListAsync();

        var items = rows.Select(u => new UserListItem(
            u.Id, u.FullName, u.UserName, u.Email, u.PhoneNumber,
            roleRows.Where(r => r.UserId == u.Id).Select(r => r.Name).ToArray(), IsDisabled(u), u.CreatedAt)).ToList();
        return new PagedResult<UserListItem>(items, total, p, size);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<UserListItem>> Get(int id)
    {
        var u = await users.FindByIdAsync(id.ToString());
        if (u is null) return NotFound();
        return new UserListItem(u.Id, u.FullName, u.UserName, u.Email, u.PhoneNumber,
            (await users.GetRolesAsync(u)).ToArray(), IsDisabled(u), u.CreatedAt);
    }

    [HttpPost]
    public async Task<ActionResult<UserListItem>> Create(UserInput input)
    {
        var error = await ValidateAsync(input, null);
        if (error is not null) return BadRequest(new { error });
        if (string.IsNullOrWhiteSpace(input.Password)) return BadRequest(new { error = "رمز عبور الزامی است." });

        var user = new AppUser
        {
            UserName = Text.Normalize(input.UserName).Trim(),
            FullName = input.FullName.Trim(),
            Email = string.IsNullOrWhiteSpace(input.Email) ? null : input.Email.Trim(),
            PhoneNumber = string.IsNullOrWhiteSpace(input.Phone) ? null : Text.NormalizePhone(input.Phone)
        };
        var result = await users.CreateAsync(user, input.Password);
        if (!result.Succeeded) return BadRequest(new { error = string.Join(" ", result.Errors.Select(e => e.Description)) });

        if (input.Roles.Length > 0) await users.AddToRolesAsync(user, input.Roles);
        if (!input.IsActive) await users.SetLockoutEndDateAsync(user, DateTimeOffset.MaxValue);
        return await Get(user.Id);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<UserListItem>> Update(int id, UserInput input)
    {
        var user = await users.FindByIdAsync(id.ToString());
        if (user is null) return NotFound();
        if (id != CurrentUserId && !await CanManageAsync(user)) return Forbid();

        var error = await ValidateAsync(input, user);
        if (error is not null) return BadRequest(new { error });

        var isSelf = id == CurrentUserId;
        if (isSelf && !input.IsActive) return BadRequest(new { error = "نمی‌توانید حساب خودتان را غیرفعال کنید." });

        // Keep at least one active administrator.
        var wasAdmin = await users.IsInRoleAsync(user, Domain.Roles.Admin);
        if (wasAdmin && (!input.Roles.Contains(Domain.Roles.Admin) || !input.IsActive)
            && await ActiveAdminCountAsync(excluding: id) == 0)
            return BadRequest(new { error = "باید حداقل یک مدیر فعال در سیستم باقی بماند." });

        user.FullName = input.FullName.Trim();
        user.UserName = Text.Normalize(input.UserName).Trim();
        user.Email = string.IsNullOrWhiteSpace(input.Email) ? null : input.Email.Trim();
        user.PhoneNumber = string.IsNullOrWhiteSpace(input.Phone) ? null : Text.NormalizePhone(input.Phone);
        var update = await users.UpdateAsync(user);
        if (!update.Succeeded) return BadRequest(new { error = string.Join(" ", update.Errors.Select(e => e.Description)) });

        if (!string.IsNullOrWhiteSpace(input.Password))
        {
            await users.RemovePasswordAsync(user);
            var pw = await users.AddPasswordAsync(user, input.Password);
            if (!pw.Succeeded) return BadRequest(new { error = string.Join(" ", pw.Errors.Select(e => e.Description)) });
        }

        var current = await users.GetRolesAsync(user);
        var toRemove = current.Except(input.Roles).ToList();
        var toAdd = input.Roles.Except(current).ToList();
        if (toRemove.Count > 0) await users.RemoveFromRolesAsync(user, toRemove);
        if (toAdd.Count > 0) await users.AddToRolesAsync(user, toAdd);

        await users.SetLockoutEndDateAsync(user, input.IsActive ? null : DateTimeOffset.MaxValue);
        return await Get(id);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        if (id == CurrentUserId) return BadRequest(new { error = "نمی‌توانید حساب خودتان را حذف کنید." });
        var user = await users.FindByIdAsync(id.ToString());
        if (user is null) return NotFound();
        if (!await CanManageAsync(user)) return Forbid();
        if (await users.IsInRoleAsync(user, Domain.Roles.Admin) && await ActiveAdminCountAsync(excluding: id) == 0)
            return BadRequest(new { error = "باید حداقل یک مدیر فعال در سیستم باقی بماند." });

        var result = await users.DeleteAsync(user);
        return result.Succeeded ? NoContent() : BadRequest(new { error = string.Join(" ", result.Errors.Select(e => e.Description)) });
    }

    /// <summary>True when every permission of the target's current roles is also held by the caller.</summary>
    private async Task<bool> CanManageAsync(AppUser target)
    {
        var mine = User.FindAll(Permissions.ClaimType).Select(c => c.Value).ToHashSet();
        var targetRoles = await users.GetRolesAsync(target);
        var need = await (from c in db.RoleClaims
                          join r in db.Roles on c.RoleId equals r.Id
                          where targetRoles.Contains(r.Name!) && c.ClaimType == Permissions.ClaimType
                          select c.ClaimValue!).ToListAsync();
        return need.All(mine.Contains);
    }

    private async Task<int> ActiveAdminCountAsync(int excluding) =>
        await (from ur in db.UserRoles
               join r in db.Roles on ur.RoleId equals r.Id
               join u in db.Users on ur.UserId equals u.Id
               where r.Name == Domain.Roles.Admin && u.Id != excluding
                     && (u.LockoutEnd == null || u.LockoutEnd <= DateTimeOffset.UtcNow)
               select u.Id).CountAsync();

    private async Task<string?> ValidateAsync(UserInput input, AppUser? existing)
    {
        if (string.IsNullOrWhiteSpace(input.FullName)) return "نام الزامی است.";
        if (string.IsNullOrWhiteSpace(input.UserName)) return "نام کاربری الزامی است.";

        var userName = Text.Normalize(input.UserName).Trim();
        var dup = await users.FindByNameAsync(userName);
        if (dup is not null && dup.Id != existing?.Id) return "این نام کاربری قبلاً استفاده شده است.";

        if (!string.IsNullOrWhiteSpace(input.Phone) && !Text.IsMobile(Text.NormalizePhone(input.Phone)))
            return "شماره موبایل نامعتبر است.";

        // Roles must exist, and you may only hand out roles whose permissions you already hold
        // (otherwise a user manager could make themselves an administrator).
        var known = await roles.Roles.AsNoTracking().Select(r => r.Name!).ToListAsync();
        if (input.Roles.Any(r => !known.Contains(r))) return "نقش نامعتبر است.";

        var mine = User.FindAll(Permissions.ClaimType).Select(c => c.Value).ToHashSet();
        foreach (var roleName in input.Roles)
        {
            var need = await (from c in db.RoleClaims
                              join r in db.Roles on c.RoleId equals r.Id
                              where r.Name == roleName && c.ClaimType == Permissions.ClaimType
                              select c.ClaimValue!).ToListAsync();
            if (need.Any(p => !mine.Contains(p)))
                return $"شما اجازه‌ی تخصیص نقش «{roleName}» را ندارید.";
        }
        return null;
    }
}
