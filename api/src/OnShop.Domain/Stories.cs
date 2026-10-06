namespace OnShop.Domain;

/// <summary>A story group (the circle at the top of the storefront) holding a sequence of full-screen items.</summary>
public class Story : Entity
{
    public string Name { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
    /// <summary>Local /uploads/... image for the circle. Empty = first letter of the title.</summary>
    public string CoverUrl { get; set; } = "";
    public string TitleJson { get; set; } = "{}";
    /// <summary>After this moment (UTC) the story is hidden. Null = never expires.</summary>
    public DateTime? ExpiresAt { get; set; }
    public List<StoryItem> Items { get; set; } = [];
}

public class StoryItem
{
    public int Id { get; set; }
    public int StoryId { get; set; }
    public Story Story { get; set; } = null!;
    public int SortOrder { get; set; }
    public string ImageUrl { get; set; } = "";
    public string CaptionJson { get; set; } = "{}";
    public string? LinkUrl { get; set; }
    public int DurationSec { get; set; } = 5;
}
