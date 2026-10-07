import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square, type Move } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { Engine, type EngineInfo } from './engine/stockfish';
import { MoveList } from './components/MoveList';
import { CapturedPieces } from './components/CapturedPieces';

type Status =
  | { kind: 'your-turn' }
  | { kind: 'v-thinking' }
  | { kind: 'check' }
  | { kind: 'checkmate'; winner: 'w' | 'b' }
  | { kind: 'draw'; reason: string };

const PRESETS = {
  casual: { label: 'Casual', skill: 3,  movetimeMs: 400 },
  club:   { label: 'Club',   skill: 8,  movetimeMs: 900 },
  strong: { label: 'Strong', skill: 14, movetimeMs: 1600 },
  brutal: { label: 'Brutal', skill: 18, movetimeMs: 2500 },
  v:      { label: 'V',      skill: 20, movetimeMs: 4000 },
} as const;

type PresetKey = keyof typeof PRESETS;

export default function App() {
  const gameRef = useRef(new Chess());
  const engineRef = useRef<Engine | null>(null);
  const busyRef = useRef(false);

  const [fen, setFen] = useState(gameRef.current.fen());
  const [history, setHistory] = useState<Move[]>([]);
  const [status, setStatus] = useState<Status>({ kind: 'your-turn' });
  const [preset, setPreset] = useState<PresetKey>('club');
  const [thinking, setThinking] = useState(false);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [evalInfo, setEvalInfo] = useState<EngineInfo>({});
  const [engineReady, setEngineReady] = useState(false);

  // Boot engine once
  useEffect(() => {
    const e = new Engine();
    engineRef.current = e;

    e.configure({
      skill: PRESETS[preset].skill,
      movetimeMs: PRESETS[preset].movetimeMs,
    })
      .then(() => setEngineReady(true))
      .catch((err) => console.error('[SF] configure failed', err));

    return () => {
      e.terminate();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconfigure when preset changes
  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current.configure({
      skill: PRESETS[preset].skill,
      movetimeMs: PRESETS[preset].movetimeMs,
    });
  }, [preset]);

  function computeStatus(g: Chess): Status {
    if (g.isCheckmate()) {
      const winner = g.turn() === 'w' ? 'b' : 'w';
      return { kind: 'checkmate', winner };
    }
    if (g.isStalemate()) return { kind: 'draw', reason: 'Stalemate' };
    if (g.isThreefoldRepetition()) return { kind: 'draw', reason: 'Threefold' };
    if (g.isInsufficientMaterial()) return { kind: 'draw', reason: 'Insufficient material' };
    if (g.isDraw()) return { kind: 'draw', reason: 'Draw' };
    if (g.isCheck()) return { kind: 'check' };
    return g.turn() === 'w' ? { kind: 'your-turn' } : { kind: 'v-thinking' };
  }

  function syncFromGame() {
    const g = gameRef.current;
    setFen(g.fen());
    setHistory(g.history({ verbose: true }) as Move[]);
    setStatus(computeStatus(g));
  }

  function applyMove(
    from: Square,
    to: Square,
    promotion: 'q' | 'r' | 'b' | 'n' = 'q'
  ): boolean {
    try {
      const m = gameRef.current.move({ from, to, promotion });
      if (!m) return false;
      setLastMove({ from: m.from as Square, to: m.to as Square });
      syncFromGame();
      return true;
    } catch {
      return false;
    }
  }

  function onDrop(source: Square, target: Square): boolean {
    if (busyRef.current) return false;
    if (!engineReady) return false;
    if (gameRef.current.turn() !== 'w') return false;
    if (gameRef.current.isGameOver()) return false;

    const ok = applyMove(source, target);
    if (!ok) return false;

    if (gameRef.current.isGameOver()) return true;

    void runEngineTurn();
    return true;
  }

  async function runEngineTurn() {
    const engine = engineRef.current;
    if (!engine) return;

    busyRef.current = true;
    setThinking(true);
    setStatus({ kind: 'v-thinking' });
    setEvalInfo({});

    try {
      const cfg = {
        skill: PRESETS[preset].skill,
        movetimeMs: PRESETS[preset].movetimeMs,
      };
      const uci = await engine.findMove(gameRef.current.fen(), cfg, setEvalInfo);

      const from = uci.slice(0, 2) as Square;
      const to = uci.slice(2, 4) as Square;
      const promo = (uci[4] ?? 'q') as 'q' | 'r' | 'b' | 'n';
      applyMove(from, to, promo);
    } catch (err) {
      console.error('[engine turn failed]', err);
    } finally {
      busyRef.current = false;
      setThinking(false);
    }
  }

  function newGame() {
    gameRef.current = new Chess();
    setLastMove(null);
    setEvalInfo({});
    syncFromGame();
  }

  function undo() {
    if (busyRef.current) return;
    const g = gameRef.current;
    if (g.history().length === 0) return;
    g.undo();
    if (g.history().length > 0 && g.turn() !== 'w') g.undo();
    setLastMove(null);
    setEvalInfo({});
    syncFromGame();
  }

  const statusText = useMemo(() => {
    switch (status.kind) {
      case 'your-turn':  return 'Your move';
      case 'v-thinking': return 'V is thinking…';
      case 'check':      return 'Check!';
      case 'checkmate':  return status.winner === 'w' ? 'You win.' : 'V wins.';
      case 'draw':       return `Draw — ${status.reason}`;
    }
  }, [status]);

  const evalLabel = useMemo(() => {
    const { scoreCp, scoreMate } = evalInfo;
    if (scoreMate !== undefined) return `#${Math.abs(scoreMate)}`;
    if (scoreCp === undefined) return '—';
    const pawns = (scoreCp / 100).toFixed(2);
    return `${scoreCp >= 0 ? '+' : ''}${pawns}`;
  }, [evalInfo]);

  const gameOver = gameRef.current.isGameOver();
  const yourTurn = !gameOver && !thinking && engineReady && gameRef.current.turn() === 'w';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="dot" /> V
        </div>
        <div className="topbar-actions">
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as PresetKey)}
          >
            {Object.entries(PRESETS).map(([k, p]) => (
              <option key={k} value={k}>{p.label}</option>
            ))}
          </select>
          <button onClick={undo} disabled={thinking || history.length === 0}>
            Undo
          </button>
          <button onClick={newGame} className="primary">
            New game
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="board-wrap">
          <div className="status-bar">
            <span className={`turn-dot ${gameRef.current.turn() === 'w' ? 'w' : 'b'}`} />
            <span className={`status-text ${status.kind}`}>
              {engineReady ? statusText : 'Loading engine…'}
            </span>
            <span className="eval-chip">eval {evalLabel}</span>
          </div>

          <Chessboard
            position={fen}
            onPieceDrop={onDrop}
            boardWidth={640}
            arePiecesDraggable={yourTurn}
            customBoardStyle={{
              borderRadius: 12,
              boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
            }}
            customDarkSquareStyle={{ backgroundColor: '#4a5568' }}
            customLightSquareStyle={{ backgroundColor: '#e2e8f0' }}
            customSquareStyles={
              lastMove
                ? {
                    [lastMove.from]: { backgroundColor: 'rgba(255, 200, 0, 0.25)' },
                    [lastMove.to]:   { backgroundColor: 'rgba(255, 200, 0, 0.45)' },
                  }
                : undefined
            }
          />
        </section>

        <aside className="side">
          <div className="panel">
            <h3>V</h3>
            <div className="kv"><span>Strength</span><span>{PRESETS[preset].label}</span></div>
            <div className="kv"><span>Think time</span><span>{PRESETS[preset].movetimeMs} ms</span></div>
            <div className="kv"><span>Depth</span><span>{evalInfo.depth ?? '—'}</span></div>
            <div className="kv"><span>Engine</span><span>{engineReady ? 'ready' : 'loading'}</span></div>
          </div>

          <CapturedPieces history={history} />
          <MoveList history={history} />
        </aside>
      </main>
    </div>
  );
}