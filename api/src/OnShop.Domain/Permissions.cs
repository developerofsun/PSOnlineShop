namespace OnShop.Domain;

/// <summary>
/// Permissions are stored as role claims (claim type "permission"). Users get the union of their roles' permissions.
/// The Admin role always holds every permission (synced at startup, so new permissions appear automatically).
/// </summary>
public static class Permissions
{
    public const string ClaimType = "permission";

    public const string DashboardView = "dashboard.view";
    public const string ProductsManage = "products.manage";
    public const string CategoriesManage = "categories.manage";
    public const string OrdersManage = "orders.manage";
    public const string MediaManage = "media.manage";
    public const string ContentManage = "content.manage"; // pages, sliders, banners, texts
    public const string UsersManage = "users.manage";
    public const string RolesManage = "roles.manage";
    public const string SettingsManage = "settings.manage";

    public record Definition(string Key, string Group, string Label);

    public static readonly Definition[] All =
    [
        new(DashboardView, "عمومی", "مشاهده پیشخوان"),
        new(ProductsManage, "فروشگاه", "مدیریت محصولات"),
        new(CategoriesManage, "فروشگاه", "مدیریت دسته‌بندی‌ها"),
        new(OrdersManage, "فروشگاه", "مدیریت سفارش‌ها"),
        new(MediaManage, "محتوا", "مدیریت رسانه"),
        new(ContentManage, "محتوا", "مدیریت صفحات، اسلایدرها، بنرها و متن‌ها"),
        new(UsersManage, "کاربران", "مدیریت کاربران"),
        new(RolesManage, "کاربران", "مدیریت نقش‌ها و دسترسی‌ها"),
        new(SettingsManage, "سیستم", "تنظیمات سایت"),
    ];

    public static readonly string[] Keys = All.Select(p => p.Key).ToArray();

    public static readonly string[] ManagerDefaults =
        [DashboardView, ProductsManage, CategoriesManage, OrdersManage, MediaManage, ContentManage];
}
