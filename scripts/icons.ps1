$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$iconFolder = Join-Path (Split-Path -Parent $PSScriptRoot) 'extension\icons'
New-Item -ItemType Directory -Path $iconFolder -Force | Out-Null

function New-RoundedRectangle([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $radius * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

# Simple geometry: rounded square + download arrow (stem, triangle, base).
# System blue stays visible on both light and dark Chrome toolbars and matches the panel accent.
foreach ($iconSize in @(16, 32, 48, 128)) {
  $iconBitmap = New-Object System.Drawing.Bitmap($iconSize, $iconSize)
  $iconGraphics = [System.Drawing.Graphics]::FromImage($iconBitmap)
  $tileBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#1a73e8'))
  $markBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $tile = New-RoundedRectangle 10 10 108 108 24
  $stem = New-RoundedRectangle 58 28 12 42 6
  $base = New-RoundedRectangle 43 94 42 9 4
  try {
    $iconGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $iconGraphics.Clear([System.Drawing.Color]::Transparent)
    $iconGraphics.ScaleTransform($iconSize / 128.0, $iconSize / 128.0)
    $iconGraphics.FillPath($tileBrush, $tile)
    $iconGraphics.FillPath($markBrush, $stem)
    $iconGraphics.FillPolygon($markBrush, @(
      (New-Object System.Drawing.PointF(43, 64)),
      (New-Object System.Drawing.PointF(85, 64)),
      (New-Object System.Drawing.PointF(64, 88))
    ))
    $iconGraphics.FillPath($markBrush, $base)
    $iconBitmap.Save((Join-Path $iconFolder "icon-$iconSize.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $iconGraphics.Dispose(); $tileBrush.Dispose(); $markBrush.Dispose(); $tile.Dispose(); $stem.Dispose(); $base.Dispose(); $iconBitmap.Dispose()
  }
}
