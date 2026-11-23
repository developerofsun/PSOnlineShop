using System.Text;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using OnShop.Domain;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using OnShop.Api.Controllers;
using OnShop.Api.Services;
using OnShop.Api.Services.ProductSync;
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

// Product sync from the accounting system (Kyan), on a schedule and on demand from the admin panel.
builder.Services.AddHttpClient<KyanClient>(c => c.Timeout = TimeSpan.FromMinutes(2));
builder.Services.AddScoped<ProductSyncService>();
builder.Services.AddSingleton<ProductSyncRunner>();
builder.Services.AddHostedService<ProductSyncBackgroundService>();

// One policy per permission: [Authorize(Policy = Permissions.ProductsManage)].
// Permission claims are added per request by PermissionClaimsTransformation.
builder.Services.AddAuthorization(o =>
{
    foreach (var key in Permissions.Keys)
        o.AddPolicy(key, p => p.RequireClaim(Permissions.ClaimType, key));

    o.AddPolicy(MediaPolicy.Name, p => p.RequireAssertion(ctx =>
        MediaPolicy.AnyOf.Any(k => ctx.User.HasClaim(Permissions.ClaimType, k))));
});

// Payment gateways. All of them are registered; the active one is chosen per request by
// PaymentGatewayResolver from Admin → Settings → Payments (database), falling back to Payment:Gateway
// in configuration. That is what lets an admin switch provider without restarting the API.
// Supported: BehpardakhtMellat (aliases Mellat / Behpardakht), Zarinpal, Zibal, Offline, Fake.
builder.Services.AddHttpClient<MellatPaymentGateway>(c => c.Timeout = TimeSpan.FromSeconds(30));
builder.Services.AddHttpClient<ZarinpalPaymentGateway>(c => c.Timeout = TimeSpan.FromSeconds(30));
builder.Services.AddHttpClient<ZibalPaymentGateway>(c => c.Timeout = TimeSpan.FromSeconds(30));
builder.Services.AddSingleton<OfflinePaymentGateway>();
builder.Services.AddSingleton<FakePaymentGateway>();
builder.Services.AddScoped<PaymentSettingsStore>();
builder.Services.AddScoped<PaymentGatewayResolver>();

// The configuration value is only the initial fallback, but an unknown name there is still a mistake
// worth failing fast on. Missing credentials are reported when a payment is attempted, because they
// may live in the database instead.
var configuredGateway = PaymentGateways.Canonical(config["Payment:Gateway"] ?? PaymentGateways.Fake)
    ?? throw new InvalidOperationException(
        $"Unknown payment gateway '{config["Payment:Gateway"]}'. Use Zarinpal, Zibal, BehpardakhtMellat, Offline or Fake.");
if (configuredGateway == PaymentGateways.Fake && builder.Environment.IsProduction())
    throw new InvalidOperationException("The Fake payment gateway must not be used in Production. Set Payment:Gateway.");

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
// Surface unexpected failures as JSON with a reason, so the admin sees why an
// upload failed instead of a bare 500 with no body. Details only in Development.
app.UseExceptionHandler(err => err.Run(async ctx =>
{
    var feature = ctx.Features.Get<IExceptionHandlerFeature>();
    var e = feature?.Error;
    var isDev = app.Environment.IsDevelopment();
    app.Logger.LogError(e, "Unhandled exception on {Method} {Path}", ctx.Request.Method, ctx.Request.Path);

    ctx.Response.StatusCode = StatusCodes.Status500InternalServerError;
    ctx.Response.ContentType = "application/json";
    await ctx.Response.WriteAsJsonAsync(new
    {
        error = isDev
            ? e?.Message ?? "خطای داخلی سرور."
            : "خطای داخلی سرور. لطفاً با پشتیبانی تماس بگیرید.",
        detail = isDev ? e?.ToString() : null
    });
}));

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

// Sample data (demo catalog, content, stories) is seeded in Development, or anywhere when
// Seed:SampleData is set. It only fills empty tables, so it never overwrites real data.
var seedSampleData = app.Environment.IsDevelopment() || config.GetValue<bool>("Seed:SampleData");
await DbSeeder.InitializeAsync(app.Services, seedSampleData, allowDestructiveReset: app.Environment.IsDevelopment());

app.Run();
