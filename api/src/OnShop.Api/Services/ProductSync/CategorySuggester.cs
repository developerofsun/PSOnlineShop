using Microsoft.EntityFrameworkCore;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Services.ProductSync;

/// <summary>
/// Advisory guess of a category for a new product: how many of the product's words appear in a category's name
/// (strong) and in the names of products already in it (weaker). It only ever fills
/// <see cref="Product.SuggestedCategoryId"/>; an admin approves it.
/// </summary>
public class CategorySuggester
{
    private readonly List<(int Id, HashSet<string> NameWords, Dictionary<string, int> Vocab, int Size)> _cats = [];

    private CategorySuggester() { }

    public static async Task<CategorySuggester> BuildAsync(AppDbContext db, int uncategorizedId, CancellationToken ct)
    {
        var s = new CategorySuggester();
        var cats = await db.Categories.AsNoTracking()
            .Where(c => c.Id != uncategorizedId && c.IsActive)
            .Select(c => new { c.Id, Names = c.Translations.Select(t => t.Name).ToList() })
            .ToListAsync(ct);
        var names = await db.ProductTranslations.AsNoTracking()
            .Where(t => t.Product.CategoryId != null && t.Product.CategoryId != uncategorizedId && !t.Product.NeedsReview)
            .Select(t => new { CategoryId = t.Product.CategoryId!.Value, t.Name })
            .ToListAsync(ct);
        var byCat = names.ToLookup(x => x.CategoryId, x => x.Name);

        foreach (var c in cats)
        {
            var vocab = new Dictionary<string, int>();
            var size = 0;
            foreach (var n in byCat[c.Id])
            {
                size++;
                foreach (var w in Words(n).Distinct()) vocab[w] = vocab.GetValueOrDefault(w) + 1;
            }
            s._cats.Add((c.Id, c.Names.SelectMany(Words).ToHashSet(), vocab, size));
        }
        return s;
    }

    /// <summary>The best matching category id, or null when nothing in the name points anywhere.</summary>
    public int? Suggest(string productName)
    {
        var words = Words(productName).Distinct().ToList();
        if (words.Count == 0) return null;

        int? best = null;
        var bestScore = 0.0;
        foreach (var (id, nameWords, vocab, size) in _cats)
        {
            var score = 0.0;
            foreach (var w in words)
            {
                if (nameWords.Contains(w)) score += 5;
                if (size > 0 && vocab.TryGetValue(w, out var n)) score += (double)n / size;
            }
            if (score > bestScore) { bestScore = score; best = id; }
        }
        return bestScore >= 1 ? best : null;
    }

    private static IEnumerable<string> Words(string? text) =>
        Normalizer.ForSearch(text).Split(' ', StringSplitOptions.RemoveEmptyEntries).Where(w => w.Length >= 2);
}
