$ErrorActionPreference = 'Continue'
Set-Location a:\freelancingg\RankAutonomous\apps\api
$tests = @(
  "src/test/backlink-test.ts",
  "src/test/backlinks-api-test.ts",
  "src/test/backlink-verification-schema-test.ts",
  "src/test/verifyBacklink-test.ts",
  "src/test/trigger-backlink-verification-test.ts",
  "src/test/backlink-trigger-api-test.ts",
  "src/test/backlink-discovery-outreach-test.ts"
)

$passed = 0
$failed = 0

foreach ($test in $tests) {
  Write-Host "Running $test..."
  npx.cmd ts-node $test
  if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] $test" -ForegroundColor Green
    $passed++
  } else {
    Write-Host "[FAIL] $test" -ForegroundColor Red
    $failed++
  }
}

Write-Host "Done. $passed passed, $failed failed."
if ($failed -gt 0) { exit 1 }
