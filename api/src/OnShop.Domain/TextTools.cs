using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;

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

/// <summary>Reads, normalizes and validates the appearance options stored in <see cref="Slide.StyleJson"/>.</summary>
public static class SlideStyles
{
    public static readonly string[] Aligns = ["start", "center", "end"];

    private static readonly Regex HexColor =
        new(@"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$", RegexOptions.Compiled);

    // Web defaults: camelCase on the way out (matching the API's JSON), case-insensitive when writing/reading names.
    private static readonly JsonSerializerOptions Options =
        new(JsonSerializerDefaults.Web) { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    /// <summary>Missing or damaged JSON falls back to the defaults (everything shown), never to something hidden.</summary>
    public static SlideStyle Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new SlideStyle();
        try
        {
            using var doc = JsonDocument.Parse(json);
            var r = doc.RootElement;
            if (r.ValueKind != JsonValueKind.Object) return new SlideStyle();
            return new SlideStyle(
                Bool(r, "showText") ?? true,
                Bool(r, "showButton") ?? true,
                Bool(r, "showBackground") ?? true,
                Text(r, "backgroundColor"),
                Text(r, "overlayColor"),
                Text(r, "textColor"),
                Text(r, "buttonColor"),
                Text(r, "buttonTextColor"),
                Text(r, "textAlign") ?? "start",
                Text(r, "device") ?? Devices.All);
        }
        catch (JsonException) { return new SlideStyle(); }
    }

    /// <summary>Normalizes before storage: unknown alignment falls back, invalid colours become null.</summary>
    public static SlideStyle Clean(SlideStyle? s) => new(
        s?.ShowText ?? true,
        s?.ShowButton ?? true,
        s?.ShowBackground ?? true,
        Color(s?.BackgroundColor),
        Color(s?.OverlayColor),
        Color(s?.TextColor),
        Color(s?.ButtonColor),
        Color(s?.ButtonTextColor),
        Aligns.Contains(s?.TextAlign ?? "") ? s!.TextAlign : "start",
        Devices.IsValid(s?.Device) ? s!.Device : Devices.All);

    public static string ToJson(SlideStyle? s) => JsonSerializer.Serialize(Clean(s), Options);

    /// <summary>Null when the style is acceptable; otherwise the message the admin sees.</summary>
    public static string? Validate(SlideStyle? s)
    {
        if (s is null) return null;
        foreach (var (name, value) in new[]
                 {
                     ("پس‌زمینه", s.BackgroundColor), ("پرده‌ی متن", s.OverlayColor), ("متن", s.TextColor),
                     ("دکمه", s.ButtonColor), ("متن دکمه", s.ButtonTextColor)
                 })
            if (!string.IsNullOrWhiteSpace(value) && !HexColor.IsMatch(value.Trim()))
                return $"رنگ {name} باید کد هگز باشد (مثلاً #1f2937).";
        if (s.TextAlign is { } align && !Aligns.Contains(align)) return "جهت متن نامعتبر است.";
        if (s.Device is { } device && !Devices.IsValid(device)) return "نمایش روی دستگاه نامعتبر است.";
        return null;
    }

    private static string? Color(string? c) => string.IsNullOrWhiteSpace(c) ? null : (HexColor.IsMatch(c.Trim()) ? c.Trim() : null);

    private static bool? Bool(JsonElement r, string name) =>
        Find(r, name) is { ValueKind: JsonValueKind.True or JsonValueKind.False } v ? v.GetBoolean() : null;

    private static string? Text(JsonElement r, string name) =>
        Find(r, name) is { ValueKind: JsonValueKind.String } v && !string.IsNullOrWhiteSpace(v.GetString())
            ? v.GetString()!.Trim() : null;

    /// <summary>Case-insensitive lookup, so JSON written by an older build (PascalCase) still reads correctly.</summary>
    private static JsonElement? Find(JsonElement r, string name)
    {
        foreach (var p in r.EnumerateObject())
            if (string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase))
                return p.Value;
        return null;
    }
}
