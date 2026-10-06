using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using OnShop.Domain;
using OnShop.Infrastructure.Identity;

namespace OnShop.Infrastructure.Persistence;

public class AppDbContext(DbContextOptions<AppDbContext> options)
    : IdentityDbContext<AppUser, IdentityRole<int>, int>(options)
{
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<CategoryTranslation> CategoryTranslations => Set<CategoryTranslation>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductTranslation> ProductTranslations => Set<ProductTranslation>();
    public DbSet<ProductImage> ProductImages => Set<ProductImage>();
    public DbSet<MediaFile> MediaFiles => Set<MediaFile>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<SiteSetting> Settings => Set<SiteSetting>();
    public DbSet<Slider> Sliders => Set<Slider>();
    public DbSet<Slide> Slides => Set<Slide>();
    public DbSet<Banner> Banners => Set<Banner>();
    public DbSet<ContentText> ContentTexts => Set<ContentText>();
    public DbSet<Page> Pages => Set<Page>();
    public DbSet<PageTranslation> PageTranslations => Set<PageTranslation>();
    public DbSet<PageBlock> PageBlocks => Set<PageBlock>();
    public DbSet<Address> Addresses => Set<Address>();
    public DbSet<Favorite> Favorites => Set<Favorite>();
    public DbSet<Story> Stories => Set<Story>();
    public DbSet<StoryItem> StoryItems => Set<StoryItem>();
    public DbSet<Shop3dUsage> Shop3dUsages => Set<Shop3dUsage>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);

        b.Entity<ContentText>(e => e.HasIndex(t => t.Key).IsUnique());

        b.Entity<Shop3dUsage>(e =>
        {
            e.HasIndex(u => new { u.UserId, u.Day }).IsUnique();
            e.Property(u => u.Day).HasMaxLength(10);
            e.HasOne<AppUser>().WithMany().HasForeignKey(u => u.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<PageTranslation>(e =>
        {
            e.HasIndex(t => new { t.Lang, t.Slug }).IsUnique();
            e.HasIndex(t => new { t.PageId, t.Lang }).IsUnique();
            e.Property(t => t.Lang).HasMaxLength(8);
            e.Property(t => t.Slug).HasMaxLength(250);
        });

        b.Entity<PageBlock>(e => e.HasIndex(x => new { x.PageId, x.SortOrder }));

        b.Entity<Address>(e =>
        {
            e.HasOne<AppUser>().WithMany().HasForeignKey(a => a.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<Favorite>(e =>
        {
            e.HasKey(f => new { f.UserId, f.ProductId });
            e.HasOne<AppUser>().WithMany().HasForeignKey(f => f.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(f => f.Product).WithMany().HasForeignKey(f => f.ProductId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<Category>(e =>
        {
            e.HasOne(c => c.Parent).WithMany().HasForeignKey(c => c.ParentId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<CategoryTranslation>(e =>
        {
            e.HasIndex(t => new { t.Lang, t.Slug }).IsUnique();
            e.HasIndex(t => new { t.CategoryId, t.Lang }).IsUnique();
            e.Property(t => t.Lang).HasMaxLength(8);
            e.Property(t => t.Name).HasMaxLength(200);
            e.Property(t => t.Slug).HasMaxLength(250);
        });

        b.Entity<Product>(e =>
        {
            e.HasIndex(p => p.Sku).IsUnique();
            e.Property(p => p.Sku).HasMaxLength(64);
            e.HasOne(p => p.Category).WithMany(c => c.Products)
                .HasForeignKey(p => p.CategoryId).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<ProductTranslation>(e =>
        {
            e.HasIndex(t => new { t.Lang, t.Slug }).IsUnique();
            e.HasIndex(t => new { t.ProductId, t.Lang }).IsUnique();
            e.Property(t => t.Lang).HasMaxLength(8);
            e.Property(t => t.Name).HasMaxLength(250);
            e.Property(t => t.Slug).HasMaxLength(300);
        });

        b.Entity<Order>(e =>
        {
            e.HasIndex(o => o.Number).IsUnique();
            e.HasIndex(o => o.Status);
            e.HasIndex(o => o.CreatedAt);
            e.Property(o => o.Number).HasMaxLength(32);
        });

        b.Entity<OrderItem>(e =>
        {
            e.HasOne(i => i.Product).WithMany().HasForeignKey(i => i.ProductId).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<SiteSetting>(e =>
        {
            e.HasKey(s => s.Key);
            e.Property(s => s.Key).HasMaxLength(128);
        });
    }
}
