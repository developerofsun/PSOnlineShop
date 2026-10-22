using Microsoft.EntityFrameworkCore;
using OnShop.Api.Common;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Services.ProductSync;

public record ProductSyncResult(int Fetched, int Created, int Updated, int Unchanged, int Skipped, int NotInFeed, List<string> Warnings);

/// <summary>
/// Upserts products from Kyan. Identity is Kyan's ItemID (<see cref="Product.ExternalId"/>); an unlinked product with the
/// same barcode (or SKU) is linked once. Existing products only get name, regular price, sale price, stock and barcode
/// updated; new ones are created unpublished and uncategorized, for an admin to review. Nothing is ever deleted,
/// unpublished or restocked for products missing from the feed.
/// </summary>
public class ProductSyncService(AppDbContext db, KyanClient kyan)
{
    public const string UncategorizedSlug = "uncategorized";
    private const int MaxWarnings = 200;

    public async Task<ProductSyncResult> SyncAsync(CancellationToken ct)
    {
        var feed = await kyan.GetProductsAsync(ct);
        if (feed.Count == 0)
            throw new InvalidOperationException("Kyan returned no products; nothing was changed.");

        var warnings = new List<string>();
        void Warn(string m) { if (warnings.Count < MaxWarnings) warnings.Add(m); }

        // The feed, by Kyan id. Rows without a usable id/name/price are skipped; a repeated id keeps the last row.
        var rows = new Dictionary<int, KyanProduct>();
        var skipped = 0;
        foreach (var f in feed)
        {
            if (f.Id <= 0 || string.IsNullOrWhiteSpace(f.Name) || f.RegularPrice < 0)
            {
                skipped++;
                Warn($"Skipped feed row (id {f.Id}): missing id/name or negative price.");
                continue;
            }
            if (rows.ContainsKey(f.Id)) Warn($"Kyan id {f.Id} appears more than once; the last row was used.");
            rows[f.Id] = f;
        }
        if (rows.Count == 0)
            throw new InvalidOperationException("The Kyan feed had no usable rows; nothing was changed.");

        var uncategorizedId = await EnsureUncategorizedAsync(ct);
        var suggester = await CategorySuggester.BuildAsync(db, uncategorizedId, ct);

        var products = await db.Products.Include(p => p.Translations).ToListAsync(ct);
        var byExternal = products.Where(p => p.ExternalId != null).ToDictionary(p => p.ExternalId!.Value);
        var skus = products.Select(p => p.Sku).ToHashSet();
        var slugs = products.SelectMany(p => p.Translations).Where(t => t.Lang == Languages.Default).Select(t => t.Slug).ToHashSet();

        // Barcode -> owner, to keep one barcode on one product. Unlinked (manual) products can also be matched by SKU.
        var barcodeOwner = new Dictionary<string, Product>();
        foreach (var p in products.Where(p => !string.IsNullOrEmpty(p.Barcode)))
            barcodeOwner.TryAdd(p.Barcode!, p);
        var unlinked = new Dictionary<string, Product>();
        foreach (var p in products.Where(p => p.ExternalId == null))
        {
            if (!string.IsNullOrEmpty(p.Barcode)) unlinked.TryAdd(p.Barcode, p);
            unlinked.TryAdd(p.Sku, p);
        }

        int created = 0, updated = 0, unchanged = 0;
        var now = DateTime.UtcNow;

        foreach (var (id, row) in rows)
        {
            var barcode = Text.Normalize(row.Barcode).Trim();
            if (barcode.Length > 64) barcode = "";
            var name = Text.Normalize(row.Name).Trim();
            if (name.Length > 250) name = name[..250];
            var price = (long)Math.Round(row.RegularPrice, MidpointRounding.AwayFromZero);
            var salePrice = (long)Math.Round(row.PedarSalarPrice, MidpointRounding.AwayFromZero);
            long? sale = salePrice > 0 && salePrice < price ? salePrice : null;
            var stock = (int)Math.Clamp(Math.Floor(row.Quantity), 0, int.MaxValue);

            if (!byExternal.TryGetValue(id, out var product))
            {
                // A manual product with this barcode (or SKU) becomes the linked one, once.
                if (barcode.Length > 0 && unlinked.TryGetValue(barcode, out var manual) && manual.ExternalId == null)
                {
                    manual.ExternalId = id;
                    byExternal[id] = product = manual;
                    unlinked.Remove(barcode);
                }
            }

            if (product is null)
            {
                product = NewProduct(id, name, price, sale, stock, barcode, uncategorizedId, suggester.Suggest(name), skus, slugs, now);
                db.Products.Add(product);
                byExternal[id] = product;
                created++;
                ClaimBarcode(product, barcode, barcodeOwner, Warn);
                continue;
            }

            var changed = false;
            var tr = product.Translations.FirstOrDefault(t => t.Lang == Languages.Default);
            if (tr is null)
            {
                product.Translations.Add(NewTranslation(name, product.Sku, UniqueSlug(name, id, slugs)));
                changed = true;
            }
            else if (tr.Name != name)
            {
                tr.Name = name;
                tr.SearchText = Normalizer.BuildSearchText(name, tr.ShortDescription, product.Sku);
                changed = true;
            }
            if (product.Price != price) { product.Price = price; changed = true; }
            if (product.SalePrice != sale) { product.SalePrice = sale; changed = true; }
            if (product.Stock != stock) { product.Stock = stock; changed = true; }
            if (barcode.Length > 0 && product.Barcode != barcode)
                changed |= ClaimBarcode(product, barcode, barcodeOwner, Warn);
            if (product.MissingFromFeed) { product.MissingFromFeed = false; changed = true; }

            if (changed) { product.UpdatedAt = now; updated++; } else unchanged++;
        }

        // Linked products the feed did not have: left exactly as they are, only flagged for the admin.
        var notInFeed = 0;
        foreach (var p in byExternal.Values.Where(p => !rows.ContainsKey(p.ExternalId!.Value)))
        {
            notInFeed++;
            if (!p.MissingFromFeed) p.MissingFromFeed = true;
        }

        await db.SaveChangesAsync(ct);
        return new ProductSyncResult(feed.Count, created, updated, unchanged, skipped, notInFeed, warnings);
    }

    /// <summary>Gives the barcode to the product unless another product already owns it. True when it changed.</summary>
    private static bool ClaimBarcode(Product p, string barcode, Dictionary<string, Product> owners, Action<string> warn)
    {
        if (barcode.Length == 0) return false;
        if (owners.TryGetValue(barcode, out var owner) && owner != p)
        {
            warn($"Barcode {barcode} of Kyan id {p.ExternalId} is already used by product {owner.Sku}; kept as it was.");
            return false;
        }
        if (!string.IsNullOrEmpty(p.Barcode) && owners.GetValueOrDefault(p.Barcode) == p) owners.Remove(p.Barcode);
        p.Barcode = barcode;
        owners[barcode] = p;
        return true;
    }

    private static Product NewProduct(int id, string name, long price, long? sale, int stock, string barcode,
        int uncategorizedId, int? suggestedCategoryId, HashSet<string> skus, HashSet<string> slugs, DateTime now)
    {
        // The barcode is the SKU when it is free (so it is searchable); otherwise a Kyan-based code.
        var sku = barcode.Length > 0 && skus.Add(barcode) ? barcode : "KYAN-" + id;
        skus.Add(sku);
        return new Product
        {
            Sku = sku, Price = price, SalePrice = sale, Stock = stock,
            IsPublished = false, NeedsReview = true,
            CategoryId = uncategorizedId, SuggestedCategoryId = suggestedCategoryId,
            ExternalId = id, CreatedAt = now,
            Translations = [NewTranslation(name, sku, UniqueSlug(name, id, slugs))]
        };
    }

    private static ProductTranslation NewTranslation(string name, string sku, string slug) => new()
    {
        Lang = Languages.Default, Name = name, Slug = slug,
        SearchText = Normalizer.BuildSearchText(name, null, sku)
    };

    private static string UniqueSlug(string name, int id, HashSet<string> slugs)
    {
        var slug = Text.Slugify(name);
        if (slug.Length > 280) slug = slug[..280].Trim('-');
        if (slug.Length == 0 || slugs.Contains(slug)) slug = (slug.Length == 0 ? "product" : slug) + "-" + id;
        slugs.Add(slug);
        return slug;
    }

    /// <summary>The holding category for imported products, created on first use. Hidden from the storefront menu.</summary>
    private async Task<int> EnsureUncategorizedAsync(CancellationToken ct)
    {
        var existing = await db.Categories
            .Where(c => c.Translations.Any(t => t.Slug == UncategorizedSlug))
            .Select(c => (int?)c.Id).FirstOrDefaultAsync(ct);
        if (existing is int id) return id;

        var cat = new Category
        {
            IsActive = false, SortOrder = 9999,
            Translations =
            [
                new CategoryTranslation { Lang = "fa", Name = "بدون دسته‌بندی", Slug = UncategorizedSlug },
                new CategoryTranslation { Lang = "en", Name = "Uncategorized", Slug = UncategorizedSlug }
            ]
        };
        db.Categories.Add(cat);
        await db.SaveChangesAsync(ct);
        return cat.Id;
    }
}
