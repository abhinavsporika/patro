// src/components/WeaknessCloud.tsx
// D3 force-directed visualization of failure domains
import React, { useEffect, useRef, useState } from 'react';
import { getFailureDomains, FailureDomain } from '../lib/api';

interface Props {
  visible: boolean;
}

export const WeaknessCloud: React.FC<Props> = ({ visible }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [domains, setDomains] = useState<FailureDomain[]>([]);

  useEffect(() => {
    if (visible) {
      getFailureDomains().then(setDomains).catch(() => {});
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || domains.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const maxCount = Math.max(...domains.map(d => d.count), 1);

    const colors: Record<string, string> = {
      array: '#00e5a0', hashmap: '#7b61ff', two_pointer: '#ff6b6b',
      sliding_window: '#ffb800', binary_search: '#00c2ff', dp: '#ff5caa',
      graph: '#b8ff00', tree: '#e8e8e8', linked_list: '#ff9500',
      default: '#666',
    };

    // Simple force-directed layout using animation frames
    const nodes = domains.map((d, i) => {
      const angle = (i / domains.length) * Math.PI * 2;
      const radius = 80 + Math.random() * 40;
      return {
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
        vx: 0, vy: 0,
        domain: d.domain,
        count: d.count,
        size: 12 + (d.count / maxCount) * 30,
        color: colors[d.domain] || colors.default,
      };
    });

    let frame: number;
    let tick = 0;
    const maxTicks = 120;

    function simulate() {
      if (tick >= maxTicks) return;
      tick++;

      // Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = nodes[i].size + nodes[j].size + 10;
          if (dist < minDist) {
            const force = (minDist - dist) * 0.05;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            nodes[i].vx -= fx; nodes[i].vy -= fy;
            nodes[j].vx += fx; nodes[j].vy += fy;
          }
        }
      }

      // Center gravity
      for (const node of nodes) {
        node.vx += (width / 2 - node.x) * 0.01;
        node.vy += (height / 2 - node.y) * 0.01;
        node.vx *= 0.9; node.vy *= 0.9;
        node.x += node.vx; node.y += node.vy;
      }

      // Draw
      const c = ctx!;
      c.clearRect(0, 0, width, height);

      for (const node of nodes) {
        // Circle
        c.beginPath();
        c.arc(node.x, node.y, node.size, 0, Math.PI * 2);
        c.fillStyle = node.color + '18';
        c.fill();
        c.strokeStyle = node.color + '40';
        c.lineWidth = 1;
        c.stroke();

        // Label
        c.fillStyle = node.color;
        c.font = `${Math.max(9, node.size * 0.4)}px monospace`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(node.domain, node.x, node.y - 4);

        // Count
        c.fillStyle = node.color + '80';
        c.font = `${Math.max(8, node.size * 0.3)}px monospace`;
        c.fillText(`${node.count}`, node.x, node.y + 8);
      }

      frame = requestAnimationFrame(simulate);
    }

    frame = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(frame);
  }, [visible, domains]);

  if (!visible) return null;

  return (
    <div className="space-y-3 animate-fade-in">
      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Weakness Cloud</h3>
      {domains.length === 0 ? (
        <p className="text-xs text-gray-600">Complete some runs to see your weakness patterns emerge</p>
      ) : (
        <canvas
          ref={canvasRef}
          width={400}
          height={300}
          className="w-full rounded-lg border border-gray-800 bg-gray-950"
        />
      )}
    </div>
  );
};
