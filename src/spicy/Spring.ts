// Copied unchanged from the Spicy Lyrics for Jellyfin web mod (src/Spring.ts, MIT, same author),
// so Rakki's motion is identical to the web mod's. Keep the two in sync.

/**
 * Spring.ts
 * A damped harmonic oscillator stepped with its exact (closed-form) solution,
 * so it is stable at any frame time — a long frame just lands further along
 * the same curve instead of exploding the way an Euler step would.
 *
 * The maths follows Fraktality's `spr` (github.com/Fraktality/spr, MIT).
 *
 *   frequency (Hz)  how fast it moves toward its goal
 *   damping   (ζ)   1 = no overshoot, < 1 = bouncy, > 1 = sluggish
 */

const REST_OFFSET_SQ = (1 / 3840) ** 2;   // close enough to the goal…
const REST_SPEED_SQ = 0.01 ** 2;          // …and slow enough to count as still
const EPS = 1e-5;

export class Spring {
    private pos: number;
    private vel = 0;
    private goal: number;

    constructor(position: number, public frequency: number, public damping: number) {
        this.pos = position;
        this.goal = position;
    }

    get value(): number { return this.pos; }

    /** Move the goal; with `snap`, jump there and stop. */
    setGoal(goal: number, snap = false): void {
        this.goal = goal;
        if (snap) {
            this.pos = goal;
            this.vel = 0;
        }
    }

    /** True once the spring has settled on its goal. */
    get resting(): boolean {
        const off = this.pos - this.goal;
        return this.vel * this.vel <= REST_SPEED_SQ && off * off <= REST_OFFSET_SQ;
    }

    step(dt: number): number {
        if (dt <= 0) return this.pos;
        const d = this.damping;
        const f = this.frequency * 2 * Math.PI;   // Hz → rad/s
        const g = this.goal;
        const o = this.pos - g;
        const v = this.vel;

        if (d === 1) {
            // Critically damped
            const q = Math.exp(-f * dt);
            const w = dt * q;
            this.pos = o * (q + w * f) + v * w + g;
            this.vel = v * (q - w * f) - o * (w * f * f);
        } else if (d < 1) {
            // Underdamped (bouncy)
            const q = Math.exp(-d * f * dt);
            const c = Math.sqrt(1 - d * d);
            const i = Math.cos(dt * f * c);
            const j = Math.sin(dt * f * c);

            // sin(x)/c and sin(x)/(f·c), with series fallbacks as c → 0
            let z: number;
            if (c > EPS) {
                z = j / c;
            } else {
                const a = dt * f;
                z = a + ((a * a) * (c * c) * (c * c) / 20 - c * c) * (a * a * a) / 6;
            }
            let y: number;
            if (f * c > EPS) {
                y = j / (f * c);
            } else {
                const b = f * c;
                y = dt + ((dt * dt) * (b * b) * (b * b) / 20 - b * b) * (dt * dt * dt) / 6;
            }

            this.pos = (o * (i + z * d) + v * y) * q + g;
            this.vel = (v * (i - z * d) - o * (z * f)) * q;
        } else {
            // Overdamped
            const c = Math.sqrt(d * d - 1);
            const r1 = -f * (d + c);
            const r2 = -f * (d - c);
            const e1 = Math.exp(r1 * dt);
            const e2 = Math.exp(r2 * dt);
            const co2 = (v - o * r1) / (2 * f * c);
            const co1 = e1 * (o - co2);
            this.pos = co1 + co2 * e2 + g;
            this.vel = co1 * r1 + co2 * e2 * r2;
        }
        return this.pos;
    }
}
