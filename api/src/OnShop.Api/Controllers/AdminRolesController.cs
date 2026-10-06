using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnShop.Api.Contracts;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Controllers;

[ApiController, Route("api/admin/roles")]
public class AdminRolesController(RoleManager<IdentityRole<int>> roles, AppDbContext db) : ControllerBase
{
    private static bool IsSystem(string? name) => name is Domain.Roles.Admin or Domain.Roles.Customer;

    [HttpGet("permissions"), Authorize(Policy = Permissions.RolesManage)]
    public List<PermissionDto> AllPermissions() =>
        Permissions.All.Select(p => new PermissionDto(p.Key, p.Group, p.Label)).ToList();

    /// <summary>Id + name only; the users screen needs this to assign roles.</summary>
    [HttpGet("lookup"), Authorize(Policy = Permissions.UsersManage)]
    public async Task<List<RoleLookup>> Lookup() =>
        await roles.Roles.AsNoTracking().OrderBy(r => r.Name).Select(r => new RoleLookup(r.Id, r.Name!)).ToListAsync();

    [HttpGet, Authorize(Policy = Permissions.RolesManage)]
    public async Task<List<RoleDto>> List()
    {
        var all = await roles.Roles.AsNoTracking().OrderBy(r => r.Id).ToListAsync();
        var claims = await db.RoleClaims.AsNoTracking()
            .Where(c => c.ClaimType == Permissions.ClaimType).ToListAsync();
        var counts = await db.UserRoles.GroupBy(ur => ur.RoleId)
            .Select(g => new { RoleId = g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.RoleId, x => x.Count);

        return all.Select(r => new RoleDto(
            r.Id, r.Name!, IsSystem(r.Name), counts.GetValueOrDefault(r.Id),
            claims.Where(c => c.RoleId == r.Id).Select(c => c.ClaimValue!).OrderBy(x => x).ToArray())).ToList();
    }

    [HttpPost, Authorize(Policy = Permissions.RolesManage)]
    public async Task<IActionResult> Create(RoleInput input)
    {
        var error = Validate(input);
        if (error is not null) return BadRequest(new { error });
        var mine = User.FindAll(Permissions.ClaimType).Select(c => c.Value).ToHashSet();
        if (input.Permissions.Any(p => !mine.Contains(p))) return Forbid();

        var name = input.Name.Trim();
        if (await roles.RoleExistsAsync(name)) return BadRequest(new { error = "نقشی با این نام وجود دارد." });

        var role = new IdentityRole<int>(name);
        var result = await roles.CreateAsync(role);
        if (!result.Succeeded) return BadRequest(new { error = string.Join(" ", result.Errors.Select(e => e.Description)) });
        await SetPermissions(role, input.Permissions);
        return NoContent();
    }

    [HttpPut("{id:int}"), Authorize(Policy = Permissions.RolesManage)]
    public async Task<IActionResult> Update(int id, RoleInput input)
    {
        var role = await roles.FindByIdAsync(id.ToString());
        if (role is null) return NotFound();
        if (role.Name == Domain.Roles.Admin)
            return BadRequest(new { error = "نقش «Admin» همیشه همه دسترسی‌ها را دارد و قابل ویرایش نیست." });

        var error = Validate(input);
        if (error is not null) return BadRequest(new { error });

        // Privilege-escalation guard: you cannot grant a permission you do not hold yourself.
        var mine = User.FindAll(Permissions.ClaimType).Select(c => c.Value).ToHashSet();
        if (input.Permissions.Any(p => !mine.Contains(p)))
            return Forbid();

        if (!IsSystem(role.Name))
        {
            var name = input.Name.Trim();
            if (!string.Equals(name, role.Name, StringComparison.Ordinal))
            {
                if (await roles.RoleExistsAsync(name)) return BadRequest(new { error = "نقشی با این نام وجود دارد." });
                role.Name = name;
                await roles.SetRoleNameAsync(role, name);
                await roles.UpdateAsync(role);
            }
        }
        await SetPermissions(role, input.Permissions);
        return NoContent();
    }

    [HttpDelete("{id:int}"), Authorize(Policy = Permissions.RolesManage)]
    public async Task<IActionResult> Delete(int id)
    {
        var role = await roles.FindByIdAsync(id.ToString());
        if (role is null) return NotFound();
        if (IsSystem(role.Name)) return BadRequest(new { error = "نقش‌های سیستمی قابل حذف نیستند." });
        if (await db.UserRoles.AnyAsync(ur => ur.RoleId == id))
            return BadRequest(new { error = "ابتدا کاربران این نقش را به نقش دیگری منتقل کنید." });
        await roles.DeleteAsync(role);
        return NoContent();
    }

    private static string? Validate(RoleInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 50) return "نام نقش نامعتبر است.";
        if (input.Permissions.Any(p => !Permissions.Keys.Contains(p))) return "دسترسی نامعتبر است.";
        return null;
    }

    private async Task SetPermissions(IdentityRole<int> role, string[] wanted)
    {
        var current = (await roles.GetClaimsAsync(role)).Where(c => c.Type == Permissions.ClaimType).ToList();
        foreach (var c in current.Where(c => !wanted.Contains(c.Value)))
            await roles.RemoveClaimAsync(role, c);
        foreach (var key in wanted.Distinct().Where(k => current.All(c => c.Value != k)))
            await roles.AddClaimAsync(role, new Claim(Permissions.ClaimType, key));
    }
}
