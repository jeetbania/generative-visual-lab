/**
 * ParticleEngine — a shape renderer shared by every generator.
 *
 * Deliberately dumb: it draws one particle given a descriptor. The
 * simulation (position, velocity, lifetime, field-following) lives in each
 * effect, which is what keeps this reusable across wildly different systems
 * (strand tips, magnetic-field streaks, globe stipples, …).
 */

export type ParticleShape =
  | "dot" | "circle" | "square" | "diamond" | "line" | "cross" | "plus" | "ring" | "triangle" | "char";

export interface ParticleStyle {
  shape: ParticleShape;
  char?: string;
  fontFamily?: string;
}

export interface ParticleDraw {
  x: number;
  y: number;
  size: number;
  rotation?: number;
  opacity: number;
  color: string; // resolved CSS color
}

export function drawParticle(ctx: CanvasRenderingContext2D, p: ParticleDraw, style: ParticleStyle) {
  if (p.opacity <= 0.002 || p.size <= 0.05) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, p.opacity));
  ctx.fillStyle = p.color;
  ctx.strokeStyle = p.color;
  ctx.translate(p.x, p.y);
  if (p.rotation) ctx.rotate(p.rotation);
  const s = p.size;

  switch (style.shape) {
    case "dot":
    case "circle": {
      ctx.beginPath();
      ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "ring": {
      ctx.lineWidth = Math.max(0.5, s * 0.18);
      ctx.beginPath();
      ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "square": {
      ctx.fillRect(-s / 2, -s / 2, s, s);
      break;
    }
    case "diamond": {
      ctx.beginPath();
      ctx.moveTo(0, -s / 2);
      ctx.lineTo(s / 2, 0);
      ctx.lineTo(0, s / 2);
      ctx.lineTo(-s / 2, 0);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "triangle": {
      ctx.beginPath();
      ctx.moveTo(0, -s / 2);
      ctx.lineTo(s / 2, s / 2);
      ctx.lineTo(-s / 2, s / 2);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "line": {
      ctx.lineWidth = Math.max(0.5, s * 0.16);
      ctx.beginPath();
      ctx.moveTo(-s / 2, 0);
      ctx.lineTo(s / 2, 0);
      ctx.stroke();
      break;
    }
    case "cross": {
      ctx.lineWidth = Math.max(0.5, s * 0.18);
      ctx.beginPath();
      ctx.moveTo(-s / 2, -s / 2); ctx.lineTo(s / 2, s / 2);
      ctx.moveTo(s / 2, -s / 2); ctx.lineTo(-s / 2, s / 2);
      ctx.stroke();
      break;
    }
    case "plus": {
      ctx.lineWidth = Math.max(0.5, s * 0.18);
      ctx.beginPath();
      ctx.moveTo(0, -s / 2); ctx.lineTo(0, s / 2);
      ctx.moveTo(-s / 2, 0); ctx.lineTo(s / 2, 0);
      ctx.stroke();
      break;
    }
    case "char": {
      const ch = style.char && style.char.length > 0 ? style.char[0] : "•";
      ctx.font = `${s}px ${style.fontFamily ?? '"IBM Plex Mono", monospace'}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(ch, 0, 0);
      break;
    }
  }
  ctx.restore();
}

/** Picks a character deterministically for "mixed characters" particle mode. */
export function pickChar(set: string, rand01: number): string {
  if (!set || set.length === 0) return "•";
  const idx = Math.floor(rand01 * set.length) % set.length;
  return set[idx];
}
