$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$iconFolder = Join-Path (Split-Path -Parent $PSScriptRoot) 'extension\icons'
New-Item -ItemType Directory -Path $iconFolder -Force | Out-Null
foreach ($iconSize in @(16,32,48,128)) {
  $iconBitmap = New-Object System.Drawing.Bitmap($iconSize, $iconSize)
  $iconGraphics = [System.Drawing.Graphics]::FromImage($iconBitmap)
  $iconPen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 8)
  $iconBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#126c60'))
  try {
    $iconGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $iconGraphics.Clear([System.Drawing.Color]::Transparent)
    $iconGraphics.ScaleTransform($iconSize/128.0, $iconSize/128.0)
    $iconGraphics.FillRectangle($iconBrush, 4,4,120,120)
    $iconGraphics.DrawRectangle($iconPen, 25,25,78,76)
    $iconGraphics.DrawLine($iconPen, 37,78,54,58)
    $iconGraphics.DrawLine($iconPen, 54,58,67,73)
    $iconGraphics.DrawLine($iconPen, 83,45,83,81)
    $iconGraphics.DrawLine($iconPen, 71,69,83,81)
    $iconGraphics.DrawLine($iconPen, 83,81,95,69)
    $iconBitmap.Save((Join-Path $iconFolder "icon-$iconSize.png"),[System.Drawing.Imaging.ImageFormat]::Png)
  } finally {$iconGraphics.Dispose();$iconPen.Dispose();$iconBrush.Dispose();$iconBitmap.Dispose()}
}
