# SurrealDB Binaries for Production Builds

For production Electron builds, you need to download platform-specific SurrealDB binaries and place them in the respective directories:

## Download Instructions

### macOS
```bash
# For ARM64 (Apple Silicon)
curl -L https://download.surrealdb.com/v1.3.2/surreal-v1.3.2.darwin-arm64 -o mac/surreal
chmod +x mac/surreal

# For x64 (Intel)
curl -L https://download.surrealdb.com/v1.3.2/surreal-v1.3.2.darwin-amd64 -o mac/surreal
chmod +x mac/surreal
```

### Windows
```bash
curl -L https://download.surrealdb.com/v1.3.2/surreal-v1.3.2.windows-amd64.exe -o win/surreal.exe
```

### Linux
```bash
curl -L https://download.surrealdb.com/v1.3.2/surreal-v1.3.2.linux-amd64 -o linux/surreal
chmod +x linux/surreal
```

## Development Mode

In development mode, Electron will use the system-installed SurrealDB binary from your PATH. Make sure you have SurrealDB installed:

```bash
# macOS/Linux
brew install surrealdb/tap/surreal

# Or download directly from https://surrealdb.com/install
```

## Note

These binaries are only needed when building the final packaged Electron app for distribution. They are **not** required for development.
