param(
  [int]$Limit = 25
)

$ErrorActionPreference = "Stop"
$projectId = if ($env:GCP_PROJECT_ID) { $env:GCP_PROJECT_ID } else { (& gcloud config get-value project 2>$null).Trim() }
$projectId = $projectId.Trim()
if (-not $projectId -or $projectId -eq "(unset)") { throw "Set GCP_PROJECT_ID or configure a gcloud project before running the worker." }
$datasetId = if ($env:BIGQUERY_DATASET) { $env:BIGQUERY_DATASET } else { "school_lunch" }
$table = [string]::Concat('`', $projectId, '.', $datasetId, '.openclaw_communication', '`')
$tempRoot = Join-Path $env:TEMP "lunchbox-openclaw"
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

function Escape-Sql([string]$value) { return $value.Replace("'", "''") }
function Run-Bq([string]$sql) { & bq query --use_legacy_sql=false --project_id=$projectId --location=asia-south1 $sql | Out-Null; if ($LASTEXITCODE -ne 0) { throw "BigQuery query failed." } }
function Set-Status([string]$contactId, [string]$status, [string]$messageId = "", [string]$error = "") {
  $messageSql = if ($messageId) { "'$([Escape-Sql $messageId])'" } else { "NULL" }
  $errorSql = if ($error) { "'$([Escape-Sql $error.Substring(0, [Math]::Min(1000, $error.Length))])'" } else { "NULL" }
  $sentSql = if ($status -eq "SENT") { "CURRENT_TIMESTAMP()" } else { "NULL" }
  Run-Bq "UPDATE $table SET status='$status', sent_at=$sentSql, openclaw_message_id=$messageSql, error_message=$errorSql, updated_at=CURRENT_TIMESTAMP() WHERE contact_id='$([Escape-Sql $contactId])'"
}
function Get-MediaPath([string]$mediaUrl, [string]$contactId) {
  if (-not $mediaUrl) { return "" }
  if (Test-Path -LiteralPath $mediaUrl) { return $mediaUrl }
  $extension = [IO.Path]::GetExtension(($mediaUrl -split '[?#]')[0]); if (-not $extension) { $extension = ".bin" }
  $target = Join-Path $tempRoot "$contactId$extension"
  if ($mediaUrl -match '^gs://') { & gcloud storage cp $mediaUrl $target | Out-Null } else { Invoke-WebRequest -Uri $mediaUrl -OutFile $target }
  if ($LASTEXITCODE -and $mediaUrl -match '^gs://') { throw "Cloud Storage media download failed." }
  if (-not (Test-Path -LiteralPath $target)) { throw "Media file was not downloaded." }
  return $target
}

$query = "SELECT contact_id, name, whatsapp_number, message_text, media_url FROM $table WHERE status='QUEUED' AND whatsapp_consent=TRUE AND (media_url IS NULL OR media_url = '') ORDER BY scheduled_at, created_at LIMIT $Limit"
$raw = & bq query --use_legacy_sql=false --project_id=$projectId --location=asia-south1 --format=json $query
if ($LASTEXITCODE -ne 0) { throw "Unable to read queued OpenClaw messages." }
$jobs = if ($raw) { @($raw | ConvertFrom-Json) } else { @() }
foreach ($job in $jobs) {
  try {
    Set-Status $job.contact_id "SENDING"
    $mediaPath = Get-MediaPath ([string]$job.media_url) $job.contact_id
    $output = if ($mediaPath) {
      & openclaw message send --channel whatsapp --account default --target $job.whatsapp_number --media $mediaPath --message $job.message_text 2>&1 | Out-String
    } else {
      & openclaw message send --channel whatsapp --account default --target $job.whatsapp_number --message $job.message_text 2>&1 | Out-String
    }
    if ($LASTEXITCODE -ne 0 -or $output -notmatch 'Message ID:\s*([A-Za-z0-9]+)') { throw "OpenClaw delivery failed: $output" }
    Set-Status $job.contact_id "SENT" $Matches[1]
    if ($mediaPath -and $mediaPath.StartsWith($tempRoot)) { Remove-Item -LiteralPath $mediaPath -Force -ErrorAction SilentlyContinue }
  } catch {
    Set-Status $job.contact_id "FAILED" "" $_.Exception.Message
  }
}

Write-Output "Processed $($jobs.Count) queued OpenClaw message(s)."
