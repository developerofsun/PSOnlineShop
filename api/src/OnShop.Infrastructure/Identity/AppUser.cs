using Microsoft.AspNetCore.Identity;

namespace OnShop.Infrastructure.Identity;

public class AppUser : IdentityUser<int>
{
    public string FullName { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
