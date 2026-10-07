export type EngineConfig = {
  skill: number;       // 0..20
  movetimeMs: number;
};

export type EngineInfo = {
  depth?: number;
  scoreCp?: number;
  scoreMate?: number;
};

type InfoListener = (info: EngineInfo) => void;

const WORKER_URL = '/stockfish/stockfish-19-lite-single.js';

export class Engine {
  private worker: Worker;
  private readyPromise: Promise<void>;
  private infoListener?: InfoListener;
  private resolveMove?: (uci: string) => void;
  private configuredSkill?: number;

  constructor() {
    console.log('[SF] booting worker:', WORKER_URL);
    this.worker = new Worker(WORKER_URL);

    this.worker.onerror = (e) => console.error('[SF worker error]', e);
    this.worker.onmessageerror = (e) => console.error('[SF message error]', e);
    this.worker.onmessage = (e) => this.handle(this.line(e.data));

    this.readyPromise = new Promise((resolve) => {
      const h = (e: MessageEvent) => {
        const l = this.line(e.data);
        if (l.includes('uciok')) {
          console.log('[SF] uciok received');
          this.worker.removeEventListener('message', h);
          resolve();
        }
      };
      this.worker.addEventListener('message', h);
      this.worker.postMessage('uci');
    });
  }

  private line(data: unknown): string {
    if (typeof data === 'string') return data;
    if (data && typeof data === 'object' && 'data' in data) return String((data as any).data);
    return String(data);
  }

  private handle(line: string) {
    // Uncomment if you want the full UCI firehose:
    // console.log('[SF]', line);

    if (line.startsWith('info ') && this.infoListener) {
      const info: EngineInfo = {};
      const d = line.match(/ depth (\d+)/);
      const cp = line.match(/ score cp (-?\d+)/);
      const mate = line.match(/ score mate (-?\d+)/);
      if (d) info.depth = +d[1];
      if (cp) info.scoreCp = +cp[1];
      if (mate) info.scoreMate = +mate[1];
      this.infoListener(info);
    }

    if (line.startsWith('bestmove ')) {
      const uci = line.split(' ')[1];
      console.log('[SF] bestmove:', uci);
      this.resolveMove?.(uci);
      this.resolveMove = undefined;
    }
  }

  async configure(cfg: EngineConfig) {
    await this.readyPromise;

    if (this.configuredSkill === cfg.skill) return;
    this.configuredSkill = cfg.skill;

    const elo = Math.round(800 + (cfg.skill / 20) * 2000);
    this.worker.postMessage('setoption name UCI_LimitStrength value true');
    this.worker.postMessage(`setoption name UCI_Elo value ${elo}`);
    this.worker.postMessage(`setoption name Skill Level value ${cfg.skill}`);
    this.worker.postMessage('isready');
    console.log(`[SF] configured skill=${cfg.skill} elo≈${elo}`);
  }

  async findMove(fen: string, cfg: EngineConfig, onInfo?: InfoListener): Promise<string> {
    await this.readyPromise;
    this.infoListener = onInfo;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.resolveMove = undefined;
        this.infoListener = undefined;
        this.worker.postMessage('stop');
        reject(new Error('engine timeout'));
      }, cfg.movetimeMs + 15000);

      this.resolveMove = (uci) => {
        clearTimeout(timeout);
        this.infoListener = undefined;
        resolve(uci);
      };

      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go movetime ${cfg.movetimeMs}`);
    });
  }

  terminate() {
    try {
      this.worker.postMessage('quit');
    } catch {}
    this.worker.terminate();
  }
}