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
    /// <summary>Appearance options as JSON, see <see cref="SlideStyle"/>.</summary>
    public string StyleJson { get; set; } = "{}";
}

/// <summary>
/// Per-slide appearance: which parts are shown and their colours. Stored as <see cref="Slide.StyleJson"/>.
/// Colours are hex (#rgb, #rrggbb or #rrggbbaa); null means "use the storefront default".
/// Device restricts the slide to one kind of screen: all, desktop (≥768px) or mobile.
/// </summary>
public record SlideStyle(
    bool ShowText = true,
    bool ShowButton = true,
    bool ShowBackground = true,
    string? BackgroundColor = null,
    string? OverlayColor = null,
    string? TextColor = null,
    string? ButtonColor = null,
    string? ButtonTextColor = null,
    string TextAlign = "start",
    string Device = "all");

/// <summary>Where a content block or slide is shown: on every screen, only on desktop, or only on mobile.</summary>
public static class Devices
{
    public const string All = "all";
    public const string Desktop = "desktop";
    public const string Mobile = "mobile";
    public static readonly string[] AllValues = [All, Desktop, Mobile];
    public static bool IsValid(string? value) => value is not null && AllValues.Contains(value);
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

/// <summary>
/// The site footer, built in the admin's footer designer. There is a single row (a unique index enforces it).
/// Columns are grid columns on desktop; every column is a stack of elements rendered in order.
/// </summary>
public class FooterLayout : Entity
{
    public bool IsActive { get; set; } = true;
    /// <summary>{"text":"...","link":"...","title":"..."} in every supported language.</summary>
    public string BackgroundJson { get; set; } = "{}";
    public string TextColorJson { get; set; } = "{}";
    public string MutedColorJson { get; set; } = "{}";
    /// <summary>Remaining text of the copyright line: "© {year} {site} <text>".</summary>
    public string CopyrightJson { get; set; } = "{}";
    /// <summary>"dark" (colours follow the background) or "custom" (own heading/link colours).</summary>
    public string Theme { get; set; } = "dark";
    public string? HeadingColor { get; set; }
    public string? LinkColor { get; set; }
    /// <summary>{"fa":"some-slug"} — optional store page linked from the copyright line.</summary>
    public string? PageSlugJson { get; set; }
    public List<FooterColumn> Columns { get; set; } = [];
    public List<FooterSocial> Socials { get; set; } = [];
}

public class FooterColumn
{
    public int Id { get; set; }
    public int FooterLayoutId { get; set; }
    public FooterLayout FooterLayout { get; set; } = null!;
    public int SortOrder { get; set; }
    /// <summary>Fraction (0.1 - 1) of the row width; all columns are scaled to fit exactly one row.</summary>
    public double Width { get; set; } = 0.25;
    public List<FooterElement> Elements { get; set; } = [];
}

/// <summary>
/// One element in a footer column. Type-specific settings live in <see cref="ConfigJson"/>:
/// heading {"text":{"fa":".."}} | text {"text":{"fa":".."}} | links {"items":[{"text":{"fa":".."},"link":"/products"}]} |
/// contact {"items":[{"icon":"phone","text":"021...","link":"tel:..."}]} | logo {"logo":true,"text":true} |
/// newsletter {} | socials {} (renders all social links) | image {"imageUrl":"/uploads/.."}.
/// </summary>
public class FooterElement
{
    public int Id { get; set; }
    public int FooterColumnId { get; set; }
    public FooterColumn FooterColumn { get; set; } = null!;
    public int SortOrder { get; set; }
    public string Type { get; set; } = FooterElementTypes.Text;
    public string ConfigJson { get; set; } = "{}";
}

public static class FooterElementTypes
{
    public const string Heading = "heading";
    public const string Text = "text";
    public const string Links = "links";
    public const string Contact = "contact";
    public const string Logo = "logo";
    public const string Newsletter = "newsletter";
    public const string Socials = "socials";
    public const string Image = "image";
    /// <summary>Raw HTML pasted by the admin (e.g. a trust badge); sanitized by the API before it is stored.</summary>
    public const string Html = "html";
    public static readonly string[] All = [Heading, Text, Links, Contact, Logo, Newsletter, Socials, Image, Html];
    /// <summary>Icons a contact item may use.</summary>
    public static readonly string[] Icons = ["phone", "mail", "pin", "clock"];
    /// <summary>Size presets every element accepts (the storefront maps them to fonts/icons).</summary>
    public static readonly string[] Sizes = ["sm", "md", "lg", "xl"];
}

public class FooterSocial
{
    public int Id { get; set; }
    public int FooterLayoutId { get; set; }
    public FooterLayout FooterLayout { get; set; } = null!;
    public int SortOrder { get; set; }
    /// <summary>instagram | telegram | whatsapp | facebook | linkedin | youtube | twitter | website</summary>
    public string Network { get; set; } = "";
    public string Url { get; set; } = "";
}

public static class FooterSocials
{
    public static readonly string[] All = ["instagram", "telegram", "whatsapp", "facebook", "linkedin", "youtube", "twitter", "website"];
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
