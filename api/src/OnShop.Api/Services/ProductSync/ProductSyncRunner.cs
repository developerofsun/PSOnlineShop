using Microsoft.EntityFrameworkCore;
using OnShop.Domain;
using OnShop.Infrastructure.Persistence;

namespace OnShop.Api.Services.ProductSync;

/// <summary>Sync settings (admin-editable, stored in Settings; "sync." keys are not public).</summary>
public record ProductSyncSettings(bool Enabled, int IntervalMinutes)
{
    public const string EnabledKey = "sync.kyan_enabled";
    public const string IntervalKey = "sync.kyan_interval_minutes";

    public static async Task<ProductSyncSettings> ReadAsync(AppDbContext db, CancellationToken ct = default)
    {
        var values = await db.Settings.AsNoTracking()
            .Where(s => s.Key == EnabledKey || s.Key == IntervalKey)
            .ToDictionaryAsync(s => s.Key, s => s.Value, ct);
        var enabled = values.GetValueOrDefault(EnabledKey) != "false";
        var minutes = int.TryParse(values.GetValueOrDefault(IntervalKey), out var m) ? Math.Clamp(m, 1, 1440) : 15;
        return new ProductSyncSettings(enabled, minutes);
    }
}

/// <summary>
/// Runs one sync at a time (the schedule and the admin's "Sync now" share the gate) and records every run in
/// ProductSyncRuns. Scheduled runs retry twice; a manual run reports its error straight away.
/// </summary>
public class ProductSyncRunner(IServiceScopeFactory scopes, ILogger<ProductSyncRunner> log)
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    public bool IsRunning => _gate.CurrentCount == 0;

    /// <summary>Returns the finished run, or null when a run is already in progress.</summary>
    public async Task<ProductSyncRun?> RunAsync(string trigger, CancellationToken ct)
    {
        if (!await _gate.WaitAsync(0, ct)) return null;
        try
        {
            ProductSyncRun run;
            using (var scope = scopes.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                run = new ProductSyncRun { Trigger = trigger };
                db.ProductSyncRuns.Add(run);
                await db.SaveChangesAsync(ct);
            }

            try
            {
                var result = await SyncWithRetryAsync(trigger == "Schedule", ct);
                run.Fetched = result.Fetched; run.Created = result.Created; run.Updated = result.Updated;
                run.Unchanged = result.Unchanged; run.Skipped = result.Skipped; run.NotInFeed = result.NotInFeed;
                run.Warnings = result.Warnings.Count == 0 ? null : Truncate(string.Join('\n', result.Warnings), 8000);
                run.Status = "Succeeded";
                log.LogInformation("Kyan product sync: {Created} created, {Updated} updated, {Unchanged} unchanged, {NotInFeed} not in feed",
                    run.Created, run.Updated, run.Unchanged, run.NotInFeed);
            }
            catch (Exception ex)
            {
                run.Status = "Failed";
                run.Error = ex is OperationCanceledException ? "Cancelled." : Truncate(ex.Message, 2000);
                if (ex is not OperationCanceledException) log.LogError(ex, "Kyan product sync failed");
            }

            run.FinishedAt = DateTime.UtcNow;
            using (var scope = scopes.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                db.ProductSyncRuns.Update(run);
                await db.SaveChangesAsync(CancellationToken.None);
            }
            return run;
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<ProductSyncResult> SyncWithRetryAsync(bool retry, CancellationToken ct)
    {
        var delays = retry ? new[] { TimeSpan.FromSeconds(30), TimeSpan.FromMinutes(2) } : Array.Empty<TimeSpan>();
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                using var scope = scopes.CreateScope(); // a fresh context per attempt: a failed one is never reused
                return await scope.ServiceProvider.GetRequiredService<ProductSyncService>().SyncAsync(ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException && attempt < delays.Length)
            {
                log.LogWarning(ex, "Kyan product sync failed (attempt {Attempt}), retrying in {Delay}", attempt + 1, delays[attempt]);
                await Task.Delay(delays[attempt], ct);
            }
        }
    }

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max];
}

/// <summary>Starts a sync whenever the configured interval has passed since the last one (settings are re-read each minute).</summary>
public class ProductSyncBackgroundService(
    ProductSyncRunner runner, IServiceScopeFactory scopes, KyanClient kyan, ILogger<ProductSyncBackgroundService> log)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!kyan.IsConfigured)
        {
            log.LogInformation("Kyan product sync is off: Kyan:BaseUrl is not configured.");
            return;
        }

        try
        {
            await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken); // let startup (schema, seed) finish first
            await MarkInterruptedAsync(stoppingToken);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = scopes.CreateScope();
                    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                    var settings = await ProductSyncSettings.ReadAsync(db, stoppingToken);
                    if (settings.Enabled)
                    {
                        var last = await db.ProductSyncRuns.AsNoTracking()
                            .OrderByDescending(r => r.StartedAt).Select(r => (DateTime?)r.StartedAt).FirstOrDefaultAsync(stoppingToken);
                        if (last is null || DateTime.UtcNow >= last.Value.AddMinutes(settings.IntervalMinutes))
                            await runner.RunAsync("Schedule", stoppingToken);
                    }
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    log.LogError(ex, "Scheduled Kyan product sync check failed");
                }
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // shutting down
        }
    }

    /// <summary>A run left "Running" by a stopped process can never finish; close it.</summary>
    private async Task MarkInterruptedAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.ProductSyncRuns.Where(r => r.Status == "Running")
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, "Failed")
                .SetProperty(r => r.Error, "Interrupted (the service stopped during the run).")
                .SetProperty(r => r.FinishedAt, (DateTime?)DateTime.UtcNow), ct);
    }
}
