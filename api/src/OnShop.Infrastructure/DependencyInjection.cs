using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using OnShop.Infrastructure.Identity;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        var conn = config.GetConnectionString("Default")
                   ?? throw new InvalidOperationException("ConnectionStrings:Default is not configured.");

        services.AddDbContext<AppDbContext>(o => o.UseNpgsql(conn));

        services
            .AddIdentityCore<AppUser>(o =>
            {
                o.User.RequireUniqueEmail = false; // phone is the primary login for most customers
                o.Password.RequiredLength = 8;
                o.Password.RequireNonAlphanumeric = false;
                o.Password.RequireUppercase = false;
                o.Lockout.MaxFailedAccessAttempts = 5;
                o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(10);
            })
            .AddRoles<IdentityRole<int>>()
            .AddEntityFrameworkStores<AppDbContext>();

        return services;
    }
}
