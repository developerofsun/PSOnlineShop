namespace OnShop.Api.Contracts;

public record ProfileDto(string FullName, string? Phone, string? Email, DateTime CreatedAt);
public record ProfileInput(string FullName, string? Email);
public record PasswordInput(string CurrentPassword, string NewPassword);

public record AddressInput(string Title, string FullName, string Phone, string Province, string City, string Line, string PostalCode, bool IsDefault, double? Lat = null, double? Lng = null);
public record AddressDto(int Id, string Title, string FullName, string Phone, string Province, string City, string Line, string PostalCode, bool IsDefault, double? Lat = null, double? Lng = null);

public record PaymentDto(string OrderNumber, long Amount, string? Reference, DateTime PaidAt, string Status);
