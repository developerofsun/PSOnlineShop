using System.Text;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using OnShop.Domain;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using OnShop.Api.Controllers;
using OnShop.Api.Services;
using OnShop.Infrastructure;
using OnShop.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// ---------- Services ----------
builder.Services.AddInfrastructure(config);

builder.Services.Configure<JwtOptions>(config.GetSection("Jwt"));
var jwt = config.GetSection("Jwt").Get<JwtOptions>() ?? new JwtOptions();
if (jwt.Key.Length < 32)
    throw new InvalidOperationException("Jwt:Key must be at least 32 characters. Set it via user-secrets or the Jwt__Key environment variable.");
builder.Services.AddScoped<TokenService>();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false; // keep "sub", "role", "name" as issued
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true, ValidIssuer = jwt.Issuer,
            ValidateAudience = true, ValidAudience = jwt.Audience,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),
            NameClaimType = "name",
            RoleClaimType = "role",
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });
builder.Services.AddMemoryCache();
builder.Services.AddScoped<PermissionService>();
builder.Services.AddScoped<IClaimsTransformation, PermissionClaimsTransformation>();
builder.Services.AddScoped<CatalogService>();
builder.Services.AddScoped<RecommendationService>();
builder.Services.AddScoped<IAssistantBrain, RuleBasedAssistant>(); // swap for a local-LLM implementation later

// One policy per permission: [Authorize(Policy = Permissions.ProductsManage)].
// Permission claims are added per request by PermissionClaimsTransformation.
builder.Services.AddAuthorization(o =>
{
    foreach (var key in Permissions.Keys)
        o.AddPolicy(key, p => p.RequireClaim(Permissions.ClaimType, key));

    o.AddPolicy(MediaPolicy.Name, p => p.RequireAssertion(ctx =>
        MediaPolicy.AnyOf.Any(k => ctx.User.HasClaim(Permissions.ClaimType, k))));
});

// Payment gateway: only the local "Fake" one exists for now. Add real gateways here.
var gatewayName = config["Payment:Gateway"] ?? "Fake";
if (gatewayName == "Fake")
{
    if (builder.Environment.IsProduction())
        throw new InvalidOperationException("The Fake payment gateway must not be used in Production. Set Payment:Gateway.");
    builder.Services.AddSingleton<IPaymentGateway, FakePaymentGateway>();
}
else
{
    throw new InvalidOperationException($"Unknown payment gateway '{gatewayName}'. Implement IPaymentGateway and register it here.");
}

// Uploaded files live on local disk.
var uploadsPath = config["Storage:UploadsPath"] ?? "uploads";
if (!Path.IsPathRooted(uploadsPath)) uploadsPath = Path.Combine(builder.Environment.ContentRootPath, uploadsPath);
Directory.CreateDirectory(uploadsPath);
builder.Services.AddSingleton(new UploadsOptions(uploadsPath));

builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(config.GetSection("Cors:Origins").Get<string[]>() ?? [])
    .AllowAnyHeader().AllowAnyMethod()));

builder.Services.AddControllers().AddJsonOptions(o =>
    o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

var app = builder.Build();

// ---------- Pipeline ----------
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
    ctx.Response.Headers["Referrer-Policy"] = "same-origin";
    await next();
});


app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(uploadsPath),
    RequestPath = "/uploads",
    OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl = "public,max-age=31536000,immutable"
});

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

await DbSeeder.InitializeAsync(app.Services, seedSampleData: app.Environment.IsDevelopment());

app.Run();
