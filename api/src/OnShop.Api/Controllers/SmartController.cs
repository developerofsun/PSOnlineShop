using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OnShop.Api.Services;

namespace OnShop.Api.Controllers;

public record AssistantRequest(string? Message, string? Lang, List<int>? Cart);

/// <summary>Personalization endpoints. Both work for guests; a valid token adds purchase history.</summary>
[ApiController, AllowAnonymous]
public class SmartController(RecommendationService recommendations, IAssistantBrain assistant) : ControllerBase
{
    private int? UserId =>
        User.Identity?.IsAuthenticated == true && int.TryParse(User.FindFirstValue("sub"), out var id) ? id : null;

    /// <summary>seeds = comma-separated product ids (cart / favorites) the page wants to personalize around.</summary>
    [HttpGet("api/recommendations")]
    public Task<List<RecommendationSection>> Recommendations(
        [FromQuery] string? seeds, [FromQuery] string? lang, [FromQuery] int limit = 5)
    {
        var ids = (seeds ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(s => int.TryParse(s, out var n) ? n : 0);
        return recommendations.BuildAsync(UserId, ids, lang, limit);
    }

    [HttpPost("api/assistant")]
    public async Task<ActionResult<AssistantReply>> Ask(AssistantRequest req)
    {
        var message = (req.Message ?? "").Trim();
        if (message.Length is 0 or > 300) return BadRequest(new { error = "پیام نامعتبر است." });
        return await assistant.AskAsync(message, req.Lang ?? "fa", UserId, (req.Cart ?? []).Take(50).ToList());
    }
}
