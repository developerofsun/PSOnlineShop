namespace OnShop.Api.Contracts;

public record PermissionDto(string Key, string Group, string Label);
public record RoleDto(int Id, string Name, bool IsSystem, int UserCount, string[] Permissions);
public record RoleInput(string Name, string[] Permissions);
public record RoleLookup(int Id, string Name);

public record UserListItem(
    int Id, string FullName, string? UserName, string? Email, string? Phone,
    string[] Roles, bool IsDisabled, DateTime CreatedAt);

public record UserInput(
    string FullName, string UserName, string? Email, string? Phone,
    string? Password, string[] Roles, bool IsActive);
