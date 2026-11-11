using System.Text.Json;
using OnShop.Domain;

namespace OnShop.Api.Contracts;

// ---------- Admin inputs / outputs ----------
public record SlideInput(
    string ImageUrl, string? LinkUrl,
    Dictionary<string, string>? Title, Dictionary<string, string>? Subtitle, Dictionary<string, string>? ButtonText);
public record SliderInput(string Name, bool IsActive, List<SlideInput> Slides);
public record SliderListItem(int Id, string Name, bool IsActive, int SlideCount);
public record SliderDetail(int Id, string Name, bool IsActive, List<SlideInput> Slides);

public record BannerInput(string Name, string ImageUrl, string? LinkUrl, Dictionary<string, string>? Title, bool IsActive);
public record BannerDetail(int Id, string Name, string ImageUrl, string? LinkUrl, Dictionary<string, string> Title, bool IsActive);

public record TextInput(string Name, string Key, Dictionary<string, string>? Content, bool IsActive);
public record TextDetail(int Id, string Name, string Key, Dictionary<string, string> Content, bool IsActive);

public record PageTranslationInput(string Lang, string Title, string? Slug, string? SeoTitle, string? SeoDescription);
public record BlockInput(string Type, bool IsActive, JsonElement Config);
public record PageInput(bool IsPublished, bool IsHome, List<PageTranslationInput> Translations, List<BlockInput> Blocks);
public record BlockDetail(int Id, string Type, bool IsActive, JsonElement Config);
public record PageDetail(int Id, bool IsPublished, bool IsHome, List<PageTranslationInput> Translations, List<BlockDetail> Blocks);
public record PageListItem(int Id, string? Title, string? Slug, bool IsPublished, bool IsHome, int BlockCount, DateTime CreatedAt);

// ---------- Stories ----------
public record StoryItemInput(string ImageUrl, string? LinkUrl, Dictionary<string, string>? Caption, int DurationSec);
public record StoryInput(string Name, bool IsActive, int SortOrder, string CoverUrl, Dictionary<string, string>? Title,
    DateTime? ExpiresAt, List<StoryItemInput> Items);
public record StoryRow(int Id, string Name, bool IsActive, int SortOrder, int ItemCount, DateTime? ExpiresAt);
public record StoryDetail(int Id, string Name, bool IsActive, int SortOrder, string CoverUrl, Dictionary<string, string> Title,
    DateTime? ExpiresAt, List<StoryItemInput> Items);
public record StoryItemDto(string ImageUrl, string? Caption, string? LinkUrl, int DurationSec);
public record StoryGroupDto(int Id, string? Title, string CoverUrl, List<StoryItemDto> Items);

// ---------- Footer designer ----------
public record FooterElementInput(string Type, JsonElement Config);
public record FooterColumnInput(double Width, List<FooterElementInput> Elements);
public record FooterSocialInput(string Network, string? Url);
public record FooterInput(
    bool IsActive, string Theme, string? HeadingColor, string? LinkColor,
    Dictionary<string, string>? Background, Dictionary<string, string>? TextColor, Dictionary<string, string>? MutedColor,
    Dictionary<string, string>? Copyright, Dictionary<string, string>? PageSlug,
    List<FooterColumnInput> Columns, List<FooterSocialInput> Socials);
public record FooterElementDetail(int Id, string Type, JsonElement Config);
public record FooterColumnDetail(int Id, double Width, List<FooterElementDetail> Elements);
public record FooterSocialDto(string Network, string Url);
public record FooterDetail(
    int Id, bool IsActive, string Theme, string? HeadingColor, string? LinkColor,
    JsonElement Background, JsonElement TextColor, JsonElement MutedColor,
    Dictionary<string, string> Copyright, Dictionary<string, string> PageSlug,
    List<FooterColumnDetail> Columns, List<FooterSocialDto> Socials);

/// <summary>The footer resolved for one language; null when the footer designer has not been used.</summary>
public record FooterColumnDto(double Width, List<object> Elements);
public record PublicFooter(
    string Theme, string? HeadingColor, string? LinkColor,
    string? Background, string? TextColor, string? MutedColor,
    string? Copyright, string? PageSlug,
    List<FooterColumnDto> Columns, List<FooterSocialDto> Socials);

// ---------- Public (resolved for one language) ----------
public record SlideDto(string ImageUrl, string? LinkUrl, string? Title, string? Subtitle, string? ButtonText);
public record SliderData(List<SlideDto> Slides);
public record BannerData(string ImageUrl, string? LinkUrl, string? Title);
public record TextData(string? Text);
public record ProductsData(string? Title, string? CategorySlug, List<ProductListItem> Items);
public record CategoriesData(string? Title, List<CategoryItem> Items);
public record BlockDto(int Id, string Type, object? Data);
public record PublicPage(int Id, string Title, string Slug, string? SeoTitle, string? SeoDescription,
    Dictionary<string, string> Alternates, List<BlockDto> Blocks);
public record PublicText(string? Text);
