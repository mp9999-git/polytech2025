# server.ps1 - Polytech Memorial Local HTTP Server
# Uses TcpListener (raw socket) + RunspacePool for concurrent requests.
# No http.sys / no admin rights needed / port released instantly on exit.
#
# Usage: set POLYTECH_ROOT=<game folder> then run this script.
# The launcher bat handles that automatically.

$port = 8765
$root = ($env:POLYTECH_ROOT).TrimEnd('\')

$mimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.txt'  = 'text/plain; charset=utf-8'
    '.png'  = 'image/png'
    '.webp' = 'image/webp'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.gif'  = 'image/gif'
    '.ico'  = 'image/x-icon'
    '.mp3'  = 'audio/mpeg'
    '.mp4'  = 'video/mp4'
    '.svg'  = 'image/svg+xml'
    '.woff' = 'font/woff'
    '.woff2'= 'font/woff2'
}

Write-Host ""
Write-Host "  ================================================"
Write-Host "   Polytech Memorial - Local Server"
Write-Host "  ================================================"
Write-Host ""
Write-Host "  Root: $root"

if (-not $root -or -not (Test-Path $root)) {
    Write-Host ""
    Write-Host "  [ERROR] Game folder not found."
    Write-Host "  Please use the launcher .bat file, not this script directly."
    Write-Host ""
    Read-Host "  Press Enter to exit"
    exit 1
}

# --- Request handler (runs inside each RunspacePool slot) ---
$handlerScript = {
    param($client, $root, $mimeTypes)
    try {
        $stream = $client.GetStream()
        $stream.ReadTimeout = 5000

        # Read HTTP request headers until CRLFCRLF
        $buf = New-Object byte[] 8192
        $totalRead = 0
        $headerEnd = -1
        while ($headerEnd -lt 0 -and $totalRead -lt $buf.Length) {
            $n = $stream.Read($buf, $totalRead, $buf.Length - $totalRead)
            if ($n -le 0) { break }
            $totalRead += $n
            for ($i = 0; $i -le $totalRead - 4; $i++) {
                if ($buf[$i] -eq 13 -and $buf[$i+1] -eq 10 -and
                    $buf[$i+2] -eq 13 -and $buf[$i+3] -eq 10) {
                    $headerEnd = $i + 4; break
                }
            }
        }

        $reqText = [System.Text.Encoding]::ASCII.GetString($buf, 0, [Math]::Max($headerEnd, 1))
        $lines   = $reqText -split "`r`n"

        # Parse "GET /path HTTP/1.1"
        $parts  = $lines[0] -split ' '
        $urlRaw = if ($parts.Length -ge 2) { $parts[1] } else { '/' }
        $qi = $urlRaw.IndexOf('?')
        if ($qi -ge 0) { $urlRaw = $urlRaw.Substring(0, $qi) }
        $path = [Uri]::UnescapeDataString($urlRaw)
        if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }

        # Parse Range header (for audio seeking support)
        $rangeHeader = $null
        foreach ($line in $lines) {
            if ($line -match '^Range:\s*bytes=(.+)$') { $rangeHeader = $matches[1]; break }
        }

        # Resolve file path with traversal protection
        $relative = $path.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar)
        $filePath = [IO.Path]::GetFullPath([IO.Path]::Combine($root, $relative))

        if (-not $filePath.StartsWith($root)) {
            $body   = [Text.Encoding]::UTF8.GetBytes("403 Forbidden")
            $header = "HTTP/1.1 403 Forbidden`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
        } elseif (Test-Path $filePath -PathType Leaf) {
            $ext      = [IO.Path]::GetExtension($filePath).ToLower()
            $mime     = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { 'application/octet-stream' }
            $allBytes = [IO.File]::ReadAllBytes($filePath)
            $fileLen  = $allBytes.Length

            if ($rangeHeader -and $rangeHeader -match '^(\d*)-(\d*)$') {
                # 206 Partial Content
                $s = if ($matches[1]) { [long]$matches[1] } else { 0L }
                $e = if ($matches[2]) { [long]$matches[2] } else { [long]($fileLen - 1) }
                if ($s -lt 0)        { $s = 0L }
                if ($e -ge $fileLen) { $e = [long]($fileLen - 1) }
                $len  = $e - $s + 1
                $body = $allBytes[$s..$e]
                $header = "HTTP/1.1 206 Partial Content`r`nContent-Type: $mime`r`nContent-Length: $len`r`nContent-Range: bytes $s-$e/$fileLen`r`nAccept-Ranges: bytes`r`nConnection: close`r`n`r`n"
            } else {
                # 200 OK
                $body   = $allBytes
                $header = "HTTP/1.1 200 OK`r`nContent-Type: $mime`r`nContent-Length: $fileLen`r`nAccept-Ranges: bytes`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
            }
        } else {
            $body   = [Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
            $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
        }

        $hb = [Text.Encoding]::ASCII.GetBytes($header)
        $stream.Write($hb, 0, $hb.Length)
        if ($null -ne $body -and $body.Length -gt 0) {
            $stream.Write($body, 0, $body.Length)
        }
        $stream.Flush()
    } catch {}
    finally { try { $client.Close() } catch {} }
}

# --- RunspacePool: up to 20 concurrent request handlers ---
$pool = [System.Management.Automation.Runspaces.RunspaceFactory]::CreateRunspacePool(1, 20)
$pool.Open()

# --- Start TcpListener on loopback only ---
try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
    $listener.Start()
} catch {
    Write-Host ""
    Write-Host "  [ERROR] Could not start on port $port : $_"
    Write-Host ""
    Read-Host "  Press Enter to exit"
    exit 1
}

Write-Host "  URL : http://localhost:$port"
Write-Host ""
Write-Host "  Close this window to stop the server."
Write-Host ""

# --- Accept loop ---
try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        $ps = [System.Management.Automation.PowerShell]::Create()
        $ps.RunspacePool = $pool
        $null = $ps.AddScript($handlerScript)
        $null = $ps.AddArgument($client)
        $null = $ps.AddArgument($root)
        $null = $ps.AddArgument($mimeTypes)
        $null = $ps.BeginInvoke()
    }
} catch {}

$listener.Stop()
$pool.Close()
Write-Host "  Server stopped."
