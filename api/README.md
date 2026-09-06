# NAMIBETS ASP.NET Core API

This API is the C# replacement for the Express server. It preserves the frontend's existing `/api` routes for health, authentication, profile, overview, markets, tournaments, wagers, and admin settlement.

## Run locally

Install the .NET 10 SDK, then from the repository root:

```powershell
dotnet restore api/Namibets.Api.csproj
dotnet run --project api/Namibets.Api.csproj --urls http://localhost:5000
```

Configure secrets with environment variables or user secrets. Do not commit them:

```powershell
$env:Jwt__Secret = "use-a-long-random-development-secret"
$env:MongoDb__ConnectionString = "mongodb://localhost:27017/namibets"
```

For production, provide `Jwt__Secret`; the API refuses to start without it. Restrict `Cors__AllowedOrigins` to the deployed frontend origin.

The current implementation uses an in-memory store while the MongoDB repository and transaction layer are being ported. Do not deploy it as the production money ledger until that persistence layer is complete.
