// Copied unchanged from the Spicy Lyrics for Jellyfin web mod (src/Spline.ts, MIT, same author),
// so Rakki's motion is identical to the web mod's. Keep the two in sync.

/**
 * Spline.ts
 * A natural cubic spline through a handful of keyframes: a smooth curve that
 * passes through every point, with no kinks between them. Used to shape how a
 * word's size, lift and glow evolve across the time it is sung.
 */

export type Keyframe = readonly [t: number, value: number];

export class Spline {
    private readonly xs: number[];
    private readonly ys: number[];
    /** Slope of the curve at each keyframe. */
    private readonly ks: number[];

    constructor(points: readonly Keyframe[]) {
        this.xs = points.map((p) => p[0]);
        this.ys = points.map((p) => p[1]);
        this.ks = Spline.slopes(this.xs, this.ys);
    }

    /** Value of the curve at `t` (clamped to the first/last keyframe). */
    at(t: number): number {
        const { xs, ys, ks } = this;
        const n = xs.length - 1;
        if (t <= xs[0]) return ys[0];
        if (t >= xs[n]) return ys[n];

        let i = 1;
        while (xs[i] < t) i++;
        const h = xs[i] - xs[i - 1];
        const dy = ys[i] - ys[i - 1];
        const u = (t - xs[i - 1]) / h;
        const a = ks[i - 1] * h - dy;
        const b = -ks[i] * h + dy;
        return (1 - u) * ys[i - 1] + u * ys[i] + u * (1 - u) * (a * (1 - u) + b * u);
    }

    /**
     * Keyframe slopes for a natural spline (zero curvature at both ends): a
     * tridiagonal system, solved with the Thomas algorithm.
     */
    private static slopes(xs: number[], ys: number[]): number[] {
        const n = xs.length - 1;
        const lower = new Array<number>(n + 1).fill(0);
        const diag = new Array<number>(n + 1).fill(0);
        const upper = new Array<number>(n + 1).fill(0);
        const rhs = new Array<number>(n + 1).fill(0);

        for (let i = 0; i <= n; i++) {
            const hl = i > 0 ? xs[i] - xs[i - 1] : 0;   // span to the left
            const hr = i < n ? xs[i + 1] - xs[i] : 0;   // span to the right
            if (hl) {
                lower[i] = 1 / hl;
                diag[i] += 2 / hl;
                rhs[i] += (3 * (ys[i] - ys[i - 1])) / (hl * hl);
            }
            if (hr) {
                upper[i] = 1 / hr;
                diag[i] += 2 / hr;
                rhs[i] += (3 * (ys[i + 1] - ys[i])) / (hr * hr);
            }
        }

        // Forward sweep, then back substitution
        for (let i = 1; i <= n; i++) {
            const m = lower[i] / diag[i - 1];
            diag[i] -= m * upper[i - 1];
            rhs[i] -= m * rhs[i - 1];
        }
        const ks = new Array<number>(n + 1).fill(0);
        ks[n] = rhs[n] / diag[n];
        for (let i = n - 1; i >= 0; i--) {
            ks[i] = (rhs[i] - upper[i] * ks[i + 1]) / diag[i];
        }
        return ks;
    }
}
