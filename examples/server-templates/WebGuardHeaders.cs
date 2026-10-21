using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

// ASP.NET Core recipe, not an executed server fixture.
// Program.cs, BEFORE UseStaticFiles()/Map*:
// app.UseWebGuardHeaders(app.Configuration["WebGuard:HeadersFile"]
//     ?? throw new InvalidOperationException("Missing WebGuard policy path"));
// The configured trusted policy path MUST be outside every public file provider.
public static class WebGuardHeaders
{
    public static IApplicationBuilder UseWebGuardHeaders(
        this IApplicationBuilder app, string policyPath)
    {
        var policy = JsonSerializer.Deserialize<Dictionary<string, string>>(
            File.ReadAllText(policyPath))
            ?? throw new InvalidOperationException("Invalid WebGuard policy");
        var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "Content-Security-Policy", "Content-Security-Policy-Report-Only",
            "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy",
            "Cross-Origin-Opener-Policy", "Cross-Origin-Resource-Policy",
            "Cross-Origin-Embedder-Policy", "Strict-Transport-Security", "X-Frame-Options"
        };
        if (!policy.Keys.Any(k => k.Equals("Content-Security-Policy",
                StringComparison.OrdinalIgnoreCase)) ||
            policy.Any(p => !allowed.Contains(p.Key) || p.Value is null ||
                p.Value.Any(c => char.IsControl(c))))
            throw new InvalidOperationException("Invalid WebGuard response headers");

        return app.Use(async (context, next) =>
        {
            context.Response.OnStarting(() =>
            {
                foreach (var pair in policy)
                    context.Response.Headers[pair.Key] = pair.Value;
                return Task.CompletedTask;
            });
            // Defense in depth. Publish only approved browser assets to wwwroot.
            var path = context.Request.Path.Value ?? "/";
            var file = Path.GetFileName(path);
            if (path.Split('/').Any(segment => segment.StartsWith('.')) ||
                path.EndsWith(".map", StringComparison.OrdinalIgnoreCase) ||
                new[] { "webguard-report.json", "webguard-headers.json", "_headers" }
                    .Contains(file, StringComparer.OrdinalIgnoreCase))
            {
                context.Response.StatusCode = StatusCodes.Status404NotFound;
                return;
            }
            await next();
        });
    }
}
