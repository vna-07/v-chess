import type { Move } from 'chess.js';

export function MoveList({ history }: { history: Move[] }) {
  const pairs: { n: number; w?: string; b?: string }[] = [];
  for (let i = 0; i < history.length; i += 2) {
    pairs.push({ n: i / 2 + 1, w: history[i]?.san, b: history[i + 1]?.san });
  }

  return (
    <div className="panel">
      <h3>Moves</h3>
      <div className="moves">
        {pairs.length === 0 && <p className="muted">No moves yet.</p>}
        {pairs.map((p) => (
          <div key={p.n} className="move-row">
            <span className="move-num">{p.n}.</span>
            <span className="move-san">{p.w ?? ''}</span>
            <span className="move-san">{p.b ?? ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}