namespace OnShop.Infrastructure.Persistence;

/// <summary>Set at startup by DbSeeder depending on what the PostgreSQL server supports.</summary>
public static class SearchCapabilities
{
    /// <summary>True when the pg_trgm extension is available (typo-tolerant search).</summary>
    public static bool Trigram { get; internal set; }
}
