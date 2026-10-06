namespace OnShop.Api.Common;

public record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);

public static class Paging
{
    public static (int page, int size) Clamp(int page, int size, int maxSize = 100)
        => (Math.Max(1, page), Math.Clamp(size, 1, maxSize));
}
