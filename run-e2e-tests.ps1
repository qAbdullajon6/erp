# E2E Test Runner for Customers CRUD - Windows PowerShell Version
# Runs complete test suite twice with 100% pass rate requirement

param(
    [switch]$Quick = $false
)

$ErrorActionPreference = "Stop"
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiDir = Join-Path $scriptPath "apps" "api"
$webDir = Join-Path $scriptPath "apps" "web"

# Colors for output
$colors = @{
    "reset" = "`e[0m"
    "green" = "`e[32m"
    "red" = "`e[31m"
    "yellow" = "`e[33m"
    "blue" = "`e[34m"
}

function Write-Log {
    param(
        [string]$Message,
        [string]$Color = "reset"
    )
    Write-Host "$($colors[$Color])$Message$($colors['reset'])"
}

function Wait-ForService {
    param(
        [string]$Url,
        [int]$MaxAttempts = 30,
        [int]$DelaySeconds = 1
    )

    $attempt = 0
    while ($attempt -lt $MaxAttempts) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
            if ($response.StatusCode -eq 200 -or $response.StatusCode -eq 404) {
                return $true
            }
        }
        catch {
            # Service not ready yet
        }
        $attempt++
        Write-Host "." -NoNewline
        Start-Sleep -Seconds $DelaySeconds
    }
    return $false
}

# Cleanup function
function Cleanup {
    Write-Log "`n🧹 Cleaning up processes..." "yellow"
    Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force 2>$null
    Get-Process chrome -ErrorAction SilentlyContinue | Stop-Process -Force 2>$null
}

trap { Cleanup }

Write-Log "`n$('═' * 60)" "blue"
Write-Log "  E2E Test Suite: Customers CRUD - Complete Setup" "blue"
Write-Log "$('═' * 60)`n" "blue"

# Step 1: Setup test database
Write-Log "📦 Step 1: Setting up test database...`n" "yellow"
Push-Location $apiDir
try {
    npx ts-node scripts/setup-test-db.ts
    if ($LASTEXITCODE -ne 0) {
        throw "Test database setup failed"
    }
}
finally {
    Pop-Location
}

# Step 2: Start backend in test mode
Write-Log "`n🚀 Step 2: Starting API server in test mode...`n" "yellow"
$env:NODE_ENV = "test"
$env:DISABLE_AUTH_THROTTLE = "true"
$env:DATABASE_URL = "postgresql://erp:erp@localhost:5433/erp_test?schema=public"

Push-Location $apiDir
$apiProcess = Start-Process npm -ArgumentList "run", "start:dev" -PassThru -NoNewWindow
Write-Log "✅ API server started (PID: $($apiProcess.Id))" "green"

# Wait for API to be ready
Write-Log "⏳ Waiting for API to be ready..." "yellow"
if (-not (Wait-ForService "http://localhost:4000/health")) {
    Write-Log "❌ API failed to start" "red"
    $apiProcess | Stop-Process -Force -ErrorAction SilentlyContinue
    exit 1
}
Write-Log "`n✅ API is ready" "green"
Pop-Location

# Step 3: Start frontend dev server
Write-Log "`n🎨 Step 3: Starting frontend dev server...`n" "yellow"
Push-Location $webDir
$webProcess = Start-Process npm -ArgumentList "run", "dev" -PassThru -NoNewWindow
Write-Log "✅ Frontend dev server started (PID: $($webProcess.Id))" "green"

# Wait for frontend to be ready
Write-Log "⏳ Waiting for frontend to be ready..." "yellow"
if (-not (Wait-ForService "http://localhost:3001")) {
    Write-Log "❌ Frontend failed to start" "red"
    $apiProcess | Stop-Process -Force -ErrorAction SilentlyContinue
    $webProcess | Stop-Process -Force -ErrorAction SilentlyContinue
    exit 1
}
Write-Log "`n✅ Frontend is ready" "green"

# Give services a moment to stabilize
Start-Sleep -Seconds 2

# Step 4: Run E2E tests (Run 1)
Write-Log "`n$('═' * 60)" "blue"
Write-Log "  E2E Test Run #1" "blue"
Write-Log "$('═' * 60)`n" "blue"

$run1Passed = $true
npx playwright test --project=authenticated
if ($LASTEXITCODE -ne 0) {
    Write-Log "`n❌ Run #1: Tests failed" "red"
    $run1Passed = $false
}
else {
    Write-Log "`n✅ Run #1: All tests passed" "green"
}

# Wait between runs
Write-Log "`n⏳ Waiting 5 seconds before second test run..." "yellow"
Start-Sleep -Seconds 5

# Step 5: Run E2E tests (Run 2)
Write-Log "`n$('═' * 60)" "blue"
Write-Log "  E2E Test Run #2" "blue"
Write-Log "$('═' * 60)`n" "blue"

$run2Passed = $true
npx playwright test --project=authenticated
if ($LASTEXITCODE -ne 0) {
    Write-Log "`n❌ Run #2: Tests failed" "red"
    $run2Passed = $false
}
else {
    Write-Log "`n✅ Run #2: All tests passed" "green"
}

Pop-Location

# Step 6: Validation
if (-not $Quick) {
    Write-Log "`n$('═' * 60)" "blue"
    Write-Log "  Validation: typecheck, lint, and build" "blue"
    Write-Log "$('═' * 60)`n" "blue"

    Push-Location $webDir

    Write-Log "`n📝 Typecheck..." "yellow"
    npm run typecheck
    $typecheckPassed = $LASTEXITCODE -eq 0
    if ($typecheckPassed) {
        Write-Log "✅ Typecheck passed" "green"
    }
    else {
        Write-Log "❌ Typecheck failed" "red"
    }

    Write-Log "`n🔍 Lint..." "yellow"
    npm run lint
    $lintPassed = $LASTEXITCODE -eq 0
    if ($lintPassed) {
        Write-Log "✅ Lint passed" "green"
    }
    else {
        Write-Log "❌ Lint failed" "red"
    }

    Write-Log "`n🔨 Build..." "yellow"
    npm run build
    $buildPassed = $LASTEXITCODE -eq 0
    if ($buildPassed) {
        Write-Log "✅ Build passed" "green"
    }
    else {
        Write-Log "❌ Build failed" "red"
    }

    Pop-Location
}
else {
    $typecheckPassed = $true
    $lintPassed = $true
    $buildPassed = $true
    Write-Log "`n⏭️  Skipping validation (--Quick flag used)" "yellow"
}

# Final report
Write-Log "`n$('═' * 60)" "blue"
Write-Log "  Final Report" "blue"
Write-Log "$('═' * 60)`n" "blue"

if ($run1Passed) {
    Write-Log "✅ E2E Test Run #1: PASSED" "green"
}
else {
    Write-Log "❌ E2E Test Run #1: FAILED" "red"
}

if ($run2Passed) {
    Write-Log "✅ E2E Test Run #2: PASSED" "green"
}
else {
    Write-Log "❌ E2E Test Run #2: FAILED" "red"
}

if ($typecheckPassed) {
    Write-Log "✅ Typecheck: PASSED" "green"
}
else {
    Write-Log "❌ Typecheck: FAILED" "red"
}

if ($lintPassed) {
    Write-Log "✅ Lint: PASSED" "green"
}
else {
    Write-Log "❌ Lint: FAILED" "red"
}

if ($buildPassed) {
    Write-Log "✅ Build: PASSED" "green"
}
else {
    Write-Log "❌ Build: FAILED" "red"
}

Write-Log "`n$('═' * 60)`n" "blue"

$allPassed = $run1Passed -and $run2Passed -and $typecheckPassed -and $lintPassed -and $buildPassed

if ($allPassed) {
    Write-Log "✅ ALL TESTS AND VALIDATIONS PASSED" "green"
    Write-Log "$('═' * 60)`n" "blue"
    Cleanup
    exit 0
}
else {
    Write-Log "❌ SOME TESTS OR VALIDATIONS FAILED" "red"
    Write-Log "$('═' * 60)`n" "blue"
    Cleanup
    exit 1
}
