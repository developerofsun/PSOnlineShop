namespace OnShop.Domain;

public static class Languages
{
    public const string Default = "fa";
    public static readonly string[] Supported = ["fa", "en"];
}

public static class Roles
{
    public const string Admin = "Admin";
    public const string Manager = "Manager";
    public const string Customer = "Customer";
    /// <summary>Roles allowed into the admin dashboard.</summary>
    public const string Staff = "Admin,Manager";
    public static readonly string[] All = [Admin, Manager, Customer];
}

public abstract class Entity
{
    public int Id { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
}

public class Category : Entity
{
    public int? ParentId { get; set; }
    public Category? Parent { get; set; }
    /// <summary>Optional local /uploads/... image shown on category tiles.</summary>
    public string? ImageUrl { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public List<CategoryTranslation> Translations { get; set; } = [];
    public List<Product> Products { get; set; } = [];
}

public class CategoryTranslation
{
    public int Id { get; set; }
    public int CategoryId { get; set; }
    public Category Category { get; set; } = null!;
    public string Lang { get; set; } = Languages.Default;
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public string? Description { get; set; }
}

public class Product : Entity
{
    public string Sku { get; set; } = "";
    /// <summary>Price in Toman (integer, no decimals).</summary>
    public long Price { get; set; }
    public long? SalePrice { get; set; }
    public int Stock { get; set; }
    public bool IsPublished { get; set; } = true;
    public int? CategoryId { get; set; }
    public Category? Category { get; set; }
    public List<ProductTranslation> Translations { get; set; } = [];
    public List<ProductImage> Images { get; set; } = [];
}

public class ProductTranslation
{
    public int Id { get; set; }
    public int ProductId { get; set; }
    public Product Product { get; set; } = null!;
    public string Lang { get; set; } = Languages.Default;
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public string? ShortDescription { get; set; }
    public string? Description { get; set; }
    public string? SeoTitle { get; set; }
    public string? SeoDescription { get; set; }
    /// <summary>Normalized text used by the product search (see Normalizer.BuildSearchText).</summary>
    public string SearchText { get; set; } = "";
}

public class ProductImage
{
    public int Id { get; set; }
    public int ProductId { get; set; }
    public Product Product { get; set; } = null!;
    /// <summary>Local URL, e.g. /uploads/abc.jpg</summary>
    public string Url { get; set; } = "";
    public int SortOrder { get; set; }
}

public class MediaFile : Entity
{
    public string FileName { get; set; } = "";
    public string OriginalName { get; set; } = "";
    public string Url { get; set; } = "";
    public string ContentType { get; set; } = "";
    public long Size { get; set; }
}

public enum OrderStatus
{
    Pending,
    Paid,
    Processing,
    Shipped,
    Delivered,
    Cancelled,
    Refunded
}

public class Order : Entity
{
    public string Number { get; set; } = "";
    public int? UserId { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.Pending;
    public string Locale { get; set; } = Languages.Default;

    public long Subtotal { get; set; }
    public long ShippingCost { get; set; }
    public long Total { get; set; }

    public string FullName { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Province { get; set; } = "";
    public string City { get; set; } = "";
    public string Address { get; set; } = "";
    public string PostalCode { get; set; } = "";
    public string? Note { get; set; }
    /// <summary>Delivery point picked on the map (optional).</summary>
    public double? Lat { get; set; }
    public double? Lng { get; set; }

    public string? PaymentAuthority { get; set; }
    public string? PaymentRef { get; set; }
    public DateTime? PaidAt { get; set; }

    public List<OrderItem> Items { get; set; } = [];
}

public class OrderItem
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public Order Order { get; set; } = null!;
    public int? ProductId { get; set; }
    public Product? Product { get; set; }
    /// <summary>Snapshot so the order stays readable if the product is edited or deleted.</summary>
    public string Name { get; set; } = "";
    public string Sku { get; set; } = "";
    public long UnitPrice { get; set; }
    public int Quantity { get; set; }
}

public class SiteSetting
{
    public string Key { get; set; } = "";
    public string? Value { get; set; }
}
