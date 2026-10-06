using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnShop.Api.Common;
using OnShop.Api.Contracts;
using OnShop.Api.Services;
using OnShop.Domain;
using OnShop.Infrastructure.Identity;

namespace OnShop.Api.Controllers;

[ApiController, Route("api/auth")]
public class AuthController(UserManager<AppUser> users, TokenService tokens, PermissionService permissions) : ControllerBase
{
    [HttpPost("login"), AllowAnonymous]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest req)
    {
        var login = Text.Normalize(req.Login).Trim();
        var user = await users.FindByNameAsync(login)
                   ?? await users.FindByEmailAsync(login)
                   ?? await users.Users.FirstOrDefaultAsync(u => u.PhoneNumber == Text.NormalizePhone(login));

        // Same message for unknown user / wrong password to avoid user enumeration.
        const string bad = "نام کاربری یا رمز عبور اشتباه است.";
        if (user is null) return Unauthorized(new { error = bad });
        if (await users.IsLockedOutAsync(user))
            return StatusCode(423, new { error = "حساب کاربری غیرفعال یا موقتاً قفل شده است." });

        if (!await users.CheckPasswordAsync(user, req.Password))
        {
            await users.AccessFailedAsync(user);
            return Unauthorized(new { error = bad });
        }

        await users.ResetAccessFailedCountAsync(user);
        return Ok(await BuildResponse(user));
    }

    [HttpPost("register"), AllowAnonymous]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest req)
    {
        var phone = Text.NormalizePhone(req.Phone);
        if (!Text.IsMobile(phone)) return BadRequest(new { error = "شماره موبایل نامعتبر است." });
        if (string.IsNullOrWhiteSpace(req.FullName)) return BadRequest(new { error = "نام را وارد کنید." });

        var user = new AppUser { UserName = phone, PhoneNumber = phone, FullName = req.FullName.Trim() };
        var result = await users.CreateAsync(user, req.Password);
        if (!result.Succeeded)
            return BadRequest(new { error = string.Join(" ", result.Errors.Select(e => e.Description)) });

        await users.AddToRoleAsync(user, Roles.Customer);
        return Ok(await BuildResponse(user));
    }

    [HttpGet("me"), Authorize]
    public async Task<ActionResult<UserInfo>> Me()
    {
        var id = User.FindFirstValue("sub");
        var user = id is null ? null : await users.FindByIdAsync(id);
        if (user is null) return Unauthorized();
        return Ok(await ToInfo(user));
    }

    private async Task<UserInfo> ToInfo(AppUser u)
    {
        var roles = (await users.GetRolesAsync(u)).ToArray();
        var perms = await permissions.ForRolesAsync(roles);
        return new UserInfo(u.Id, u.FullName, u.UserName, u.PhoneNumber, u.Email, roles, perms);
    }

    private async Task<AuthResponse> BuildResponse(AppUser user)
    {
        var roles = await users.GetRolesAsync(user);
        var (token, expires) = tokens.Create(user, roles);
        return new AuthResponse(token, expires, await ToInfo(user));
    }
}
