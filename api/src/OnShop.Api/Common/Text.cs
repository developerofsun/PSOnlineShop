using System.Text;
using System.Text.RegularExpressions;
using OnShop.Domain;

namespace OnShop.Api.Common;

public static class Text
{
    /// <summary>Unifies Arabic/Persian letter variants and converts all digits to ASCII.</summary>
    public static string Normalize(string? s) => Normalizer.Normalize(s);

    /// <summary>Unicode-friendly slug: keeps Persian letters, lowercases Latin, joins words with '-'.</summary>
    public static string Slugify(string? s)
    {
        var text = Normalize(s).Trim().ToLowerInvariant();
        var sb = new StringBuilder();
        var lastDash = false;
        foreach (var ch in text)
        {
            if (char.IsLetterOrDigit(ch)) { sb.Append(ch); lastDash = false; }
            else if (!lastDash && sb.Length > 0) { sb.Append('-'); lastDash = true; }
        }
        return sb.ToString().Trim('-');
    }

    private static readonly Regex MobileRx = new(@"^09\d{9}$", RegexOptions.Compiled);
    private static readonly Regex PostalRx = new(@"^\d{10}$", RegexOptions.Compiled);

    public static string NormalizePhone(string? s)
    {
        var p = Normalize(s).Replace(" ", "").Replace("-", "");
        if (p.StartsWith("+98")) p = "0" + p[3..];
        else if (p.StartsWith("0098")) p = "0" + p[4..];
        else if (p.StartsWith("98") && p.Length == 12) p = "0" + p[2..];
        return p;
    }

    public static bool IsMobile(string phone) => MobileRx.IsMatch(phone);
    public static bool IsPostalCode(string code) => PostalRx.IsMatch(code);

    /// <summary>Escapes % _ \ so user input is matched literally inside ILIKE patterns.</summary>
    public static string EscapeLike(string s)
    {
        var b = ((char)92).ToString(); // the backslash: PostgreSQL's default ILIKE escape character
        return s.Replace(b, b + b).Replace("%", b + "%").Replace("_", b + "_");
    }

    /// <summary>Both null (no location) or both present and inside the valid latitude/longitude range.</summary>
    public static bool IsValidCoordinate(double? lat, double? lng) =>
        (lat is null && lng is null)
        || (lat is >= -90 and <= 90 && lng is >= -180 and <= 180 && !double.IsNaN(lat.Value) && !double.IsNaN(lng.Value));

    /// <summary>Only local upload paths (or empty) are accepted for images.</summary>
    public static bool IsLocalImage(string? url) =>
        string.IsNullOrEmpty(url) || (url.StartsWith("/uploads/", StringComparison.Ordinal) && !url.Contains(".."));

    /// <summary>Links may be site-relative or http(s); never javascript: or protocol-relative.</summary>
    public static bool IsSafeLink(string? url) =>
        string.IsNullOrEmpty(url)
        || (url.StartsWith('/') && !url.StartsWith("//"))
        || url.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
        || url.StartsWith("https://", StringComparison.OrdinalIgnoreCase);
}
