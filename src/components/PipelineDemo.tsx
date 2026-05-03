"use client";

import { useEffect, useRef, useState } from "react";

const ACCENT = "#c2692a";
const ACCENT_LIGHT = "#e8834a";
const ACCENT_GREEN = "#4ade80";
const ACCENT_BLUE = "#60a5fa";
const BG = "#080604";
const BORDER = "#1a0e08";

interface Node {
  id: string;
  label: string;
  sub: string;
  x: number;
  y: number;
}

const NODES: Node[] = [
  { id: "write", label: "Write", sub: "HNSW insert", x: 0.08, y: 0.5 },
  { id: "encrypt", label: "Encrypt", sub: "AES-256-GCM", x: 0.3, y: 0.2 },
  { id: "store", label: "Store", sub: "Arweave · Irys", x: 0.55, y: 0.1 },
  { id: "anchor", label: "Anchor", sub: "SHA-256 Merkle", x: 0.8, y: 0.2 },
  { id: "query", label: "Query", sub: "vector search", x: 0.38, y: 0.8 },
  { id: "verify", label: "Verify", sub: "reconstruct state", x: 0.72, y: 0.8 },
  { id: "done", label: "✓", sub: "", x: 0.94, y: 0.5 },
];

// Three distinct paths:
// WRITE path: 0→1→2→3→6  (write, encrypt, store, anchor, done)
// QUERY path: 0→4→6       (write, query, done) — fast, independent
// VERIFY path: 3→5→6      (anchor→verify→done) — triggered from stored proof
const EDGES: [number, number, string][] = [
  [0, 1, ACCENT], // write → encrypt
  [1, 2, ACCENT], // encrypt → store
  [2, 3, ACCENT], // store → anchor
  [3, 6, ACCENT], // anchor → done
  [0, 4, ACCENT_BLUE], // write → query
  [4, 6, ACCENT_BLUE], // query → done
  [3, 5, ACCENT_GREEN], // anchor → verify (proof retrieval)
  [5, 6, ACCENT_GREEN], // verify → done
];

interface Pulse {
  path: number[];
  seg: number;
  t: number;
  speed: number;
  id: string;
  done: boolean;
  type: "write" | "query" | "verify";
}

function rh(n: number): string {
  const H = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < n; i++) s += H[Math.floor(Math.random() * 16)];
  return s;
}

function pulseColor(type: Pulse["type"], seg: number, pathLen: number): string {
  if (type === "query") return ACCENT_BLUE;
  if (type === "verify") return ACCENT_GREEN;
  return seg >= pathLen - 2 ? ACCENT_GREEN : ACCENT_LIGHT;
}

export default function PipelineDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pulseRef = useRef<Pulse[]>([]);
  const frameRef = useRef(0);
  const rafRef = useRef<number>(0);
  const writesRef = useRef(0);
  const proofsRef = useRef(0);
  const queriesRef = useRef(0);
  const latenciesRef = useRef<number[]>([]);
  const [writes, setWrites] = useState(0);
  const [avgLatency, setAvgLatency] = useState<string>("—");
  const [proofs, setProofs] = useState(0);

  function spawnWrite() {
    pulseRef.current.push({
      path: [0, 1, 2, 3, 6],
      seg: 0,
      t: 0,
      speed: 0.01 + Math.random() * 0.006,
      id: rh(4),
      done: false,
      type: "write",
    });
    writesRef.current++;
    setWrites(writesRef.current);
  }

  function spawnQuery() {
    pulseRef.current.push({
      path: [0, 4, 6],
      seg: 0,
      t: 0,
      speed: 0.018 + Math.random() * 0.008,
      id: rh(4),
      done: false,
      type: "query",
    });
  }

  function spawnVerify() {
    pulseRef.current.push({
      path: [3, 5, 6],
      seg: 0,
      t: 0,
      speed: 0.008 + Math.random() * 0.004,
      id: rh(4),
      done: false,
      type: "verify",
    });
    proofsRef.current++;
    setProofs(proofsRef.current);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      if (!canvas || !ctx) return;
      const r = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * r;
      canvas.height = 300 * r;
      ctx.scale(r, r);
    }
    resize();

    const W = () => canvas.offsetWidth;
    const H = 300;
    const nx = (i: number) => NODES[i].x * W();
    const ny = (i: number) => NODES[i].y * H;

    function drawEdges() {
      if (!ctx) return;
      EDGES.forEach(([a, b, col]) => {
        ctx.beginPath();
        ctx.moveTo(nx(a), ny(a));
        ctx.lineTo(nx(b), ny(b));
        ctx.strokeStyle = col + "30";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }

    function drawNodes() {
      if (!ctx) return;
      NODES.forEach((n) => {
        const x = n.x * W();
        const y = n.y * H;
        const col =
          n.id === "done"
            ? ACCENT_GREEN
            : n.id === "query"
              ? ACCENT_BLUE
              : n.id === "verify"
                ? ACCENT_GREEN
                : ACCENT;
        const r = n.id === "done" ? 10 : 16;

        ctx.beginPath();
        ctx.arc(x, y, r + 8, 0, Math.PI * 2);
        ctx.fillStyle = col + "18";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, r + 3, 0, Math.PI * 2);
        ctx.fillStyle = col + "35";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = col + "99";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, r - 4, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();

        ctx.textAlign = "center";
        ctx.fillStyle = "#fdf6ee";
        ctx.font = "500 11px ui-monospace,monospace";
        ctx.fillText(n.label, x, y - r - 10);
        if (n.sub) {
          ctx.fillStyle = "#a07858";
          ctx.font = "9px ui-monospace,monospace";
          ctx.fillText(n.sub, x, y - r - 1);
        }
      });
    }

    function drawLegend() {
      if (!ctx) return;
      const items = [
        { col: ACCENT, label: "write path" },
        { col: ACCENT_BLUE, label: "query path" },
        { col: ACCENT_GREEN, label: "verify path" },
      ];
      let lx = 16;
      const ly = H - 14;
      items.forEach(({ col, label }) => {
        ctx.beginPath();
        ctx.arc(lx + 4, ly, 4, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.fillStyle = "#5a3a20";
        ctx.font = "9px ui-monospace,monospace";
        ctx.textAlign = "left";
        ctx.fillText(label, lx + 12, ly + 3);
        lx += 90;
      });
    }

    function drawPulses() {
      if (!ctx) return;
      pulseRef.current.forEach((p) => {
        if (p.done) return;
        const a = p.path[p.seg],
          b = p.path[p.seg + 1];
        const x = nx(a) + (nx(b) - nx(a)) * p.t;
        const y = ny(a) + (ny(b) - ny(a)) * p.t;
        const col = pulseColor(p.type, p.seg, p.path.length);

        for (let i = 3; i >= 1; i--) {
          ctx.beginPath();
          ctx.arc(x, y, i * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = col + (i === 3 ? "20" : i === 2 ? "45" : "80");
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();

        ctx.fillStyle = col + "cc";
        ctx.font = "8px ui-monospace,monospace";
        ctx.textAlign = "center";
        ctx.fillText(p.id, x, y - 10);
      });
    }

    function updatePulses() {
      pulseRef.current.forEach((p) => {
        if (p.done) return;
        p.t += p.speed;
        if (p.t >= 1) {
          p.t = 0;
          const arrived = p.path[p.seg + 1];
          if (p.type === "query" && arrived === 4) {
            const lat = +(1.8 + Math.random() * 3).toFixed(2);
            latenciesRef.current.push(lat);
            if (latenciesRef.current.length > 20) latenciesRef.current.shift();
            const avg =
              (
                latenciesRef.current.reduce((a, b) => a + b, 0) /
                latenciesRef.current.length
              ).toFixed(2) + "ms";
            setAvgLatency(avg);
            queriesRef.current++;
          }
          p.seg++;
          if (p.seg >= p.path.length - 1) {
            p.done = true;
            return;
          }
          p.speed =
            p.type === "query"
              ? 0.016 + Math.random() * 0.008
              : p.type === "verify"
                ? 0.007 + Math.random() * 0.004
                : 0.009 + Math.random() * 0.007;
        }
      });
      pulseRef.current = pulseRef.current.filter((p) => !p.done);
    }

    let frame = 0;
    function loop() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W(), H);
      drawEdges();
      drawNodes();
      drawPulses();
      drawLegend();
      updatePulses();
      frame++;

      const active = pulseRef.current;
      const writeCount = active.filter((p) => p.type === "write").length;
      const queryCount = active.filter((p) => p.type === "query").length;
      const verifyCount = active.filter((p) => p.type === "verify").length;

      if (frame % 55 === 0 && writeCount < 5) spawnWrite();
      if (frame % 35 === 0 && queryCount < 4) spawnQuery();
      if (frame % 90 === 0 && verifyCount < 2 && writesRef.current > 3)
        spawnVerify();
      if (active.length < 3) spawnWrite();

      rafRef.current = requestAnimationFrame(loop);
    }

    for (let i = 0; i < 2; i++) setTimeout(spawnWrite, i * 300);
    setTimeout(spawnQuery, 600);
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const statStyle: React.CSSProperties = {
    flex: 1,
    padding: "14px 20px",
    borderRight: `1px solid ${BORDER}`,
    textAlign: "center",
  };

  return (
    <section
      style={{
        padding: "104px 0",
        borderBottom: "1px solid var(--rule, #1e1a14)",
      }}
    >
      <div
        style={{
          maxWidth: "var(--maxw, 1200px)",
          margin: "0 auto",
          padding: "0 var(--gutter, 40px)",
        }}
      >
        <div style={{ marginBottom: 48 }}>
          <p
            style={{
              fontFamily: "var(--font-mono, ui-monospace)",
              fontSize: 10,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--text-muted, #888)",
              margin: "0 0 12px",
            }}
          >
            § Live simulation
          </p>
          <h2
            style={{
              fontFamily: "var(--font-serif, Georgia)",
              fontWeight: 400,
              fontSize: "clamp(28px, 3.5vw, 48px)",
              lineHeight: 1.1,
              letterSpacing: "-0.01em",
              color: "var(--paper, #f0ebe0)",
              margin: 0,
            }}
          >
            Every vector write.{" "}
            <em
              style={{ fontStyle: "italic", color: "var(--accent, #c2692a)" }}
            >
              Every proof.
            </em>
            <br />
            Instantly verifiable.
          </h2>
          <p
            style={{
              fontFamily: "var(--font-mono, ui-monospace)",
              fontSize: 13,
              color: "var(--text-dim, #666)",
              margin: "16px 0 0",
              maxWidth: "58ch",
              lineHeight: 1.65,
            }}
          >
            Write path encrypts and stores permanently. Query path retrieves at
            sub-5ms. Verify path reconstructs your agent's exact memory state
            from any past Merkle proof.
          </p>
        </div>

        <div
          style={{
            background: BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 20px",
              borderBottom: `1px solid ${BORDER}`,
            }}
          >
            <span
              style={{
                fontFamily: "ui-monospace,monospace",
                fontSize: 11,
                color: "#7a5a3e",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              recall · agent memory pipeline
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 10,
                color: ACCENT,
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: ACCENT,
                  animation: "recall-blink 1.4s infinite",
                }}
              />
              live
              <style>{`@keyframes recall-blink{0%,100%{opacity:1}50%{opacity:0.2}}`}</style>
            </div>
          </div>

          <canvas
            ref={canvasRef}
            style={{ display: "block", width: "100%", height: 300 }}
          />

          <div style={{ display: "flex", borderTop: `1px solid ${BORDER}` }}>
            <div style={statStyle}>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: "#fdf6ee",
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                {writes.toLocaleString()}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: "#5a3a20",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginTop: 4,
                }}
              >
                vectors written
              </div>
            </div>
            <div style={statStyle}>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: ACCENT_BLUE,
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                {avgLatency}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: "#5a3a20",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginTop: 4,
                }}
              >
                avg query
              </div>
            </div>
            <div style={statStyle}>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: ACCENT_GREEN,
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                {proofs.toLocaleString()}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: "#5a3a20",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginTop: 4,
                }}
              >
                proofs anchored
              </div>
            </div>
            <div style={{ ...statStyle, borderRight: "none" }}>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: ACCENT_GREEN,
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                ∞
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: "#5a3a20",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginTop: 4,
                }}
              >
                permanent
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
