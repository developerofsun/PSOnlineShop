namespace OnShop.Domain;

/// <summary>A saved delivery address of a customer.</summary>
public class Address
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string Title { get; set; } = "";
    public string FullName { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Province { get; set; } = "";
    public string City { get; set; } = "";
    public string Line { get; set; } = "";
    public string PostalCode { get; set; } = "";
    public double? Lat { get; set; }
    public double? Lng { get; set; }
    public bool IsDefault { get; set; }
}

public class Favorite
{
    public int UserId { get; set; }
    public int ProductId { get; set; }
    public Product Product { get; set; } = null!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Seconds a customer spent in the 3D store on one calendar day (Tehran time). Used for the daily limit.</summary>
public class Shop3dUsage
{
    public int Id { get; set; }
    public int UserId { get; set; }
    /// <summary>yyyy-MM-dd in Tehran time.</summary>
    public string Day { get; set; } = "";
    public int Seconds { get; set; }
    public DateTime? LastBeatAt { get; set; }
}
