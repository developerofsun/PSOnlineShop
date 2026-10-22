using OnShop.Domain;

namespace OnShop.Api.Contracts;

// ---------- Auth ----------
public record LoginRequest(string Login, string Password);
public record RegisterRequest(string FullName, string Phone, string Password);
public record AuthResponse(string Token, DateTime Expires, UserInfo User);
public record UserInfo(int Id, string FullName, string? UserName, string? Phone, string? Email, string[] Roles, string[] Permissions);

// ---------- Public catalog ----------
/// <summary>Categories is a comma-separated list of category slugs (descendants are included automatically).</summary>
public record ProductQuery(
    string? Lang, string? Categories, string? Q, string? Sort,
    long? MinPrice, long? MaxPrice, bool InStock = false, bool OnSale = false,
    int Page = 1, int PageSize = 20);

public record ProductsResult(IReadOnlyList<ProductListItem> Items, int Total, int Page, int PageSize, bool Fuzzy);

public record ProductCompareItem(
    int Id, string Sku, long Price, long? SalePrice, int Stock,
    string? Name, string? Slug, string? Image, string? CategoryName, string? ShortDescription);

public record FacetCategory(int Id, int? ParentId, string? Name, string? Slug, int Count);
public record Facets(List<FacetCategory> Categories, long MinPrice, long MaxPrice, int InStockCount, int OnSaleCount, int Total);
public record SuggestResult(List<ProductListItem> Products, List<CategoryRef> Categories);

public record ProductListItem(
    int Id, string Sku, long Price, long? SalePrice, int Stock,
    string? Name, string? Slug, string? Image);

public record ProductDetail(
    int Id, string Sku, long Price, long? SalePrice, int Stock,
    string Name, string Slug, string? ShortDescription, string? Description,
    string? SeoTitle, string? SeoDescription,
    CategoryRef? Category, string[] Images, Dictionary<string, string> Alternates);

public record CategoryRef(int Id, string? Name, string? Slug);

public record CategoryItem(int Id, int? ParentId, string? Name, string? Slug, int ProductCount, string? ImageUrl = null);

// ---------- Admin: products ----------
public record TranslationInput(
    string Lang, string Name, string? Slug,
    string? ShortDescription, string? Description, string? SeoTitle, string? SeoDescription);

public record ProductInput(
    string Sku, long Price, long? SalePrice, int Stock, bool IsPublished, int? CategoryId,
    List<TranslationInput> Translations, List<string> Images);

public record AdminProductListItem(
    int Id, string Sku, string? Name, long Price, long? SalePrice, int Stock,
    bool IsPublished, string? Image, DateTime CreatedAt,
    string? Barcode = null, bool NeedsReview = false, bool MissingFromFeed = false,
    int? CategoryId = null, int? SuggestedCategoryId = null, string? SuggestedCategoryName = null);

public record AdminProductDetail(
    int Id, string Sku, long Price, long? SalePrice, int Stock, bool IsPublished, int? CategoryId,
    List<TranslationInput> Translations, List<string> Images);

// ---------- Admin: categories ----------
public record CategoryTranslationInput(string Lang, string Name, string? Slug, string? Description);
public record CategoryInput(int? ParentId, int SortOrder, bool IsActive, List<CategoryTranslationInput> Translations, string? ImageUrl = null);
public record AdminCategoryItem(int Id, int? ParentId, int SortOrder, bool IsActive, string? Name, int ProductCount);
public record AdminCategoryDetail(int Id, int? ParentId, int SortOrder, bool IsActive, List<CategoryTranslationInput> Translations, string? ImageUrl = null);

// ---------- Orders ----------
public record CartLine(int ProductId, int Quantity);
public record CustomerInfo(string FullName, string Phone, string Province, string City, string Address, string PostalCode, string? Note, double? Lat = null, double? Lng = null);
public record CheckoutRequest(List<CartLine> Items, CustomerInfo Customer, string? Locale);
public record CheckoutResponse(string OrderNumber, string RedirectUrl);

public record OrderItemDto(int? ProductId, string Name, string Sku, long UnitPrice, int Quantity);
public record OrderDetailDto(
    int Id, string Number, OrderStatus Status, long Subtotal, long ShippingCost, long Total,
    string FullName, string Phone, string Province, string City, string Address, string PostalCode, string? Note,
    string? PaymentRef, DateTime CreatedAt, DateTime? PaidAt, List<OrderItemDto> Items,
    double? Lat = null, double? Lng = null);
public record OrderListItem(int Id, string Number, OrderStatus Status, long Total, string FullName, string Phone, DateTime CreatedAt, DateTime? PaidAt);
public record UpdateOrderStatus(OrderStatus Status);

// ---------- Media ----------
public record MediaDto(int Id, string Url, string OriginalName, string ContentType, long Size, DateTime CreatedAt);

// ---------- Dashboard ----------
public record DayPoint(string Date, long Revenue, int Orders);
public record LowStockItem(int Id, string Sku, string? Name, int Stock);
public record DashboardDto(
    int ProductsCount, int OrdersToday, int PendingOrders, long Revenue30Days, int CustomersCount,
    List<DayPoint> Last14Days, List<LowStockItem> LowStock, List<OrderListItem> RecentOrders);
