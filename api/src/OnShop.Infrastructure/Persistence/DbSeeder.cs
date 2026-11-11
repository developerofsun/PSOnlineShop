using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using OnShop.Domain;
using OnShop.Infrastructure.Identity;

namespace OnShop.Infrastructure.Persistence;

public static class DbSeeder
{
    public static async Task InitializeAsync(IServiceProvider services, bool seedSampleData)
    {
        using var scope = services.CreateScope();
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<AppDbContext>();
        var config = sp.GetRequiredService<IConfiguration>();
        var log = sp.GetRequiredService<ILoggerFactory>().CreateLogger("DbSeeder");

        var connection = db.Database.GetDbConnection();
        log.LogInformation("Database: {Database} on {Host}", connection.Database, connection.DataSource);

        // Development only (seedSampleData == Development): wipe the database and rebuild it.
        // Enable by setting "Database": { "RecreateOnStart": true } in appsettings.Development.json, run once, then remove it.
        if (seedSampleData && config.GetValue<bool>("Database:RecreateOnStart"))
        {
            log.LogWarning("Database:RecreateOnStart is true: dropping and recreating the database.");
            await db.Database.EnsureDeletedAsync();
        }

        // The schema is owned by EF migrations (api/src/OnShop.Infrastructure/Persistence/Migrations).
        // Never use EnsureCreated here: it bypasses the migration history and makes later schema changes impossible.
        var migrations = db.Database.GetMigrations().ToList(); // sync only: there is no GetMigrationsAsync
        log.LogInformation("EF migrations found in the project: {Count}", migrations.Count);
        if (migrations.Count == 0)
            throw new InvalidOperationException(
                "No EF migrations were found. Generate them with: " +
                "dotnet ef migrations add InitialCreate -p api/src/OnShop.Infrastructure -s api/src/OnShop.Api " +
                "-o Persistence/Migrations");

        await BaselineIfNeededAsync(db, migrations, log);
        await db.Database.MigrateAsync();

        if (!await HasTableAsync(db, "AspNetRoles"))
            throw new InvalidOperationException(
                $"Database '{connection.Database}' has {migrations.Count} EF migration(s) but no AspNetRoles table: " +
                "the migration is empty or its history is out of sync. Delete the Migrations folder under api/src " +
                "(or regenerate it), then set Database:RecreateOnStart=true in appsettings.Development.json and run once.");

        await EnableTrigramAsync(db, log);
        await SeedIdentityAsync(sp, config, log);
        await SeedSettingsAsync(db);
        if (seedSampleData)
        {
            await SeedSampleCatalogAsync(db);
            await SeedSampleContentAsync(db);
            await SeedSampleStoriesAsync(db);
        }
        await BackfillSearchTextAsync(db);
    }

    /// <summary>
    /// A database created by an older version of the app (EnsureCreated) already has every table but no
    /// __EFMigrationsHistory, so MigrateAsync would try to create the tables again and fail. Record the initial
    /// migration as already applied instead. Only safe when the schema really is current: otherwise the app would
    /// believe a migration ran that never did, so refuse and ask for a reset.
    /// </summary>
    private static async Task BaselineIfNeededAsync(AppDbContext db, IReadOnlyList<string> migrations, ILogger log)
    {
        if (!await HasTableAsync(db, "AspNetRoles")) return; // empty database: MigrateAsync creates everything
        if (await HasTableAsync(db, "__EFMigrationsHistory")) return; // already under migration control

        if (!await SchemaIsCurrentAsync(db))
            throw new InvalidOperationException(
                $"Database '{db.Database.GetDbConnection().Database}' was created by an older version of OnShop and " +
                "lacks newer tables or columns, so it cannot be adopted by the initial migration. " +
                "Set Database:RecreateOnStart=true in appsettings.Development.json, run once, then set it back to false. " +
                "In production, restore a backup or create a fresh database.");

        var initial = migrations[0];
        log.LogWarning(
            "Existing database has no migration history; recording '{Migration}' as already applied (baseline).",
            initial);
        await db.Database.ExecuteSqlRawAsync(
            "CREATE TABLE IF NOT EXISTS \"__EFMigrationsHistory\" (" +
            "\"MigrationId\" character varying(150) NOT NULL PRIMARY KEY, " +
            "\"ProductVersion\" character varying(32) NOT NULL)");
        await db.Database.ExecuteSqlRawAsync(
            "INSERT INTO \"__EFMigrationsHistory\" (\"MigrationId\", \"ProductVersion\") VALUES ({0}, {1}) " +
            "ON CONFLICT (\"MigrationId\") DO NOTHING",
            initial, "8.0.0");
    }

    private static Task<bool> HasTableAsync(AppDbContext db, string table) =>
        db.Database
            .SqlQueryRaw<bool>($"SELECT to_regclass('public.\"{table}\"') IS NOT NULL AS \"Value\"")
            .SingleAsync();

    private static Task<bool> HasColumnAsync(AppDbContext db, string table, string column) =>
        db.Database
            .SqlQueryRaw<bool>(
                "SELECT EXISTS (SELECT 1 FROM information_schema.columns " +
                $"WHERE table_schema = 'public' AND table_name = '{table}' AND column_name = '{column}') AS \"Value\"")
            .SingleAsync();

    /// <summary>Checks the newest additions to the model (latest schema version).</summary>
    private static async Task<bool> SchemaIsCurrentAsync(AppDbContext db) =>
        await HasTableAsync(db, "Pages")
        && await HasTableAsync(db, "Stories")
        && await HasColumnAsync(db, "Categories", "ImageUrl")
        && await HasColumnAsync(db, "Orders", "Lat")
        && await HasColumnAsync(db, "Addresses", "Lat");


    private static async Task EnableTrigramAsync(AppDbContext db, ILogger log)
    {
        try
        {
            await db.Database.ExecuteSqlRawAsync("CREATE EXTENSION IF NOT EXISTS pg_trgm");
            SearchCapabilities.Trigram = true;
            log.LogInformation("pg_trgm is available: typo-tolerant search enabled.");
        }
        catch (Exception ex)
        {
            SearchCapabilities.Trigram = false;
            log.LogWarning("pg_trgm is not available ({Message}); search works without typo tolerance.", ex.Message);
        }
    }

    // ---------------- identity, roles, permissions ----------------

    private static async Task SeedIdentityAsync(IServiceProvider sp, IConfiguration config, ILogger log)
    {
        var roles = sp.GetRequiredService<RoleManager<IdentityRole<int>>>();

        foreach (var name in Roles.All)
        {
            var role = await roles.FindByNameAsync(name);
            var isNew = role is null;
            if (role is null)
            {
                role = new IdentityRole<int>(name);
                await roles.CreateAsync(role);
            }

            var have = (await roles.GetClaimsAsync(role))
                .Where(c => c.Type == Permissions.ClaimType).Select(c => c.Value).ToHashSet();

            // Admin always has everything; Manager gets defaults once (admins may edit it later).
            IEnumerable<string> wanted = name switch
            {
                Roles.Admin => Permissions.Keys,
                Roles.Manager when isNew => Permissions.ManagerDefaults,
                _ => []
            };
            foreach (var key in wanted.Where(k => !have.Contains(k)))
                await roles.AddClaimAsync(role, new Claim(Permissions.ClaimType, key));
        }

        var users = sp.GetRequiredService<UserManager<AppUser>>();
        var userName = config["Seed:AdminUserName"] ?? "admin";
        var password = config["Seed:AdminPassword"];
        if (string.IsNullOrWhiteSpace(password))
        {
            log.LogWarning("Seed:AdminPassword is not set; no admin user was created.");
            return;
        }

        if (await users.FindByNameAsync(userName) is not null) return;

        var admin = new AppUser
        {
            UserName = userName,
            Email = config["Seed:AdminEmail"] ?? "admin@onshop.local",
            EmailConfirmed = true,
            FullName = "مدیر سایت"
        };
        var result = await users.CreateAsync(admin, password);
        if (!result.Succeeded)
            throw new InvalidOperationException("Could not create admin: " +
                string.Join("; ", result.Errors.Select(e => e.Description)));
        await users.AddToRoleAsync(admin, Roles.Admin);
        log.LogInformation("Admin user '{User}' created.", userName);
    }

    // ---------------- settings ----------------

    private static async Task SeedSettingsAsync(AppDbContext db)
    {
        var defaults = new Dictionary<string, string>
        {
            ["site.name.fa"] = "سوپرمارکت من",
            ["site.name.en"] = "My Market",
            ["site.description.fa"] = "خرید آنلاین مواد غذایی و نیازمندی‌های روزانه",
            ["site.description.en"] = "Online grocery and daily essentials",
            ["shop.shipping_cost"] = "0",
            ["shop.low_stock_threshold"] = "5",

            // Delivery location on a map (OpenStreetMap). Public keys start with "site." so the storefront can read them.
            ["site.map_enabled"] = "true",
            // Default is the public OSM tile server (remote). Point this at your own tile server to stay fully local.
            ["site.map_tile_url"] = "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            ["site.map_center_lat"] = "35.6892",
            ["site.map_center_lng"] = "51.3890",
            ["site.map_zoom"] = "12",

            // Feature switches (public, read by the storefront)
            ["site.shop3d_enabled"] = "true",
            ["site.assistant_enabled"] = "true",
            // 3D store access: only signed-in customers, with a daily time limit (0 = unlimited)
            ["site.shop3d_login_required"] = "true",
            ["site.shop3d_daily_minutes"] = "10",
            // Shop logo: a local /uploads/... image chosen in the admin settings (empty = first letter of the name)
            ["site.logo_url"] = ""
        };
        var existing = await db.Settings.Select(s => s.Key).ToListAsync();
        foreach (var (k, v) in defaults)
            if (!existing.Contains(k))
                db.Settings.Add(new SiteSetting { Key = k, Value = v });
        await db.SaveChangesAsync();
    }

    // ---------------- sample data (Development only) ----------------

    private static async Task SeedSampleCatalogAsync(AppDbContext db)
    {
        if (await db.Products.AnyAsync()) return;

        static Category Cat(int order, string fa, string faSlug, string en, string enSlug, Category? parent = null) => new()
        {
            SortOrder = order,
            Parent = parent,
            Translations =
            [
                new() { Lang = "fa", Name = fa, Slug = faSlug },
                new() { Lang = "en", Name = en, Slug = enSlug }
            ]
        };

        var produce = Cat(0, "میوه و سبزیجات", "میوه-و-سبزیجات", "Fruit & Vegetables", "fruit-vegetables");
        var fruit = Cat(0, "میوه‌ها", "میوه-ها", "Fruit", "fruit", produce);
        var veg = Cat(1, "سبزیجات", "سبزیجات", "Vegetables", "vegetables", produce);
        var dairy = Cat(1, "لبنیات و تخم‌مرغ", "لبنیات-و-تخم-مرغ", "Dairy & Eggs", "dairy-eggs");
        var bakery = Cat(2, "نان و غلات", "نان-و-غلات", "Bread & Grains", "bread-grains");
        var meat = Cat(3, "پروتئین", "پروتئین", "Meat & Poultry", "meat-poultry");
        var drinks = Cat(4, "نوشیدنی", "نوشیدنی", "Beverages", "beverages");
        db.Categories.AddRange(produce, fruit, veg, dairy, bakery, meat, drinks);

        Product P(string sku, long price, long? sale, int stock, Category c, string faName, string faSlug,
                  string enName, string enSlug, string faDesc, string enDesc) => new()
        {
            Sku = sku, Price = price, SalePrice = sale, Stock = stock, Category = c,
            Translations =
            [
                new() { Lang = "fa", Name = faName, Slug = faSlug, ShortDescription = faDesc, Description = faDesc },
                new() { Lang = "en", Name = enName, Slug = enSlug, ShortDescription = enDesc, Description = enDesc }
            ]
        };

        db.Products.AddRange(
            P("FR-001", 85_000, 72_000, 120, fruit, "سیب قرمز ۱ کیلوگرم", "سیب-قرمز", "Red Apples 1 kg", "red-apples",
                "سیب قرمز تازه و آبدار", "Fresh and juicy red apples"),
            P("FR-002", 110_000, null, 80, fruit, "موز ۱ کیلوگرم", "موز", "Bananas 1 kg", "bananas",
                "موز رسیده و شیرین", "Ripe and sweet bananas"),
            P("FR-003", 65_000, 55_000, 200, fruit, "پرتقال تامسون ۱ کیلوگرم", "پرتقال-تامسون", "Thomson Oranges 1 kg", "thomson-oranges",
                "پرتقال آبگیری", "Juicing oranges"),
            P("VG-001", 48_000, null, 150, veg, "گوجه‌فرنگی ۱ کیلوگرم", "گوجه-فرنگی", "Tomatoes 1 kg", "tomatoes",
                "گوجه‌فرنگی سالادی", "Salad tomatoes"),
            P("VG-002", 35_000, null, 4, veg, "خیار ۱ کیلوگرم", "خیار", "Cucumbers 1 kg", "cucumbers",
                "خیار تازه", "Fresh cucumbers"),
            P("DA-001", 42_000, null, 300, dairy, "شیر کامل ۱ لیتری", "شیر-کامل", "Whole Milk 1 L", "whole-milk",
                "شیر پاستوریزه پرچرب", "Pasteurized whole milk"),
            P("DA-002", 58_000, 52_000, 90, dairy, "ماست کم‌چرب ۹۰۰ گرمی", "ماست-کم-چرب", "Low-fat Yogurt 900 g", "low-fat-yogurt",
                "ماست کم‌چرب پروبیوتیک", "Probiotic low-fat yogurt"),
            P("DA-003", 210_000, null, 60, dairy, "تخم‌مرغ ۳۰ عددی", "تخم-مرغ-30", "Eggs (30 pack)", "eggs-30",
                "تخم‌مرغ درشت", "Large eggs"),
            P("BR-001", 850_000, 790_000, 40, bakery, "برنج ایرانی ۵ کیلوگرم", "برنج-ایرانی", "Iranian Rice 5 kg", "iranian-rice",
                "برنج طارم معطر", "Aromatic Tarom rice"),
            P("BR-002", 25_000, null, 50, bakery, "نان سنگک تازه", "نان-سنگک", "Fresh Sangak Bread", "sangak-bread",
                "نان سنگک داغ", "Hot sangak bread"),
            P("ME-001", 190_000, null, 35, meat, "سینه مرغ ۱ کیلوگرم", "سینه-مرغ", "Chicken Breast 1 kg", "chicken-breast",
                "سینه مرغ تازه بدون استخوان", "Fresh boneless chicken breast"),
            P("DR-001", 38_000, null, 110, drinks, "دوغ ۱.۵ لیتری", "دوغ", "Doogh 1.5 L", "doogh",
                "دوغ گازدار", "Sparkling doogh"),
            P("DR-002", 260_000, 235_000, 70, drinks, "چای ایرانی ۴۰۰ گرم", "چای-ایرانی", "Iranian Tea 400 g", "iranian-tea",
                "چای ممتاز", "Premium tea"));

        await db.SaveChangesAsync();
    }

    private static async Task SeedSampleContentAsync(AppDbContext db)
    {
        if (await db.Pages.AnyAsync()) return;

        var slider = new Slider
        {
            Name = "اسلایدر صفحه اصلی",
            Slides =
            [
                new()
                {
                    SortOrder = 0,
                    TitleJson = Localized.ToJson(new() { ["fa"] = "میوه و سبزی تازه، همین امروز", ["en"] = "Fresh fruit & vegetables today" }),
                    SubtitleJson = Localized.ToJson(new() { ["fa"] = "ارسال سریع به درب منزل", ["en"] = "Fast delivery to your door" }),
                    ButtonTextJson = Localized.ToJson(new() { ["fa"] = "خرید کنید", ["en"] = "Shop now" }),
                    LinkUrl = "/products"
                },
                new()
                {
                    SortOrder = 1,
                    TitleJson = Localized.ToJson(new() { ["fa"] = "تخفیف ویژه لبنیات", ["en"] = "Dairy special offers" }),
                    SubtitleJson = Localized.ToJson(new() { ["fa"] = "تا ۲۰٪ تخفیف", ["en"] = "Up to 20% off" }),
                    ButtonTextJson = Localized.ToJson(new() { ["fa"] = "مشاهده", ["en"] = "View" }),
                    LinkUrl = "/products?onSale=true"
                }
            ]
        };
        var banner = new Banner
        {
            Name = "بنر پیشنهاد ویژه",
            LinkUrl = "/products?onSale=true",
            TitleJson = Localized.ToJson(new() { ["fa"] = "پیشنهادهای شگفت‌انگیز امروز", ["en"] = "Today's special offers" })
        };
        var footer = new ContentText
        {
            Name = "متن فوتر",
            Key = "footer",
            ContentJson = Localized.ToJson(new()
            {
                ["fa"] = "پشتیبانی: همه روزه ۸ تا ۲۲\nارسال به سراسر شهر در کمتر از ۲ ساعت",
                ["en"] = "Support: daily 8 to 22\nCity-wide delivery in under 2 hours"
            })
        };
        db.AddRange(slider, banner, footer);
        await db.SaveChangesAsync();

        var page = new Page
        {
            IsHome = true,
            Translations =
            [
                new() { Lang = "fa", Title = "خانه", Slug = "home" },
                new() { Lang = "en", Title = "Home", Slug = "home-en" }
            ],
            Blocks =
            [
                new() { SortOrder = 0, Type = BlockTypes.Slider, ConfigJson = $"{{\"sliderId\":{slider.Id}}}" },
                new() { SortOrder = 1, Type = BlockTypes.Categories, ConfigJson = "{\"title\":{\"fa\":\"دسته‌بندی‌ها\",\"en\":\"Shop by category\"}}" },
                new() { SortOrder = 2, Type = BlockTypes.Products, ConfigJson = "{\"sort\":\"discount\",\"limit\":5,\"title\":{\"fa\":\"شگفت‌انگیزها\",\"en\":\"Best deals\"}}" },
                new() { SortOrder = 3, Type = BlockTypes.Banner, ConfigJson = $"{{\"bannerId\":{banner.Id}}}" },
                new() { SortOrder = 4, Type = BlockTypes.Products, ConfigJson = "{\"sort\":\"newest\",\"limit\":10,\"title\":{\"fa\":\"تازه‌ترین محصولات\",\"en\":\"New arrivals\"}}" }
            ]
        };
        db.Pages.Add(page);
        await db.SaveChangesAsync();
    }

    private static async Task SeedSampleStoriesAsync(AppDbContext db)
    {
        if (await db.Stories.AnyAsync()) return;

        StoryItem Item(int order, string fa, string en, string? link) => new()
        {
            SortOrder = order,
            CaptionJson = Localized.ToJson(new() { ["fa"] = fa, ["en"] = en }),
            LinkUrl = link,
            DurationSec = 5
        };

        db.Stories.AddRange(
            new Story
            {
                Name = "تازه‌ها", SortOrder = 0,
                TitleJson = Localized.ToJson(new() { ["fa"] = "تازه‌ها", ["en"] = "Fresh" }),
                Items = [Item(0, "میوه و سبزی تازه رسید!", "Fresh fruit and vegetables just arrived!", "/products"),
                         Item(1, "امروز صبح از باغ به سفره", "From the farm this morning", null)]
            },
            new Story
            {
                Name = "تخفیف‌ها", SortOrder = 1,
                TitleJson = Localized.ToJson(new() { ["fa"] = "تخفیف‌ها", ["en"] = "Deals" }),
                Items = [Item(0, "تا ۲۰٪ تخفیف روی لبنیات", "Up to 20% off dairy", "/products?onSale=true")]
            },
            new Story
            {
                Name = "پیشنهاد روز", SortOrder = 2,
                TitleJson = Localized.ToJson(new() { ["fa"] = "پیشنهاد روز", ["en"] = "Today" }),
                Items = [Item(0, "برنج ایرانی با قیمت ویژه", "Iranian rice at a special price", "/products")]
            });
        await db.SaveChangesAsync();
    }

    // ---------------- search text ----------------

    /// <summary>Fills ProductTranslation.SearchText for rows created before the column existed or by the seeder.</summary>
    private static async Task BackfillSearchTextAsync(AppDbContext db)
    {
        var rows = await db.ProductTranslations.Include(t => t.Product)
            .Where(t => t.SearchText == "").ToListAsync();
        if (rows.Count == 0) return;
        foreach (var t in rows)
            t.SearchText = Normalizer.BuildSearchText(t.Name, t.ShortDescription, t.Product.Sku);
        await db.SaveChangesAsync();
    }
}
