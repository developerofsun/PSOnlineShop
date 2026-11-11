# ---- build ----
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Restore first, so a source-only change does not re-download packages.
COPY Directory.Build.props OnShop.sln ./
COPY src/OnShop.Domain/OnShop.Domain.csproj src/OnShop.Domain/
COPY src/OnShop.Infrastructure/OnShop.Infrastructure.csproj src/OnShop.Infrastructure/
COPY src/OnShop.Api/OnShop.Api.csproj src/OnShop.Api/
RUN dotnet restore OnShop.sln

COPY src/ src/
RUN dotnet publish src/OnShop.Api/OnShop.Api.csproj -c Release -o /app --no-restore

# ---- runtime ----
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Uploaded media lives here; mount a volume over it so images survive a redeploy.
RUN mkdir -p /app/uploads

COPY --from=build /app ./

ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_URLS=http://+:8080 \
    Storage__UploadsPath=/app/uploads \
    DOTNET_RUNNING_IN_CONTAINER=true

EXPOSE 8080

# Run as the non-root user that ships with the ASP.NET image.
USER $APP_UID

ENTRYPOINT ["dotnet", "OnShop.Api.dll"]
