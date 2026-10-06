using Microsoft.EntityFrameworkCore;
using OnShop.Api.Contracts;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Services;

public record AssistantLink(string Label, string Url);
public record AssistantReply(string Reply, List<ProductListItem> Products, List<AssistantLink> Links);

/// <summary>
/// The shop assistant. This is a local, rule-based helper (keyword intents + the catalog search), not a language
/// model. To use a real model later, implement <see cref="IAssistantBrain"/> (for example against a local Ollama)
/// and register it instead of <see cref="RuleBasedAssistant"/>.
/// </summary>
public interface IAssistantBrain
{
    Task<AssistantReply> AskAsync(string message, string lang, int? userId, IReadOnlyCollection<int> cart);
}

public class RuleBasedAssistant(AppDbContext db, CatalogService catalog, RecommendationService recs) : IAssistantBrain
{
    private static readonly HashSet<string> Stop = new()
    {
        // Persian filler words (ZWNJ is normalized to a space, so "می‌خوام" becomes "می" + "خوام")
        "می", "خوام", "میخوام", "میخواهم", "خواهم", "دارید", "دارین", "دارم", "لطفا", "یک", "یه", "برای", "من", "را", "رو",
        "هست", "آیا", "چه", "کجا", "پیدا", "کن", "کنید", "نشان", "بده", "بدید", "میشه", "می‌شه", "شه", "و", "با", "از", "به",
        // English
        "i", "want", "a", "an", "the", "please", "need", "looking", "for", "show", "me", "do", "you", "have", "find", "any",
        "some", "is", "there", "can", "get", "buy", "of", "to"
    };

    private static readonly Dictionary<string, (string Fa, string En)> Status = new()
    {
        ["Pending"] = ("در انتظار پرداخت", "awaiting payment"),
        ["Paid"] = ("پرداخت‌شده", "paid"),
        ["Processing"] = ("در حال آماده‌سازی", "being prepared"),
        ["Shipped"] = ("ارسال شده", "shipped"),
        ["Delivered"] = ("تحویل داده شده", "delivered"),
        ["Cancelled"] = ("لغو شده", "cancelled"),
        ["Refunded"] = ("مسترد شده", "refunded"),
    };

    public async Task<AssistantReply> AskAsync(string message, string langRaw, int? userId, IReadOnlyCollection<int> cart)
    {
        var lang = CatalogService.Lang(langRaw);
        var fa = lang == "fa";
        string T(string f, string e) => fa ? f : e;

        var text = Normalizer.ForSearch(message);
        var tokens = text.Split(' ', StringSplitOptions.RemoveEmptyEntries).ToHashSet();
        // Short Latin words must match whole words ("hi" must not match "this"); longer words may match inside.
        bool Has(params string[] words) => words.Any(w => w.Length <= 3 ? tokens.Contains(w) : text.Contains(w));

        // ---- greeting
        if (Has("سلام", "درود", "hi", "hello", "hey") && tokens.Count <= 3)
            return new(T("سلام! 👋 می‌توانم محصول پیدا کنم، پیشنهاد بدهم، تخفیف‌ها را نشان بدهم و وضعیت سفارش شما را بگویم. چه کمکی از من برمی‌آید؟",
                         "Hello! 👋 I can find products, suggest items, show deals and check your order status. How can I help?"), [], []);

        // ---- order status
        if (Has("سفارش", "پیگیری", "order", "track", "tracking"))
        {
            if (userId is null)
                return new(T("برای پیگیری سفارش ابتدا وارد حساب کاربری شوید.", "Please sign in to track your order."),
                    [], [new(T("ورود / ثبت‌نام", "Sign in / Register"), "/account/login")]);

            var o = await db.Orders.AsNoTracking().Where(x => x.UserId == userId).OrderByDescending(x => x.Id).FirstOrDefaultAsync();
            if (o is null)
                return new(T("هنوز سفارشی ثبت نکرده‌اید.", "You have not placed any orders yet."), [], [new(T("مشاهده محصولات", "Browse products"), "/products")]);

            var st = Status.TryGetValue(o.Status.ToString(), out var s) ? (fa ? s.Fa : s.En) : o.Status.ToString();
            return new(T($"آخرین سفارش شما ({o.Number}) {st} است.", $"Your latest order ({o.Number}) is {st}."),
                [], [new(T("همه سفارش‌های من", "All my orders"), "/account")]);
        }

        // ---- suggestions (uses purchase history, cart and favorites)
        if (Has("پیشنهاد", "توصیه", "suggest", "recommend", "recommendation") || text.Contains("چی بخرم"))
        {
            var sections = await recs.BuildAsync(userId, cart, lang, 6);
            var pick = sections.FirstOrDefault(x => x.Key is "buyAgain" or "forYou") ?? sections.FirstOrDefault();
            if (pick is null)
                return new(T("فعلاً پیشنهادی ندارم.", "I have no suggestions yet."), [], [new(T("مشاهده محصولات", "Browse products"), "/products")]);
            var reply = pick.Key switch
            {
                "buyAgain" => T("بر اساس خریدهای قبلی شما، شاید دوباره به اینها نیاز داشته باشید:", "Based on what you bought before, you may need these again:"),
                "forYou" => T("بر اساس خریدهای شما و سبد فعلی، اینها را پیشنهاد می‌کنم:", "Based on your purchases and current cart, I suggest:"),
                _ => T("اینها پرفروش‌ترین‌های فروشگاه هستند:", "These are our best sellers:")
            };
            return new(reply, pick.Items, []);
        }

        // ---- deals
        if (Has("تخفیف", "حراج", "ارزان", "شگفت", "deal", "deals", "offer", "offers", "sale", "discount", "cheap"))
        {
            var r = await catalog.SearchAsync(new ProductQuery(lang, null, null, "discount", null, null, true, true, 1, 6));
            return r.Items.Count == 0
                ? new(T("در حال حاضر کالای تخفیف‌داری نداریم.", "There are no discounted items right now."), [], [])
                : new(T("این کالاها الان تخفیف دارند:", "These items are on sale right now:"), r.Items.ToList(), [new(T("همه تخفیف‌ها", "All offers"), "/products?onSale=true")]);
        }

        // ---- delivery / payment / support
        if (Has("ارسال", "تحویل", "پیک", "delivery", "shipping", "ship"))
        {
            var cost = await db.Settings.Where(x => x.Key == "shop.shipping_cost").Select(x => x.Value).FirstOrDefaultAsync();
            var free = long.TryParse(cost, out var c) && c == 0;
            return new(free
                ? T("ارسال سفارش‌ها رایگان است. آدرس تحویل را می‌توانید روی نقشه مشخص کنید تا پیک سریع‌تر شما را پیدا کند.",
                    "Delivery is free. You can pin your delivery point on the map so the courier finds you faster.")
                : T($"هزینه ارسال {c:N0} تومان است. آدرس تحویل را می‌توانید روی نقشه مشخص کنید.",
                    $"Delivery costs {c:N0} Toman. You can pin your delivery point on the map."), [], []);
        }
        if (Has("پرداخت", "payment", "pay", "card"))
            return new(T("پرداخت به‌صورت آنلاین از طریق درگاه امن انجام می‌شود و پس از پرداخت موفق، سفارش شما ثبت می‌شود.",
                         "Payment is online through a secure gateway; your order is confirmed after a successful payment."), [], []);
        if (Has("پشتیبانی", "تماس", "support", "contact", "phone"))
        {
            var t = await db.ContentTexts.AsNoTracking().Where(x => x.Key == "footer" && x.IsActive).FirstOrDefaultAsync();
            var info = t is null ? null : Localized.Pick(t.ContentJson, lang);
            return new(info ?? T("برای پشتیبانی با ما تماس بگیرید.", "Please contact our support team."), [], []);
        }

        // ---- default: product search
        var terms = tokens.Where(x => !Stop.Contains(x)).ToList();
        if (terms.Count > 0)
        {
            var found = await catalog.SearchAsync(new ProductQuery(lang, null, string.Join(' ', terms), null, null, null, false, false, 1, 6));
            if (found.Items.Count > 0)
                return new(found.Fuzzy
                        ? T("دقیقاً همین را پیدا نکردم؛ نزدیک‌ترین‌ها اینها هستند:", "I did not find an exact match; here are the closest items:")
                        : T("اینها را پیدا کردم:", "Here is what I found:"),
                    found.Items.ToList(),
                    [new(T("نمایش همه نتایج", "See all results"), $"/products?q={Uri.EscapeDataString(string.Join(' ', terms))}")]);
        }

        return new(T("متوجه نشدم. می‌توانید نام محصول را بنویسید (مثلاً «شیر» یا «سیب»)، یا بپرسید: تخفیف‌ها، پیشنهاد برای من، وضعیت سفارش، هزینه ارسال.",
                     "I did not understand. Type a product name (for example \"milk\" or \"apple\"), or ask about deals, suggestions for me, order status or delivery."),
            [], [new(T("مشاهده محصولات", "Browse products"), "/products")]);
    }
}
