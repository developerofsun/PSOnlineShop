using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace OnShop.Domain;

public static class Normalizer
{
    /// <summary>Unifies Arabic/Persian letter variants and converts all digits to ASCII.</summary>
    public static string Normalize(string? s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        var sb = new StringBuilder(s.Length);
        foreach (var ch in s)
        {
            sb.Append(ch switch
            {
                'ي' or 'ى' => 'ی',
                'ك' => 'ک',
                >= '٠' and <= '٩' => (char)('0' + (ch - '٠')),
                >= '۰' and <= '۹' => (char)('0' + (ch - '۰')),
                _ => ch
            });
        }
        return sb.ToString();
    }

    /// <summary>Lowercase, unify letters, drop diacritics/tatweel, turn ZWNJ and punctuation into spaces.</summary>
    public static string ForSearch(string? s)
    {
        var n = Normalize(s).ToLowerInvariant();
        var sb = new StringBuilder(n.Length);
        var lastSpace = true;
        foreach (var ch in n)
        {
            if (ch == (char)0x0640 || (ch >= (char)0x064B && ch <= (char)0x065F)) continue; // tatweel, Arabic diacritics
            if (char.IsLetterOrDigit(ch)) { sb.Append(ch); lastSpace = false; }
            else if (!lastSpace) { sb.Append(' '); lastSpace = true; }
        }
        return sb.ToString().Trim();
    }

    public static List<string> Tokens(string? q, int max = 6) =>
        ForSearch(q).Split(' ', StringSplitOptions.RemoveEmptyEntries).Distinct().Take(max).ToList();

    /// <summary>
    /// Text the product search runs against: normalized name/description/sku plus the name with spaces removed,
    /// so "تیشرت" finds "تی‌شرت" and vice versa.
    /// </summary>
    public static string BuildSearchText(string name, string? shortDescription, string? sku)
    {
        var main = ForSearch($"{name} {shortDescription} {sku}");
        var condensed = ForSearch(name).Replace(" ", "");
        return $"{main} {condensed}".Trim();
    }
}

/// <summary>Helpers for the {"fa":"...","en":"..."} JSON columns.</summary>
public static class Localized
{
    private static readonly JsonSerializerOptions Options = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    public static Dictionary<string, string> Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try { return JsonSerializer.Deserialize<Dictionary<string, string>>(json) ?? new(); }
        catch (JsonException) { return new(); }
    }

    public static string ToJson(Dictionary<string, string>? values)
    {
        var clean = (values ?? new())
            .Where(kv => Languages.Supported.Contains(kv.Key) && !string.IsNullOrWhiteSpace(kv.Value))
            .ToDictionary(kv => kv.Key, kv => kv.Value.Trim());
        return JsonSerializer.Serialize(clean, Options);
    }

    /// <summary>Text in the requested language, falling back to the default language, then to anything.</summary>
    public static string? Pick(string? json, string lang)
    {
        var d = Parse(json);
        if (d.TryGetValue(lang, out var v) && !string.IsNullOrWhiteSpace(v)) return v;
        if (d.TryGetValue(Languages.Default, out v) && !string.IsNullOrWhiteSpace(v)) return v;
        return d.Values.FirstOrDefault(x => !string.IsNullOrWhiteSpace(x));
    }
}
