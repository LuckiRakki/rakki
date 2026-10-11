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

        /// <summary>
        /// The artist's colour: the hue that covers most of the picture (weighted by how colourful
        /// each part is, and the middle, where the artist usually is, most), averaged and brightened
        /// to stand out on dark. Light grey for pictures with hardly any colour (black and white).
        /// </summary>
        private static SKColor AccentOf(SKBitmap picture)
        {
            using var small = picture.Resize(new SKImageInfo(48, 48), new SKSamplingOptions(SKFilterMode.Linear));
            if (small == null) return RakkiOrange;
            const int Bins = 24;
            var weight = new float[Bins];
            var sumSat = new float[Bins];
            var sumVal = new float[Bins];
            var sumX = new float[Bins];
            var sumY = new float[Bins];
            float total = 0;
            for (var y = 0; y < small.Height; y++)
            {
                for (var x = 0; x < small.Width; x++)
                {
                    small.GetPixel(x, y).ToHsv(out var hue, out var sat, out var val);
                    total++;
                    if (sat < 12 || val < 20) continue;
                    // The middle counts most: that's usually the artist, the edges the background.
                    var dx = (x + 0.5f) / small.Width - 0.5f;
                    var dy = (y + 0.5f) / small.Height - 0.45f;
                    var centre = 1f - Math.Min(1f, MathF.Sqrt(dx * dx + dy * dy) / 0.6f) * 0.85f;
                    var w = sat / 100f * val / 100f * centre;
                    var bin = (int)(hue / 360f * Bins) % Bins;
                    weight[bin] += w;
                    sumSat[bin] += sat * w;
                    sumVal[bin] += val * w;
                    // Hue as a direction, so reds either side of 0° average properly.
                    var rad = hue * MathF.PI / 180f;
                    sumX[bin] += MathF.Cos(rad) * w;
                    sumY[bin] += MathF.Sin(rad) * w;
                }
            }
            // Neighbouring bins count together, so one colour split across two bins still wins.
            var best = 0;
            var bestWeight = 0f;
            for (var b = 0; b < Bins; b++)
            {
                var around = weight[(b + Bins - 1) % Bins] * 0.5f + weight[b] + weight[(b + 1) % Bins] * 0.5f;
                if (around > bestWeight)
                {
                    bestWeight = around;
                    best = b;
                }
            }
            // Too little colour in the picture (black and white): a light grey, like the photo.
            if (weight[best] <= 0 || bestWeight < total * 0.012f) return new SKColor(232, 232, 232);
            var avgHue = MathF.Atan2(sumY[best], sumX[best]) * 180f / MathF.PI;
            if (avgHue < 0) avgHue += 360;
            var avgSat = sumSat[best] / weight[best];
            var avgVal = sumVal[best] / weight[best];
            return SKColor.FromHsv(avgHue, Math.Clamp(avgSat * 1.15f, 50, 95), Math.Clamp(avgVal * 1.25f, 85, 100));
        }
    }
}
