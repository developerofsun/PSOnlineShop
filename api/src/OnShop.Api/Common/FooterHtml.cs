using System.Text;
using System.Text.RegularExpressions;

namespace OnShop.Api.Common;

/// <summary>
/// Cleans the raw HTML an admin pastes into a footer "html" element (e.g. the e-namad trust badge):
/// only a small allowlist of tags and attributes survives, URLs must be safe, and scripts/styles are dropped.
/// </summary>
public static partial class FooterHtml
{
    public const int MaxLength = 5000;

    /// <summary>Elements whose whole content is dropped: nothing inside them is meant to be visible text.</summary>
    [GeneratedRegex(@"<\s*(script|style|noscript|template|iframe|object|embed|svg|math|form)\b[^>]*>.*?<\s*/\s*\1\s*>",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex BlockRx();

    /// <summary>An unclosed dangerous opening tag (the rest of the input is then treated as its content).</summary>
    [GeneratedRegex(@"<\s*(script|style|iframe|object|embed|svg|math|form)\b[^>]*>", RegexOptions.IgnoreCase)]
    private static partial Regex OpenDangerRx();

    [GeneratedRegex(@"<[^>]*>", RegexOptions.Singleline)]
    private static partial Regex TagRx();

    [GeneratedRegex(@"^<\s*/\s*([a-zA-Z][a-zA-Z0-9-]*)")]
    private static partial Regex CloseRx();

    [GeneratedRegex(@"^<\s*([a-zA-Z][a-zA-Z0-9-]*)")]
    private static partial Regex OpenRx();

    [GeneratedRegex(@"([^\s=/>]+)(?:\s*=\s*(?:""([^""]*)""|'([^']*)'|([^\s>]+)))?", RegexOptions.Singleline)]
    private static partial Regex AttrRx();

    private static readonly HashSet<string> Tags = new(StringComparer.OrdinalIgnoreCase)
    {
        "a", "img", "span", "div", "p", "br", "hr", "strong", "b", "em", "i", "u", "s", "small", "sub", "sup", "code", "pre",
        "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "figure", "figcaption", "center",
        "h1", "h2", "h3", "h4", "h5", "h6",
    };

    private static readonly HashSet<string> GlobalAttrs = new(StringComparer.OrdinalIgnoreCase)
    {
        "class", "style", "title", "dir", "lang", "width", "height",
    };

    private static readonly Dictionary<string, HashSet<string>> TagAttrs = new(StringComparer.OrdinalIgnoreCase)
    {
        ["a"] = new(StringComparer.OrdinalIgnoreCase) { "href", "target", "rel", "referrerpolicy", "hreflang" },
        ["img"] = new(StringComparer.OrdinalIgnoreCase) { "src", "alt", "referrerpolicy", "loading", "decoding" },
        ["td"] = new(StringComparer.OrdinalIgnoreCase) { "colspan", "rowspan" },
        ["th"] = new(StringComparer.OrdinalIgnoreCase) { "colspan", "rowspan" },
        ["ol"] = new(StringComparer.OrdinalIgnoreCase) { "start" },
    };

    private static bool Allowed(string tag, string attr) =>
        GlobalAttrs.Contains(attr) || (TagAttrs.TryGetValue(tag, out var set) && set.Contains(attr));

    /// <summary>Site-relative, http(s), tel: and mailto: only (plus safe raster data URIs for images).</summary>
    private static bool SafeUrl(string value, bool allowData)
    {
        var v = new string(value.Where(c => !char.IsControl(c) && !char.IsWhiteSpace(c)).ToArray()).ToLowerInvariant();
        if (v.Length == 0) return false;
        if (v.StartsWith('/')) return !v.StartsWith("//");
        if (v.StartsWith("http://") || v.StartsWith("https://")
            || v.StartsWith("tel:") || v.StartsWith("mailto:")) return true;
        return allowData && (v.StartsWith("data:image/png") || v.StartsWith("data:image/jpeg")
            || v.StartsWith("data:image/gif") || v.StartsWith("data:image/webp"));
    }

    private static bool SafeStyle(string value)
    {
        var v = value.ToLowerInvariant();
        return !v.Contains("expression") && !v.Contains("javascript:") && !v.Contains("@import")
            && !v.Contains("behavior") && !v.Contains("url(");
    }

    private static string EscapeAttr(string value) =>
        value.Replace("&quot;", "\"").Replace("\"", "&quot;").Replace("<", "&lt;").Replace(">", "&gt;");

    /// <summary>Text outside tags keeps its entities; a stray "&lt;" is escaped so it cannot open a tag.</summary>
    private static string EscapeText(string value) => value.Replace("<", "&lt;");

    public static string Sanitize(string? html)
    {
        if (string.IsNullOrWhiteSpace(html)) return "";

        var input = OpenDangerRx().Replace(BlockRx().Replace(html, " "), " ");
        var sb = new StringBuilder(Math.Min(input.Length, MaxLength));
        var index = 0;

        foreach (Match m in TagRx().Matches(input))
        {
            sb.Append(EscapeText(input[index..m.Index]));
            index = m.Index + m.Length;

            var tag = m.Value.Trim();
            if (tag.StartsWith("<!") || tag.StartsWith("<?")) continue; // comments, doctype, CDATA, processing instructions

            var closing = CloseRx().Match(tag);
            if (closing.Success)
            {
                var name = closing.Groups[1].Value.ToLowerInvariant();
                if (Tags.Contains(name)) sb.Append("</").Append(name).Append('>');
                continue;
            }

            var opening = OpenRx().Match(tag);
            if (!opening.Success) continue;
            var tagName = opening.Groups[1].Value.ToLowerInvariant();
            if (!Tags.Contains(tagName)) continue;

            var body = tag[opening.Length..];
            body = body.EndsWith("/>", StringComparison.Ordinal) ? body[..^2]
                : body.EndsWith('>') ? body[..^1]
                : body;

            var written = new StringBuilder().Append('<').Append(tagName);
            var opensNewTab = false;
            var hasRel = false;

            foreach (Match a in AttrRx().Matches(body))
            {
                var attr = a.Groups[1].Value.ToLowerInvariant();
                if (attr.StartsWith("on") || !Allowed(tagName, attr)) continue;

                var value = a.Groups[2].Success ? a.Groups[2].Value
                    : a.Groups[3].Success ? a.Groups[3].Value
                    : a.Groups[4].Success ? a.Groups[4].Value
                    : null;

                if (attr is "href" or "src")
                {
                    if (value is null || !SafeUrl(value, allowData: attr == "src")) continue;
                }
                else if (attr == "style")
                {
                    if (value is null || !SafeStyle(value)) continue;
                }
                else if (attr == "target")
                {
                    if (value is not ("_blank" or "_self" or "_parent" or "_top")) continue;
                    opensNewTab = value == "_blank";
                }
                else if (attr == "rel" && value is not null)
                {
                    hasRel = true;
                }

                written.Append(' ').Append(attr);
                if (value is not null) written.Append("=\"").Append(EscapeAttr(value)).Append('"');
            }

            // A badge that opens a new tab must not hand the opener window to the external page.
            if (opensNewTab && !hasRel) written.Append(" rel=\"noopener noreferrer\"");
            written.Append(tagName is "img" or "br" or "hr" ? " />" : ">");
            sb.Append(written);
        }

        sb.Append(EscapeText(input[index..]));
        return sb.ToString().Trim();
    }
}
