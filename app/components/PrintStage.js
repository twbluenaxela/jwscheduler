'use client';

import { useEffect, useRef } from 'react';

// Off-screen, fixed-width render target for the visual exports.
//
// Every export screenshots the DOM (html-to-image) instead of redrawing it, so
// the capture has to be a REAL render of the component at print width — not the
// phone layout and not whatever edit controls happen to be on screen. This
// container is taken out of the document flow at a fixed 960px (the width the
// midweek card was designed for) so a phone viewport cannot re-flow it, and
// `nodesRef` exposes its direct children so an exporter can screenshot them one
// per page.
//
// `className` is how the older blocks keep their own hook: ImportPage's PDF
// captures set `mw-pdf-captures`, which is still styled (the print rules are
// scoped to `:is(.print-stage, .mw-pdf-captures)`) so nothing had to move for
// the midweek e2e test.
export default function PrintStage({ children, nodesRef, className = '' }) {
  const ref = useRef(null);

  // Runs after every render: the children ARE the capture nodes, and a stage
  // that changes week/month/rows must hand over the fresh nodes.
  useEffect(() => {
    if (nodesRef) nodesRef.current = ref.current ? [...ref.current.children] : [];
  });

  return (
    <div className={`print-stage${className ? ` ${className}` : ''}`} aria-hidden="true" ref={ref}>
      {children}
    </div>
  );
}
