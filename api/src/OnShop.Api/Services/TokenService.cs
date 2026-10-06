using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using OnShop.Infrastructure.Identity;

namespace OnShop.Api.Services;

public class JwtOptions
{
    public string Issuer { get; set; } = "onshop";
    public string Audience { get; set; } = "onshop";
    public string Key { get; set; } = "";
    public int ExpiresMinutes { get; set; } = 60 * 12;
}

public class TokenService(Microsoft.Extensions.Options.IOptions<JwtOptions> options)
{
    private readonly JwtOptions _o = options.Value;

    public (string token, DateTime expires) Create(AppUser user, IEnumerable<string> roles)
    {
        var expires = DateTime.UtcNow.AddMinutes(_o.ExpiresMinutes);
        var claims = new List<Claim>
        {
            new("sub", user.Id.ToString()),
            new("name", user.FullName ?? user.UserName ?? "")
        };
        claims.AddRange(roles.Select(r => new Claim("role", r)));

        var descriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Issuer = _o.Issuer,
            Audience = _o.Audience,
            Expires = expires,
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_o.Key)), SecurityAlgorithms.HmacSha256)
        };
        return (new JsonWebTokenHandler().CreateToken(descriptor), expires);
    }
}
