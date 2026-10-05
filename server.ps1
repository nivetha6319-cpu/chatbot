# RoseAI — PowerShell Web Server + AI Proxy
param([int]$Port = 5000)

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")

try {
    $listener.Start()
    Write-Host "=========================================="
    Write-Host "  RoseAI Server : http://localhost:$Port"
    Write-Host "  AI Proxy      : /api/chat  (POST)"
    Write-Host "=========================================="
} catch {
    Write-Error "Failed to start listener: $_"
    exit 1
}

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".woff2"= "font/woff2"
}

$baseDir = $PSScriptRoot
if (-not $baseDir) { $baseDir = Get-Location }

# ── Helper: send JSON response ──────────────────────────────────────────────
function Send-Json($response, [int]$code, $obj) {
    $json  = $obj | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $response.StatusCode      = $code
    $response.ContentType     = "application/json; charset=utf-8"
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.Close()
}

while ($listener.IsListening) {
    try {
        $context  = $listener.GetContext()
        $request  = $context.Request
        $response = $context.Response

        $urlPath = $request.Url.LocalPath
        if ($urlPath -eq "/" -or $urlPath -eq "") { $urlPath = "/index.html" }

        $response.AddHeader("Access-Control-Allow-Origin",  "*")
        $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS")
        $response.AddHeader("Access-Control-Allow-Headers", "Content-Type")
        $response.AddHeader("Cache-Control", "no-cache")

        # ── OPTIONS preflight ───────────────────────────────────────────────
        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.Close()
            continue
        }

        # ── POST /api/chat  →  AI Proxy ────────────────────────────────────
        if ($request.HttpMethod -eq "POST" -and $urlPath -eq "/api/chat") {
            try {
                # Read request body
                $reader  = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                $body    = $reader.ReadToEnd()
                $bodyObj = $body | ConvertFrom-Json

                # Extract fields
                $msgs   = $bodyObj.messages
                $model  = if ($bodyObj.model)  { $bodyObj.model }  else { "openai" }
                $system = if ($bodyObj.system) { $bodyObj.system } else { "You are a helpful AI assistant." }

                # Get last user message
                $lastUser = ($msgs | Where-Object { $_.role -eq "user" } | Select-Object -Last 1).content
                if (-not $lastUser) { $lastUser = "Hello" }

                # Build full context (last 4 exchanges)
                $contextLines = @()
                $recent = $msgs | Select-Object -Last 8
                foreach ($m in $recent) {
                    if ($m.role -eq "user")      { $contextLines += "Human: $($m.content)" }
                    elseif ($m.role -eq "assistant") { $contextLines += "AI: $($m.content)" }
                }
                $contextLines += "AI:"
                $ctx = $contextLines -join "`n"

                # Truncate if too long
                if ($ctx.Length -gt 1800) { $ctx = "Human: $lastUser`nAI:" }

                # Encode for URL
                $encodedCtx = [System.Uri]::EscapeDataString($ctx)
                $encodedSys = [System.Uri]::EscapeDataString($system.Substring(0, [Math]::Min($system.Length, 300)))
                $seed       = Get-Random -Minimum 1 -Maximum 9999

                $polUrl = "https://text.pollinations.ai/$encodedCtx?model=$model&system=$encodedSys&seed=$seed"

                Write-Host "[AI] Calling Pollinations model=$model"

                $webClient = New-Object System.Net.WebClient
                $webClient.Encoding = [System.Text.Encoding]::UTF8
                $aiText = $webClient.DownloadString($polUrl)

                if ($aiText -and $aiText.Trim().Length -gt 0) {
                    Write-Host "[AI] Got response ($($aiText.Length) chars)"
                    Send-Json $response 200 @{ reply = $aiText.Trim(); model = $model }
                } else {
                    Send-Json $response 500 @{ error = "Empty response from AI" }
                }

            } catch {
                $errMsg = $_.Exception.Message
                Write-Host "[AI] Error: $errMsg"
                Send-Json $response 500 @{ error = $errMsg }
            }
            continue
        }

        # ── Static file serving ─────────────────────────────────────────────
        $cleanPath = $urlPath.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
        $filePath  = [System.IO.Path]::Combine($baseDir, $cleanPath)

        if ([System.IO.File]::Exists($filePath)) {
            $ext         = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }

            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentType     = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.StatusCode      = 200

            if ($request.HttpMethod -ne "HEAD") {
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            }
        } else {
            $notFound = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.StatusCode      = 404
            $response.ContentType     = "text/plain; charset=utf-8"
            $response.ContentLength64 = $notFound.Length
            if ($request.HttpMethod -ne "HEAD") {
                $response.OutputStream.Write($notFound, 0, $notFound.Length)
            }
        }
        $response.Close()

    } catch {
        # ignore client disconnects / pipe errors
    }
}
