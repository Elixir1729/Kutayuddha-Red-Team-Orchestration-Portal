import React from 'react';

type NodeStatus = 'completed' | 'executing' | 'pending' | 'planned';

interface GraphNode {
  id: string;
  label: string;
  status: NodeStatus;
  x: number;
  y: number;
}

interface GraphEdge {
  from: string;
  to: string;
}

const NODE_STATUS_COLORS: Record<NodeStatus, { fill: string; stroke: string; text: string; glow: string }> = {
  completed: { fill: '#059669', stroke: '#34d399', text: '#d1fae5', glow: 'rgba(52, 211, 153, 0.25)' },
  executing: { fill: '#2563eb', stroke: '#60a5fa', text: '#dbeafe', glow: 'rgba(96, 165, 250, 0.35)' },
  pending: { fill: '#d97706', stroke: '#fbbf24', text: '#fef3c7', glow: 'rgba(251, 191, 36, 0.25)' },
  planned: { fill: '#475569', stroke: '#94a3b8', text: '#cbd5e1', glow: 'rgba(148, 163, 184, 0.15)' },
};

const nodes: GraphNode[] = [
  { id: 'dns', label: 'DNS Recon', status: 'completed', x: 80, y: 120 },
  { id: 'portscan', label: 'Port Scan', status: 'completed', x: 250, y: 70 },
  { id: 'svcenum', label: 'Service Enum', status: 'completed', x: 420, y: 120 },
  { id: 'vulnscan', label: 'Vuln Scan', status: 'executing', x: 590, y: 70 },
  { id: 'exploit', label: 'Exploit Attempt', status: 'pending', x: 760, y: 120 },
];

const edges: GraphEdge[] = [
  { from: 'dns', to: 'portscan' },
  { from: 'portscan', to: 'svcenum' },
  { from: 'svcenum', to: 'vulnscan' },
  { from: 'vulnscan', to: 'exploit' },
];

const NODE_RX = 12;
const NODE_WIDTH = 130;
const NODE_HEIGHT = 48;

export const AttackGraph: React.FC = () => {
  const getNodeCenter = (node: GraphNode) => ({
    cx: node.x + NODE_WIDTH / 2,
    cy: node.y + NODE_HEIGHT / 2,
  });

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-700">
        <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <h3 className="text-sm font-semibold text-slate-200">Attack Chain</h3>
      </div>

      <div className="p-4 overflow-x-auto">
        <svg
          viewBox="0 0 900 200"
          className="w-full"
          style={{ minWidth: 600 }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Arrow marker */}
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#64748b" />
            </marker>

            {/* Glow filters for each status */}
            {Object.entries(NODE_STATUS_COLORS).map(([status, colors]) => (
              <filter key={status} id={`glow-${status}`} x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={colors.glow} floodOpacity="1" />
              </filter>
            ))}

            {/* Executing pulse animation */}
            <animate
              xlinkHref="#executing-ring"
              attributeName="opacity"
              values="0.6;0.15;0.6"
              dur="2s"
              repeatCount="indefinite"
            />
          </defs>

          {/* Grid dots background */}
          <pattern id="grid-dots" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="0.5" fill="#334155" />
          </pattern>
          <rect width="900" height="200" fill="url(#grid-dots)" />

          {/* Edges */}
          {edges.map((edge) => {
            const fromNode = nodes.find((n) => n.id === edge.from)!;
            const toNode = nodes.find((n) => n.id === edge.to)!;
            const from = getNodeCenter(fromNode);
            const to = getNodeCenter(toNode);

            const startX = fromNode.x + NODE_WIDTH;
            const startY = from.cy;
            const endX = toNode.x;
            const endY = to.cy;

            const midX = (startX + endX) / 2;

            return (
              <path
                key={`${edge.from}-${edge.to}`}
                d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`}
                fill="none"
                stroke="#475569"
                strokeWidth="2"
                strokeDasharray="6 3"
                markerEnd="url(#arrowhead)"
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const colors = NODE_STATUS_COLORS[node.status];
            return (
              <g key={node.id}>
                {/* Glow rect */}
                <rect
                  x={node.x}
                  y={node.y}
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={NODE_RX}
                  fill={colors.fill}
                  stroke={colors.stroke}
                  strokeWidth="1.5"
                  filter={`url(#glow-${node.status})`}
                  opacity="0.9"
                />

                {/* Executing ring animation */}
                {node.status === 'executing' && (
                  <rect
                    id="executing-ring"
                    x={node.x - 3}
                    y={node.y - 3}
                    width={NODE_WIDTH + 6}
                    height={NODE_HEIGHT + 6}
                    rx={NODE_RX + 2}
                    fill="none"
                    stroke={colors.stroke}
                    strokeWidth="2"
                    opacity="0.4"
                  >
                    <animate
                      attributeName="opacity"
                      values="0.6;0.1;0.6"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </rect>
                )}

                {/* Label */}
                <text
                  x={node.x + NODE_WIDTH / 2}
                  y={node.y + NODE_HEIGHT / 2 - 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={colors.text}
                  fontSize="12"
                  fontWeight="600"
                  fontFamily="system-ui, sans-serif"
                >
                  {node.label}
                </text>

                {/* Status label below */}
                <text
                  x={node.x + NODE_WIDTH / 2}
                  y={node.y + NODE_HEIGHT + 16}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="10"
                  fontFamily="system-ui, sans-serif"
                >
                  {node.status.charAt(0).toUpperCase() + node.status.slice(1)}
                </text>
              </g>
            );
          })}

          {/* Legend */}
          {(['completed', 'executing', 'pending', 'planned'] as NodeStatus[]).map((status, i) => {
            const colors = NODE_STATUS_COLORS[status];
            const lx = 20 + i * 120;
            const ly = 185;
            return (
              <g key={`legend-${status}`}>
                <rect x={lx} y={ly} width="10" height="10" rx="2" fill={colors.fill} stroke={colors.stroke} strokeWidth="1" />
                <text x={lx + 15} y={ly + 8} fill="#94a3b8" fontSize="10" fontFamily="system-ui, sans-serif">
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export default AttackGraph;
