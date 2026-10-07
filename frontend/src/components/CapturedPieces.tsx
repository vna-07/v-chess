import type { Move, Color, PieceSymbol } from 'chess.js';

const GLYPH: Record<Color, Record<PieceSymbol, string>> = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};

export function CapturedPieces({ history }: { history: Move[] }) {
  const captured: { w: PieceSymbol[]; b: PieceSymbol[] } = { w: [], b: [] };
  for (const m of history) {
    if (m.captured) {
      captured[m.color === 'w' ? 'b' : 'w'].push(m.captured);
    }
  }

  return (
    <div className="panel">
      <h3>Captured</h3>
      <div className="captured-row">
        <span className="muted">By you:</span>{' '}
        {captured.b.map((p, i) => (
          <span key={i} className="cap">{GLYPH.b[p]}</span>
        ))}
      </div>
      <div className="captured-row">
        <span className="muted">By V:</span>{' '}
        {captured.w.map((p, i) => (
          <span key={i} className="cap">{GLYPH.w[p]}</span>
        ))}
      </div>
    </div>
  );
}