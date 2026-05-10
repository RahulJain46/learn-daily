"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DIAGRAM_NODE_CONFIG,
  DIAGRAM_EDGE_KIND_CONFIG,
  type Diagram,
  type DiagramEdge,
  type DiagramEdgeKind,
  type DiagramNode,
  type DiagramNodeType,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Trash2,
  Plus,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
  Edit3,
} from "lucide-react";

// ---------------------------------------------------------------------------
// A self-contained SVG/HTML draw.io-ish canvas. Deliberately dependency-free
// (no react-flow / dnd-kit) — the data model is small, and rolling our own
// keeps the diagram JSON shape stable and stays inside the app's "no extra
// runtime weight" rule.
//
// Interaction model:
//   - Click a palette item       -> add a node at the centre of the viewport
//   - Drag a node body           -> move
//   - Drag the small port handle -> draw a connection to another node
//   - Click a node               -> select (shows edit panel)
//   - Click an edge label        -> select edge (shows edit panel)
//   - Double-click empty area    -> deselect
//   - Wheel                      -> zoom around cursor
//   - Space + drag (or middle)   -> pan
// ---------------------------------------------------------------------------

const NODE_WIDTH = 160;
const NODE_HEIGHT = 64;
const PALETTE_ORDER: DiagramNodeType[] = [
  "client",
  "mobile",
  "cdn",
  "load_balancer",
  "api_gateway",
  "service",
  "worker",
  "queue",
  "cache",
  "database",
  "object_store",
  "search",
  "stream",
  "external",
  "note",
];

interface CanvasProps {
  initialDiagram: Diagram;
  onChange?: (diagram: Diagram) => void;
  /** Disable mutation — used on the read-only report view. */
  readOnly?: boolean;
  /** Highlight nodes the AI flagged. Map nodeId -> severity badge text. */
  nodeAnnotations?: Record<string, { severity: string; tooltip: string }>;
}

type DragState =
  | { kind: "idle" }
  | { kind: "moveNode"; nodeId: string; offsetX: number; offsetY: number }
  | { kind: "drawEdge"; sourceId: string; mouseX: number; mouseY: number }
  | { kind: "pan"; startX: number; startY: number; startPanX: number; startPanY: number };

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function DiagramCanvas({
  initialDiagram,
  onChange,
  readOnly = false,
  nodeAnnotations,
}: CanvasProps) {
  const [nodes, setNodes] = useState<DiagramNode[]>(initialDiagram.nodes);
  const [edges, setEdges] = useState<DiagramEdge[]>(initialDiagram.edges);
  const [zoom, setZoom] = useState(initialDiagram.viewport?.zoom ?? 1);
  const [panX, setPanX] = useState(initialDiagram.viewport?.pan_x ?? 0);
  const [panY, setPanY] = useState(initialDiagram.viewport?.pan_y ?? 0);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState>({ kind: "idle" });
  const [spaceHeld, setSpaceHeld] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Surface state up to the parent (used for autosave + submit).
  useEffect(() => {
    onChange?.({
      nodes,
      edges,
      viewport: { zoom, pan_x: panX, pan_y: panY },
    });
    // We intentionally exclude onChange from deps to avoid re-emitting on
    // every parent re-render — onChange is provided as a stable ref by
    // callers (or wrapped in useCallback).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, zoom, panX, panY]);

  // Convert client coords -> world coords (after pan/zoom).
  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const x = (clientX - rect.left - panX) / zoom;
      const y = (clientY - rect.top - panY) / zoom;
      return { x, y };
    },
    [panX, panY, zoom]
  );

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------
  const addNode = useCallback(
    (type: DiagramNodeType) => {
      if (readOnly) return;
      const rect = containerRef.current?.getBoundingClientRect();
      const cx = rect ? (rect.width / 2 - panX) / zoom : 200;
      const cy = rect ? (rect.height / 2 - panY) / zoom : 200;
      const newNode: DiagramNode = {
        id: uid("n"),
        type,
        label: DIAGRAM_NODE_CONFIG[type].label,
        x: cx - NODE_WIDTH / 2 + (Math.random() - 0.5) * 30,
        y: cy - NODE_HEIGHT / 2 + (Math.random() - 0.5) * 30,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      };
      setNodes((prev) => [...prev, newNode]);
      setSelectedNodeId(newNode.id);
      setSelectedEdgeId(null);
    },
    [panX, panY, zoom, readOnly]
  );

  const updateNode = useCallback(
    (nodeId: string, patch: Partial<DiagramNode>) => {
      setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)));
    },
    []
  );

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeId(null);
  }, []);

  const updateEdge = useCallback(
    (edgeId: string, patch: Partial<DiagramEdge>) => {
      setEdges((prev) => prev.map((e) => (e.id === edgeId ? { ...e, ...patch } : e)));
    },
    []
  );

  const deleteEdge = useCallback((edgeId: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
    setSelectedEdgeId(null);
  }, []);

  // Track Space key for pan-mode toggle (matches draw.io's ergonomics).
  // Defined after deleteNode/deleteEdge so the effect can reference them.
  useEffect(() => {
    if (readOnly) return;
    function onDown(e: KeyboardEvent) {
      if (e.code === "Space" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setSpaceHeld(true);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !isTypingTarget(e.target)) {
        if (selectedNodeId) {
          deleteNode(selectedNodeId);
        } else if (selectedEdgeId) {
          deleteEdge(selectedEdgeId);
        }
      }
    }
    function onUp(e: KeyboardEvent) {
      if (e.code === "Space") setSpaceHeld(false);
    }
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [selectedNodeId, selectedEdgeId, readOnly, deleteNode, deleteEdge]);

  const createEdge = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    // Prevent duplicate edge between the same pair (same direction).
    setEdges((prev) => {
      if (prev.some((e) => e.source === sourceId && e.target === targetId)) {
        return prev;
      }
      return [
        ...prev,
        {
          id: uid("e"),
          source: sourceId,
          target: targetId,
          kind: "sync",
        },
      ];
    });
  }, []);

  // -------------------------------------------------------------------------
  // Pointer handlers
  // -------------------------------------------------------------------------
  const onPointerDownBackground = (e: React.PointerEvent) => {
    if (readOnly) {
      if (spaceHeld || e.button === 1) {
        startPan(e);
      }
      return;
    }
    if (spaceHeld || e.button === 1) {
      startPan(e);
      return;
    }
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  };

  const startPan = (e: React.PointerEvent) => {
    setDrag({
      kind: "pan",
      startX: e.clientX,
      startY: e.clientY,
      startPanX: panX,
      startPanY: panY,
    });
  };

  const onPointerDownNode = (e: React.PointerEvent, node: DiagramNode) => {
    if (readOnly) {
      setSelectedNodeId(node.id);
      setSelectedEdgeId(null);
      return;
    }
    e.stopPropagation();
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    const world = screenToWorld(e.clientX, e.clientY);
    setDrag({
      kind: "moveNode",
      nodeId: node.id,
      offsetX: world.x - node.x,
      offsetY: world.y - node.y,
    });
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const onPointerDownPort = (e: React.PointerEvent, node: DiagramNode) => {
    if (readOnly) return;
    e.stopPropagation();
    const world = screenToWorld(e.clientX, e.clientY);
    setDrag({
      kind: "drawEdge",
      sourceId: node.id,
      mouseX: world.x,
      mouseY: world.y,
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.kind === "moveNode") {
      const world = screenToWorld(e.clientX, e.clientY);
      updateNode(drag.nodeId, {
        x: world.x - drag.offsetX,
        y: world.y - drag.offsetY,
      });
    } else if (drag.kind === "drawEdge") {
      const world = screenToWorld(e.clientX, e.clientY);
      setDrag({ ...drag, mouseX: world.x, mouseY: world.y });
    } else if (drag.kind === "pan") {
      setPanX(drag.startPanX + (e.clientX - drag.startX));
      setPanY(drag.startPanY + (e.clientY - drag.startY));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (drag.kind === "drawEdge") {
      // Was the pointer released over a node? Walk up the DOM to find one.
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const nodeEl = target?.closest("[data-node-id]") as HTMLElement | null;
      const targetId = nodeEl?.getAttribute("data-node-id");
      if (targetId) {
        createEdge(drag.sourceId, targetId);
      }
    }
    setDrag({ kind: "idle" });
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) {
      // Plain scroll = pan. Trackpad scroll feels right.
      setPanX((p) => p - e.deltaX);
      setPanY((p) => p - e.deltaY);
      return;
    }
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const delta = -e.deltaY * 0.0015;
    const newZoom = Math.max(0.4, Math.min(2.5, zoom * (1 + delta)));
    // Zoom around cursor (keep the world point under the cursor stable).
    const worldX = (cursorX - panX) / zoom;
    const worldY = (cursorY - panY) / zoom;
    setZoom(newZoom);
    setPanX(cursorX - worldX * newZoom);
    setPanY(cursorY - worldY * newZoom);
  };

  const fitToContent = () => {
    if (nodes.length === 0) {
      setZoom(1);
      setPanX(0);
      setPanY(0);
      return;
    }
    const minX = Math.min(...nodes.map((n) => n.x)) - 40;
    const minY = Math.min(...nodes.map((n) => n.y)) - 40;
    const maxX = Math.max(...nodes.map((n) => n.x + n.width)) + 40;
    const maxY = Math.max(...nodes.map((n) => n.y + n.height)) + 40;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const wRatio = rect.width / (maxX - minX);
    const hRatio = rect.height / (maxY - minY);
    const fitZoom = Math.max(0.4, Math.min(1.5, Math.min(wRatio, hRatio)));
    setZoom(fitZoom);
    setPanX(-minX * fitZoom + (rect.width - (maxX - minX) * fitZoom) / 2);
    setPanY(-minY * fitZoom + (rect.height - (maxY - minY) * fitZoom) / 2);
  };

  // -------------------------------------------------------------------------
  // Edge geometry
  // -------------------------------------------------------------------------
  const nodeById = useMemo(() => {
    const m = new Map<string, DiagramNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  function edgePath(edge: DiagramEdge): { d: string; mx: number; my: number } | null {
    const s = nodeById.get(edge.source);
    const t = nodeById.get(edge.target);
    if (!s || !t) return null;
    const sx = s.x + s.width / 2;
    const sy = s.y + s.height / 2;
    const tx = t.x + t.width / 2;
    const ty = t.y + t.height / 2;
    // Quadratic curve gives a more diagram-y feel than a straight line and
    // keeps the label off the source/target node bodies.
    const cx = (sx + tx) / 2;
    const cy = (sy + ty) / 2 - 30;
    return {
      d: `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`,
      mx: cx,
      my: cy,
    };
  }

  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;
  const selectedEdge = selectedEdgeId
    ? edges.find((e) => e.id === selectedEdgeId) ?? null
    : null;

  return (
    <div className="flex h-full w-full flex-col gap-3 lg:flex-row">
      {/* Component palette */}
      {!readOnly && (
        <div className="lg:w-48 shrink-0 rounded-lg border border-border bg-card p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Components</p>
          <div className="grid grid-cols-3 lg:grid-cols-2 gap-1.5">
            {PALETTE_ORDER.map((type) => {
              const cfg = DIAGRAM_NODE_CONFIG[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => addNode(type)}
                  title={cfg.description}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-[11px] font-medium hover:scale-[1.02] transition-transform text-left flex items-center gap-1",
                    cfg.color
                  )}
                >
                  <Plus className="h-3 w-3 shrink-0 opacity-60" />
                  <span className="truncate">{cfg.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[10px] leading-snug text-muted-foreground">
            Click a component to add it. Drag the small dot on a node to draw a
            connection. Hold Space + drag to pan, Ctrl/Cmd+Wheel to zoom.
          </p>
        </div>
      )}

      {/* Canvas */}
      <div className="relative flex-1 min-h-[480px] rounded-lg border border-border bg-muted/30 overflow-hidden">
        <div
          ref={containerRef}
          className={cn(
            "absolute inset-0",
            spaceHeld || drag.kind === "pan" ? "cursor-grabbing" : "cursor-default"
          )}
          onPointerDown={onPointerDownBackground}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setDrag({ kind: "idle" })}
          onWheel={onWheel}
        >
          {/* Grid background — drawn in CSS so it scales infinitely without re-renders. */}
          <div
            className="absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                "radial-gradient(circle, var(--color-border) 1px, transparent 1px)",
              backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
              backgroundPosition: `${panX}px ${panY}px`,
            }}
          />

          {/* Edges layer (SVG covers the whole canvas) */}
          <svg
            className="absolute inset-0 pointer-events-none"
            style={{ overflow: "visible" }}
          >
            <defs>
              <marker
                id="arrowhead"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" className="fill-foreground/70" />
              </marker>
            </defs>
            <g
              transform={`translate(${panX} ${panY}) scale(${zoom})`}
              className="text-foreground/60"
            >
              {edges.map((edge) => {
                const p = edgePath(edge);
                if (!p) return null;
                const isSelected = selectedEdgeId === edge.id;
                const dashed =
                  DIAGRAM_EDGE_KIND_CONFIG[edge.kind]?.dashed ?? false;
                return (
                  <g key={edge.id} className="pointer-events-auto">
                    <path
                      d={p.d}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={isSelected ? 2.5 : 1.6}
                      strokeDasharray={dashed ? "5 5" : undefined}
                      markerEnd="url(#arrowhead)"
                      className={cn(isSelected && "text-primary")}
                    />
                    {/* Wider invisible hit path so clicks land easily */}
                    <path
                      d={p.d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                      onPointerDown={(e) => {
                        if (readOnly) return;
                        e.stopPropagation();
                        setSelectedEdgeId(edge.id);
                        setSelectedNodeId(null);
                      }}
                      style={{ cursor: readOnly ? "default" : "pointer" }}
                    />
                    {(edge.label || edge.kind !== "sync" || isSelected) && (
                      <foreignObject
                        x={p.mx - 60}
                        y={p.my - 12}
                        width={120}
                        height={24}
                        className="pointer-events-none"
                      >
                        <div className="flex justify-center">
                          <span
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] bg-background border border-border text-foreground/80 truncate max-w-full pointer-events-auto",
                              isSelected && "border-primary text-primary"
                            )}
                            onPointerDown={(e) => {
                              if (readOnly) return;
                              e.stopPropagation();
                              setSelectedEdgeId(edge.id);
                              setSelectedNodeId(null);
                            }}
                            style={{ cursor: readOnly ? "default" : "pointer" }}
                          >
                            {edge.label || DIAGRAM_EDGE_KIND_CONFIG[edge.kind].label}
                          </span>
                        </div>
                      </foreignObject>
                    )}
                  </g>
                );
              })}
              {/* Live edge being drawn */}
              {drag.kind === "drawEdge" &&
                (() => {
                  const src = nodeById.get(drag.sourceId);
                  if (!src) return null;
                  const sx = src.x + src.width / 2;
                  const sy = src.y + src.height / 2;
                  return (
                    <line
                      x1={sx}
                      y1={sy}
                      x2={drag.mouseX}
                      y2={drag.mouseY}
                      stroke="currentColor"
                      strokeDasharray="4 4"
                      className="text-primary"
                    />
                  );
                })()}
            </g>
          </svg>

          {/* Nodes layer */}
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
              transformOrigin: "0 0",
            }}
          >
            {nodes.map((node) => {
              const cfg = DIAGRAM_NODE_CONFIG[node.type];
              const isSelected = selectedNodeId === node.id;
              const annotation = nodeAnnotations?.[node.id];
              return (
                <div
                  key={node.id}
                  data-node-id={node.id}
                  onPointerDown={(e) => onPointerDownNode(e, node)}
                  className={cn(
                    "absolute rounded-lg border-2 shadow-sm select-none flex flex-col items-center justify-center text-center p-2",
                    cfg.color,
                    isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "",
                    annotation ? "ring-2 ring-orange-500" : "",
                    readOnly ? "cursor-default" : "cursor-grab"
                  )}
                  style={{
                    left: node.x,
                    top: node.y,
                    width: node.width,
                    height: node.height,
                  }}
                >
                  <div className="text-[10px] uppercase tracking-wide opacity-60 leading-none">
                    {cfg.label}
                  </div>
                  <div className="text-sm font-semibold leading-tight truncate w-full">
                    {node.label || cfg.label}
                  </div>
                  {node.notes && (
                    <div className="text-[10px] opacity-70 truncate w-full">
                      {node.notes}
                    </div>
                  )}
                  {annotation && (
                    <div
                      title={annotation.tooltip}
                      className="absolute -top-2 -right-2 rounded-full bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5"
                    >
                      {annotation.severity}
                    </div>
                  )}
                  {/* Output port handle (used to draw edges). Hidden in read-only. */}
                  {!readOnly && (
                    <div
                      onPointerDown={(e) => onPointerDownPort(e, node)}
                      className="absolute -right-2 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-primary border-2 border-background cursor-crosshair"
                      title="Drag to connect"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Empty-state hint */}
          {nodes.length === 0 && !readOnly && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-sm text-muted-foreground bg-background/80 rounded-md px-3 py-2 border border-border">
                Add components from the palette to start your design.
              </p>
            </div>
          )}
        </div>

        {/* Zoom + utility controls */}
        <div className="absolute bottom-3 right-3 flex flex-col gap-1.5 bg-card border border-border rounded-md p-1 shadow-sm">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setZoom((z) => Math.min(2.5, z * 1.2))}
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setZoom((z) => Math.max(0.4, z / 1.2))}
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={fitToContent}
            title="Fit to content"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="absolute bottom-3 left-3 text-[10px] text-muted-foreground bg-background/80 rounded px-2 py-1 border border-border">
          {Math.round(zoom * 100)}%
        </div>
      </div>

      {/* Inspector panel */}
      {!readOnly && (selectedNode || selectedEdge) && (
        <div className="lg:w-64 shrink-0 rounded-lg border border-border bg-card p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Edit3 className="h-3 w-3" />
              {selectedNode ? "Component" : "Connection"}
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedNodeId(null);
                setSelectedEdgeId(null);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          {selectedNode && (
            <NodeInspector
              node={selectedNode}
              onChange={(patch) => updateNode(selectedNode.id, patch)}
              onDelete={() => deleteNode(selectedNode.id)}
            />
          )}

          {selectedEdge && (
            <EdgeInspector
              edge={selectedEdge}
              onChange={(patch) => updateEdge(selectedEdge.id, patch)}
              onDelete={() => deleteEdge(selectedEdge.id)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function NodeInspector({
  node,
  onChange,
  onDelete,
}: {
  node: DiagramNode;
  onChange: (patch: Partial<DiagramNode>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className="text-[10px] uppercase text-muted-foreground">Type</label>
        <div className="text-xs font-medium">
          {DIAGRAM_NODE_CONFIG[node.type].label}
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-[10px] uppercase text-muted-foreground">Label</label>
        <input
          value={node.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="w-full text-sm rounded-md border border-border bg-background px-2 py-1"
          placeholder="e.g. UserService"
        />
      </div>
      <div className="space-y-1">
        <label className="text-[10px] uppercase text-muted-foreground">
          Notes (sharding key, replication, etc.)
        </label>
        <textarea
          value={node.notes ?? ""}
          onChange={(e) => onChange({ notes: e.target.value })}
          className="w-full text-xs rounded-md border border-border bg-background px-2 py-1 min-h-[60px] resize-y"
          placeholder="e.g. sharded by user_id, 3 replicas, p99 < 50ms"
        />
      </div>
      <Button variant="destructive" size="sm" onClick={onDelete} className="w-full">
        <Trash2 className="h-3 w-3 mr-1" /> Delete
      </Button>
    </div>
  );
}

function EdgeInspector({
  edge,
  onChange,
  onDelete,
}: {
  edge: DiagramEdge;
  onChange: (patch: Partial<DiagramEdge>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className="text-[10px] uppercase text-muted-foreground">Kind</label>
        <select
          value={edge.kind}
          onChange={(e) => onChange({ kind: e.target.value as DiagramEdgeKind })}
          className="w-full text-xs rounded-md border border-border bg-background px-2 py-1"
        >
          {(Object.keys(DIAGRAM_EDGE_KIND_CONFIG) as DiagramEdgeKind[]).map((k) => (
            <option key={k} value={k}>
              {DIAGRAM_EDGE_KIND_CONFIG[k].label} — {DIAGRAM_EDGE_KIND_CONFIG[k].description}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-[10px] uppercase text-muted-foreground">Label</label>
        <input
          value={edge.label ?? ""}
          onChange={(e) => onChange({ label: e.target.value })}
          className="w-full text-sm rounded-md border border-border bg-background px-2 py-1"
          placeholder="e.g. POST /shorten"
        />
      </div>
      <div className="space-y-1">
        <label className="text-[10px] uppercase text-muted-foreground">Notes</label>
        <textarea
          value={edge.notes ?? ""}
          onChange={(e) => onChange({ notes: e.target.value })}
          className="w-full text-xs rounded-md border border-border bg-background px-2 py-1 min-h-[50px] resize-y"
          placeholder="e.g. retries with backoff, idempotent"
        />
      </div>
      <Button variant="destructive" size="sm" onClick={onDelete} className="w-full">
        <Trash2 className="h-3 w-3 mr-1" /> Delete
      </Button>
    </div>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}
