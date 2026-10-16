Add-Type -AssemblyName System.Drawing

$publicDirectory = Join-Path $PSScriptRoot '..\public'

function New-RoundedPath([single] $x, [single] $y, [single] $width, [single] $height, [single] $radius) {
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $diameter = $radius * 2
    $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
    $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
    $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

function Save-Icon([int] $size, [string] $filename, [bool] $maskable) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.ScaleTransform($size / 512, $size / 512)

    $background = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#102A31'))
    $whitePen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#F7FBFA'), 50)
    $accentPen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#0DAA91'), 50)
    $whitePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Square
    $whitePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Square
    $accentPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Square
    $accentPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Square

    if ($maskable) {
        $graphics.FillRectangle($background, 0, 0, 512, 512)
    } else {
        $backgroundPath = New-RoundedPath 0 0 512 512 108
        $graphics.FillPath($background, $backgroundPath)
        $backgroundPath.Dispose()
    }

    $markPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $markPath.AddLine(352, 128, 226, 128)
    $markPath.AddBezier(226, 128, 145, 128, 102, 182, 102, 256)
    $markPath.AddBezier(102, 256, 102, 330, 145, 384, 226, 384)
    $markPath.AddLine(226, 384, 352, 384)
    $graphics.DrawPath($whitePen, $markPath)
    $graphics.DrawLine($accentPen, 258, 256, 368, 256)

    $outputPath = Join-Path $publicDirectory $filename
    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $markPath.Dispose()
    $accentPen.Dispose()
    $whitePen.Dispose()
    $background.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

Save-Icon 192 'icon-192.png' $false
Save-Icon 512 'icon-512.png' $false
Save-Icon 512 'icon-maskable-512.png' $true
Save-Icon 180 'apple-touch-icon.png' $false
