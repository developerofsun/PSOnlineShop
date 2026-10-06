# Generates the PWA PNG icons (192, 512 and a maskable 512) for both apps using System.Drawing.
# Run once:  powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
Add-Type -AssemblyName System.Drawing

function New-Icon([string]$path, [int]$size, [bool]$maskable, [string]$hex) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.TextRenderingHint = 'AntiAliasGridFit'
    $bg = [System.Drawing.ColorTranslator]::FromHtml($hex)
    if ($maskable) {
        # maskable icons must be full-bleed; the OS applies its own mask
        $g.Clear($bg)
    } else {
        # rounded look with transparent corners
        $g.Clear([System.Drawing.Color]::Transparent)
        $r = [int]($size * 0.22)
        $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
        $gp.AddArc(0, 0, $r * 2, $r * 2, 180, 90)
        $gp.AddArc($size - $r * 2, 0, $r * 2, $r * 2, 270, 90)
        $gp.AddArc($size - $r * 2, $size - $r * 2, $r * 2, $r * 2, 0, 90)
        $gp.AddArc(0, $size - $r * 2, $r * 2, $r * 2, 90, 90)
        $gp.CloseAllFigures()
        $g.FillPath((New-Object System.Drawing.SolidBrush $bg), $gp)
    }
    $fontSize = if ($maskable) { $size * 0.36 } else { $size * 0.46 }
    $font = New-Object System.Drawing.Font('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = 'Center'; $sf.LineAlignment = 'Center'
    $rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
    $g.DrawString('OS', $font, [System.Drawing.Brushes]::White, $rect, $sf)
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
}

$root = Split-Path -Parent $PSScriptRoot
$targets = @(
    @{ dir = Join-Path $root 'storefront\public\icons'; color = '#0f766e' },
    @{ dir = Join-Path $root 'admin\public\icons';      color = '#1d4ed8' }
)
foreach ($t in $targets) {
    New-Item -ItemType Directory -Force -Path $t.dir | Out-Null
    New-Icon (Join-Path $t.dir 'icon-192.png') 192 $false $t.color
    New-Icon (Join-Path $t.dir 'icon-512.png') 512 $false $t.color
    New-Icon (Join-Path $t.dir 'maskable-512.png') 512 $true $t.color
}
Write-Host 'Icons generated.'
