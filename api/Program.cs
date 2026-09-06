using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using BCrypt.Net;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Bson;
using MongoDB.Driver;

var builder = WebApplication.CreateBuilder(args);

var jwtSecret = builder.Configuration["Jwt:Secret"];
if (string.IsNullOrWhiteSpace(jwtSecret) && builder.Environment.IsProduction())
{
    throw new InvalidOperationException("Jwt:Secret must be configured in production.");
}

jwtSecret ??= "local-development-secret-change-me";
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? ["http://localhost:5173"];

builder.Services.AddSingleton(new ApiStore(builder.Configuration));
builder.Services.AddSingleton(new JwtTokenService(jwtSecret, builder.Configuration["Jwt:Issuer"] ?? "namibets-api"));
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
{
    options.MapInboundClaims = false;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
        ValidateIssuer = true,
        ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "namibets-api",
        ValidateAudience = false,
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromSeconds(30)
    };
});
builder.Services.AddAuthorization(options => options.AddPolicy("Admin", policy => policy.RequireClaim(ClaimTypes.Role, "admin")));
builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("auth", limiter =>
    {
        limiter.PermitLimit = 10;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueLimit = 0;
    });
});
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .WithOrigins(allowedOrigins)
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();
app.UseExceptionHandler(errorApp => errorApp.Run(async context =>
{
    context.Response.StatusCode = StatusCodes.Status500InternalServerError;
    context.Response.ContentType = "application/json";
    await context.Response.WriteAsJsonAsync(new { message = "An unexpected server error occurred." });
}));
if (!app.Environment.IsDevelopment()) app.UseHttpsRedirection();
app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/health", (ApiStore store) => Results.Ok(new { status = "ok", mongoReady = store.MongoReady, app = "NAMIBETS" }));

app.MapPost("/api/auth/signup", async (SignupRequest request, ApiStore store, JwtTokenService tokens) =>
{
    var email = request.Email?.Trim().ToLowerInvariant();
    if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(email) || !email.Contains('@') || string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8)
        return Results.BadRequest(new { message = "Name, valid email, and a password of at least 8 characters are required." });

    if (await store.FindUserByEmail(email) is not null)
        return Results.Conflict(new { message = "A user with that email already exists." });

    var user = new User { Id = $"user-{Guid.NewGuid():N}", Name = request.Name.Trim(), Email = email, PasswordHash = BCrypt.HashPassword(request.Password), Role = "user", Balance = 2500, Tier = "Rising Player", Streak = 1 };
    await store.AddUser(user);
    return Results.Created("/api/profile", new AuthResponse(tokens.Create(user), UserSummary.From(user)));
}).RequireRateLimiting("auth");

app.MapPost("/api/auth/login", async (LoginRequest request, ApiStore store, JwtTokenService tokens) =>
{
    var email = request.Email?.Trim().ToLowerInvariant();
    var user = string.IsNullOrWhiteSpace(email) ? null : await store.FindUserByEmail(email);
    if (user is null || string.IsNullOrWhiteSpace(request.Password) || !BCrypt.Verify(request.Password, user.PasswordHash))
        return Results.Unauthorized();

    return Results.Ok(new AuthResponse(tokens.Create(user), UserSummary.From(user)));
}).RequireRateLimiting("auth");

var protectedApi = app.MapGroup("/api").RequireAuthorization();
protectedApi.MapGet("/profile", (ClaimsPrincipal principal, ApiStore store) =>
{
    var user = store.FindUser(principal.FindFirstValue(JwtRegisteredClaimNames.Sub));
    return user is null ? Results.Unauthorized() : Results.Ok(new { user = UserSummary.From(user) });
});

protectedApi.MapGet("/overview", (ClaimsPrincipal principal, ApiStore store) =>
{
    var user = store.FindUser(principal.FindFirstValue(JwtRegisteredClaimNames.Sub));
    if (user is null) return Results.Unauthorized();
    return Results.Ok(new
    {
        user = UserSummary.From(user),
        stats = new[] { new { label = "Open Wagers", value = 148, change = "+18.4%" }, new { label = "Win Ratio", value = "68.2%", change = "+2.1%" }, new { label = "Volume", value = "KES 3.2M", change = "+27.9%" }, new { label = "Trust Score", value = "96.8%", change = "+1.6%" } },
        recentSettlements = new[] { new { id = "TX-1290", title = "eFootball Champions Cup", amount = "+KES 4200", status = "Settled" }, new { id = "TX-1287", title = "Mombasa Derby", amount = "+KES 2100", status = "Pending" } }
    });
});

protectedApi.MapGet("/markets", (ApiStore store) => Results.Ok(store.Markets));
protectedApi.MapGet("/tournaments", (ApiStore store) => Results.Ok(store.Tournaments));

protectedApi.MapPost("/wagers", (CreateWagerRequest request, ClaimsPrincipal principal, ApiStore store) =>
{
    var userId = principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
    if (userId is null) return Results.Unauthorized();
    if (string.IsNullOrWhiteSpace(request.MarketId) || string.IsNullOrWhiteSpace(request.Team) || request.Stake <= 0 || request.Stake != decimal.Round(request.Stake, 2))
        return Results.BadRequest(new { message = "Valid market, side, and a positive stake with at most two decimals are required." });

    var market = store.Markets.FirstOrDefault(item => item.Id == request.MarketId);
    if (market is null) return Results.NotFound(new { message = "Market not found." });
    if (!string.Equals(market.Status, "Open for Bet", StringComparison.OrdinalIgnoreCase))
        return Results.BadRequest(new { message = "This market is not open for betting." });

    var odds = request.Team == market.TeamA ? market.OddsA : request.Team == market.TeamB ? market.OddsB : 0;
    if (odds == 0) return Results.BadRequest(new { message = "The selected side is not available for this market." });

    var wager = store.CreateWager(userId, market, request.Team, request.Stake, odds);
    return wager is null
        ? Results.BadRequest(new { message = "Insufficient balance." })
        : Results.Created($"/api/wagers/{wager.Id}", new { message = "Wager created successfully.", market = market.Title, selectedTeam = wager.Team, stake = wager.Stake, odds = wager.Odds, commission = wager.Commission, potentialReturn = wager.PotentialReturn, status = "Pending settlement" });
});

var adminApi = app.MapGroup("/api/admin").RequireAuthorization("Admin");
adminApi.MapGet("/wagers", (ApiStore store) => Results.Ok(store.Wagers.Select(wager => new { id = wager.Id, user = store.FindUser(wager.UserId)?.Name ?? "Unknown user", team = wager.Team, stake = wager.Stake, status = wager.Status })));
adminApi.MapPut("/wagers/{id}/settle", (string id, ApiStore store) =>
{
    var wager = store.SettleWager(id);
    return wager is null ? Results.NotFound(new { message = "Wager not found or already settled." }) : Results.Ok(new { message = "Wager settled and payout recorded.", wager });
});

app.Run();

public sealed record SignupRequest(string? Name, string? Email, string? Password);
public sealed record LoginRequest(string? Email, string? Password);
public sealed record CreateWagerRequest(string? MarketId, string? Team, decimal Stake);
public sealed record AuthResponse(string Token, UserSummary User);
public sealed record UserSummary(string Id, string Name, string Email, string Role, decimal Balance, string Tier, int Streak)
{
    public static UserSummary From(User user) => new(user.Id, user.Name, user.Email, user.Role, user.Balance, user.Tier, user.Streak);
}

public sealed class User
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = "user";
    public decimal Balance { get; set; }
    public string Tier { get; set; } = "Rising Player";
    public int Streak { get; set; }
}

public sealed class Wager
{
    public string Id { get; init; } = "";
    public string UserId { get; init; } = "";
    public string MarketId { get; init; } = "";
    public string Team { get; init; } = "";
    public decimal Stake { get; init; }
    public decimal Odds { get; init; }
    public decimal Commission { get; init; }
    public decimal PotentialReturn { get; init; }
    public string Status { get; set; } = "Pending";
}

public sealed class Market
{
    public string Id { get; init; } = "";
    public string Title { get; init; } = "";
    public string Stage { get; init; } = "";
    public string TeamA { get; init; } = "";
    public string TeamB { get; init; } = "";
    public decimal OddsA { get; init; }
    public decimal OddsB { get; init; }
    public decimal Pool { get; init; }
    public string Status { get; init; } = "Open for Bet";
    public string Time { get; init; } = "";
}

public sealed class ApiStore
{
    private readonly List<User> users = [];
    private readonly List<Wager> wagers = [];
    private readonly object stateLock = new();
    public bool MongoReady { get; }
    public IReadOnlyList<Wager> Wagers { get { lock (stateLock) return wagers.ToArray(); } }
    public IReadOnlyList<Market> Markets { get; } = [
        new() { Id = "m-101", Title = "eFootball Champions Cup", Stage = "Semi Final", TeamA = "Kiboko FC", TeamB = "Nairobi City", OddsA = 1.85m, OddsB = 2.10m, Pool = 4500, Time = "18:30 EAT" },
        new() { Id = "m-102", Title = "Battle Arena Clash", Stage = "Quarter Final", TeamA = "Rift XI", TeamB = "Taita Strikers", OddsA = 1.62m, OddsB = 2.35m, Pool = 2800, Status = "Matched", Time = "20:15 EAT" }
    ];
    public IReadOnlyList<object> Tournaments { get; } = [new { id = "t-1", name = "Esports Masters Cup", prize = "KES 240,000", entrants = 124, progress = "Semi-finals", status = "Live" }];

    public ApiStore(IConfiguration configuration)
    {
        users.Add(new User { Id = "user-1", Name = "Kiboko FC Fan", Email = "fan@namibets.com", PasswordHash = BCrypt.HashPassword("demo123"), Balance = 18450, Tier = "Elite Player", Streak = 6 });
        users.Add(new User { Id = "admin-1", Name = "System Admin", Email = "admin@namibets.com", PasswordHash = BCrypt.HashPassword("admin123"), Role = "admin", Balance = 50000, Tier = "Platform Admin", Streak = 12 });
        MongoReady = !string.IsNullOrWhiteSpace(configuration["MongoDb:ConnectionString"]);
    }

    public User? FindUser(string? id) => users.FirstOrDefault(user => user.Id == id);
    public Task<User?> FindUserByEmail(string email) => Task.FromResult(users.FirstOrDefault(user => user.Email == email));
    public Task AddUser(User user) { users.Add(user); return Task.CompletedTask; }

    public Wager? CreateWager(string userId, Market market, string team, decimal stake, decimal odds)
    {
        lock (stateLock)
        {
            var user = users.FirstOrDefault(item => item.Id == userId);
            if (user is null || user.Balance < stake) return null;
            var wager = new Wager { Id = $"w-{Guid.NewGuid():N}", UserId = userId, MarketId = market.Id, Team = team, Stake = stake, Odds = odds, Commission = decimal.Round(stake * 0.05m, 2), PotentialReturn = decimal.Round(stake * odds, 2) };
            user.Balance -= stake;
            wagers.Insert(0, wager);
            return wager;
        }
    }

    public Wager? SettleWager(string id)
    {
        lock (stateLock)
        {
            var wager = wagers.FirstOrDefault(item => item.Id == id && item.Status == "Pending");
            if (wager is null) return null;
            var user = users.FirstOrDefault(item => item.Id == wager.UserId);
            if (user is null) return null;
            wager.Status = "Settled";
            user.Balance += wager.PotentialReturn;
            return wager;
        }
    }
}

public sealed class JwtTokenService(string secret, string issuer)
{
    public string Create(User user)
    {
        var claims = new[] { new Claim(JwtRegisteredClaimNames.Sub, user.Id), new Claim(JwtRegisteredClaimNames.Email, user.Email), new Claim(ClaimTypes.Role, user.Role) };
        var credentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)), SecurityAlgorithms.HmacSha256);
        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(issuer, null, claims, expires: DateTime.UtcNow.AddHours(1), signingCredentials: credentials));
    }
}
