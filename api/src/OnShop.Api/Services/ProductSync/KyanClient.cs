using System.Text.Json;

namespace OnShop.Api.Services.ProductSync;

/// <summary>One row of Kyan's <c>GET /products</c> (the accounting system's product and price view).</summary>
public class KyanProduct
{
    public int Id { get; set; }
    public string? Barcode { get; set; }
    public string? Name { get; set; }
    public decimal RegularPrice { get; set; }
    /// <summary>Price after discount; 0 or not below the regular price means "no discount".</summary>
    public decimal PedarSalarPrice { get; set; }
    public decimal Quantity { get; set; }
}

/// <summary>Reads the product list from the Kyan relation manager (same network, X-Api-Key header).</summary>
public class KyanClient(HttpClient http, IConfiguration config)
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    public bool IsConfigured => !string.IsNullOrWhiteSpace(config["Kyan:BaseUrl"]);

    public async Task<List<KyanProduct>> GetProductsAsync(CancellationToken ct)
    {
        var baseUrl = config["Kyan:BaseUrl"];
        if (string.IsNullOrWhiteSpace(baseUrl))
            throw new InvalidOperationException("Kyan:BaseUrl is not configured.");

        using var request = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl.TrimEnd('/')}/products");
        request.Headers.Add("X-Api-Key", config["Kyan:ApiKey"] ?? "");
        using var response = await http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        return await JsonSerializer.DeserializeAsync<List<KyanProduct>>(stream, Json, ct) ?? [];
    }
}
