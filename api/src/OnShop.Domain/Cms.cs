namespace OnShop.Domain;

public class Slider : Entity
{
    public string Name { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public List<Slide> Slides { get; set; } = [];
}

public class Slide
{
    public int Id { get; set; }
    public int SliderId { get; set; }
    public Slider Slider { get; set; } = null!;
    public int SortOrder { get; set; }
    /// <summary>Local /uploads/... URL. Empty = gradient background.</summary>
    public string ImageUrl { get; set; } = "";
    public string? LinkUrl { get; set; }
    /// <summary>Localized texts stored as JSON {"fa":"...","en":"..."}.</summary>
    public string TitleJson { get; set; } = "{}";
    public string SubtitleJson { get; set; } = "{}";
    public string ButtonTextJson { get; set; } = "{}";
}

/// <summary>A fixed banner (image + optional link and title) that can be placed on any page.</summary>
public class Banner : Entity
{
    public string Name { get; set; } = "";
    public string ImageUrl { get; set; } = "";
    public string? LinkUrl { get; set; }
    public string TitleJson { get; set; } = "{}";
    public bool IsActive { get; set; } = true;
}

/// <summary>A fixed, reusable text (for example the footer text) addressed by a unique Key.</summary>
public class ContentText : Entity
{
    public string Name { get; set; } = "";
    public string Key { get; set; } = "";
    public string ContentJson { get; set; } = "{}";
    public bool IsActive { get; set; } = true;
}

public class Page : Entity
{
    public bool IsPublished { get; set; } = true;
    /// <summary>At most one page is the home page; the storefront home renders its blocks.</summary>
    public bool IsHome { get; set; }
    public List<PageTranslation> Translations { get; set; } = [];
    public List<PageBlock> Blocks { get; set; } = [];
}

public class PageTranslation
{
    public int Id { get; set; }
    public int PageId { get; set; }
    public Page Page { get; set; } = null!;
    public string Lang { get; set; } = Languages.Default;
    public string Title { get; set; } = "";
    public string Slug { get; set; } = "";
    public string? SeoTitle { get; set; }
    public string? SeoDescription { get; set; }
}

public class PageBlock
{
    public int Id { get; set; }
    public int PageId { get; set; }
    public Page Page { get; set; } = null!;
    public int SortOrder { get; set; }
    public string Type { get; set; } = BlockTypes.Text;
    public bool IsActive { get; set; } = true;
    /// <summary>
    /// Type-specific settings as JSON:
    /// slider {"sliderId":1} | banner {"bannerId":1} | text {"textId":1} |
    /// products {"categoryId":null,"sort":"newest","limit":8,"title":{"fa":"..","en":".."}} |
    /// categories {"title":{"fa":"..","en":".."}}
    /// </summary>
    public string ConfigJson { get; set; } = "{}";
}

public static class BlockTypes
{
    public const string Slider = "slider";
    public const string Banner = "banner";
    public const string Text = "text";
    public const string Products = "products";
    public const string Categories = "categories";
    public static readonly string[] All = [Slider, Banner, Text, Products, Categories];
}
