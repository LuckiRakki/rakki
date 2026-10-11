// A Daily Mix's cover (docs/DAILY_MIX.md, "The cover"): 1000×1000, the lead artist's picture
// filling the square, darkened towards the bottom, "Daily Mix" in heavy type at the bottom
// left with a short stripe above it in a colour taken from the picture, and the mix's number
// at the bottom right. No picture: a gradient in Rakki's orange instead.
// Drawn with SkiaSharp, which Jellyfin ships with.

using System;
using System.IO;
using SkiaSharp;

namespace Jellyfin.Plugin.Rakki.DailyMix
{
    public static class MixCover
    {
        private const int Size = 1000;
        private const float Margin = 64;
        private static readonly SKColor RakkiOrange = new(255, 103, 44);
        private static readonly Lazy<SKTypeface> Heavy = new(() =>
        {
            using var stream = typeof(MixCover).Assembly.GetManifestResourceStream("Jellyfin.Plugin.Rakki.Inter_900Black.ttf")!;
            using var copy = new MemoryStream();
            stream.CopyTo(copy);
            copy.Position = 0;
            return SKTypeface.FromStream(copy) ?? SKTypeface.Default;
        });

        /// <summary>The cover as a JPEG.</summary>
        public static byte[] Draw(string? picturePath, int number)
        {
            using var surface = SKSurface.Create(new SKImageInfo(Size, Size, SKColorType.Rgba8888, SKAlphaType.Premul));
            var canvas = surface.Canvas;
            var accent = RakkiOrange;

            using var picture = picturePath != null && File.Exists(picturePath) ? SKBitmap.Decode(picturePath) : null;
            if (picture != null && picture.Width > 0 && picture.Height > 0)
            {
                // Fill the square, cropping the longer side around the centre (a bit higher for
                // portraits, where faces usually are).
                var scale = Math.Max((float)Size / picture.Width, (float)Size / picture.Height);
                var w = Size / scale;
                var h = Size / scale;
                var x = (picture.Width - w) / 2;
                var y = (picture.Height - h) * (picture.Height > picture.Width ? 0.3f : 0.5f);
                using var image = SKImage.FromBitmap(picture);
                canvas.DrawImage(image, new SKRect(x, y, x + w, y + h), new SKRect(0, 0, Size, Size), new SKSamplingOptions(SKCubicResampler.Mitchell));
                accent = AccentOf(picture);
            }
            else
            {
                using var fill = new SKPaint
                {
                    Shader = SKShader.CreateLinearGradient(
                        new SKPoint(0, 0), new SKPoint(Size, Size),
                        new[] { RakkiOrange, new SKColor(70, 20, 10) }, null, SKShaderTileMode.Clamp),
                };
                canvas.DrawRect(0, 0, Size, Size, fill);
            }

            // Darker towards the bottom, so the words read on any picture.
            using (var shade = new SKPaint
            {
                Shader = SKShader.CreateLinearGradient(
                    new SKPoint(0, Size * 0.4f), new SKPoint(0, Size),
                    new[] { SKColors.Transparent, new SKColor(0, 0, 0, 120), new SKColor(0, 0, 0, 225) },
                    new[] { 0f, 0.45f, 1f }, SKShaderTileMode.Clamp),
            })
            {
                canvas.DrawRect(0, 0, Size, Size, shade);
            }

            using var white = new SKPaint { Color = SKColors.White, IsAntialias = true };
            using var title = new SKFont(Heavy.Value, 112) { Edging = SKFontEdging.SubpixelAntialias };
            using var big = new SKFont(Heavy.Value, 170) { Edging = SKFontEdging.SubpixelAntialias };
            var baseline = Size - Margin - 6;
            canvas.DrawText("Daily Mix", Margin - 6, baseline, SKTextAlign.Left, title, white);
            canvas.DrawText(number.ToString(System.Globalization.CultureInfo.InvariantCulture), Size - Margin, baseline, SKTextAlign.Right, big, white);

            using var stripe = new SKPaint { Color = accent, IsAntialias = true };
            canvas.DrawRoundRect(new SKRect(Margin, baseline - 112 - 34, Margin + 132, baseline - 112 - 18), 8, 8, stripe);

            using var snapshot = surface.Snapshot();
            using var data = snapshot.Encode(SKEncodedImageFormat.Jpeg, 90);
            return data.ToArray();
        }

        /// <summary>The picture's most vivid colour, brightened to stand out on dark (Rakki orange for grey pictures).</summary>
        private static SKColor AccentOf(SKBitmap picture)
        {
            using var small = picture.Resize(new SKImageInfo(24, 24), new SKSamplingOptions(SKFilterMode.Linear));
            if (small == null) return RakkiOrange;
            var best = RakkiOrange;
            var bestScore = 0f;
            for (var y = 0; y < small.Height; y++)
            {
                for (var x = 0; x < small.Width; x++)
                {
                    small.GetPixel(x, y).ToHsv(out var hue, out var sat, out var val);
                    if (val < 35) continue;
                    var score = sat * val;
                    if (score > bestScore)
                    {
                        bestScore = score;
                        best = SKColor.FromHsv(hue, Math.Max(sat, 55), Math.Max(val, 90));
                    }
                }
            }
            return bestScore < 25 * 50 ? RakkiOrange : best;
        }
    }
}
