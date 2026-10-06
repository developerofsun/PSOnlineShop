using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Services;

public class PermissionService(AppDbContext db)
{
    /// <summary>Union of the permissions of the given roles.</summary>
    public async Task<string[]> ForRolesAsync(IEnumerable<string> roleNames)
    {
        var names = roleNames.ToList();
        if (names.Count == 0) return [];
        return await db.RoleClaims
            .Where(c => c.ClaimType == Permissions.ClaimType && c.ClaimValue != null
                        && db.Roles.Any(r => r.Id == c.RoleId && names.Contains(r.Name!)))
            .Select(c => c.ClaimValue!)
            .Distinct()
            .ToArrayAsync();
    }
}

/// <summary>
/// JWTs only carry the user id and roles. Permissions are looked up here on every request (cached for a few
/// seconds), so editing a role or disabling a user takes effect almost immediately, without forcing a re-login.
/// </summary>
public class PermissionClaimsTransformation(AppDbContext db, PermissionService permissions, IMemoryCache cache)
    : IClaimsTransformation
{
    private const string Marker = "permissions_loaded";

    public async Task<ClaimsPrincipal> TransformAsync(ClaimsPrincipal principal)
    {
        if (principal.Identity is not ClaimsIdentity identity || !identity.IsAuthenticated) return principal;
        if (identity.HasClaim(c => c.Type == Marker)) return principal;

        var sub = identity.FindFirst("sub")?.Value;
        if (!int.TryParse(sub, out var userId)) return principal;

        var state = await cache.GetOrCreateAsync($"user-state:{userId}", async e =>
        {
            e.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(20);
            var user = await db.Users.AsNoTracking().Where(u => u.Id == userId)
                .Select(u => new { u.LockoutEnd }).FirstOrDefaultAsync();
            if (user is null) return (Valid: false, Roles: Array.Empty<string>(), Perms: Array.Empty<string>());
            var locked = user.LockoutEnd != null && user.LockoutEnd > DateTimeOffset.UtcNow;
            if (locked) return (Valid: false, Roles: Array.Empty<string>(), Perms: Array.Empty<string>());

            var roles = await (from ur in db.UserRoles
                               join r in db.Roles on ur.RoleId equals r.Id
                               where ur.UserId == userId
                               select r.Name!).ToArrayAsync();
            return (Valid: true, Roles: roles, Perms: await permissions.ForRolesAsync(roles));
        });

        // Disabled or deleted user: present an anonymous principal so every [Authorize] fails.
        if (!state.Valid) return new ClaimsPrincipal(new ClaimsIdentity());

        // Roles come from the database (not the token) so role changes apply immediately too.
        foreach (var c in identity.FindAll("role").ToList()) identity.RemoveClaim(c);
        foreach (var r in state.Roles) identity.AddClaim(new Claim("role", r));
        foreach (var p in state.Perms) identity.AddClaim(new Claim(Permissions.ClaimType, p));
        identity.AddClaim(new Claim(Marker, "1"));
        return principal;
    }
}
