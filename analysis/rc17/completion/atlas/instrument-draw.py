"""Diagnostic-only boundary timers in a disposable c954c0d worktree."""
from pathlib import Path
import sys
p=Path(sys.argv[1])/'components/kairo/universe-map.tsx'
s=p.read_text()
def replace(before,after):
 global s
 assert s.count(before)==1, (before,s.count(before))
 s=s.replace(before,after)
replace('    const {width, height, dpr} = dimensions.current, camera = view.current;','''    const {width, height, dpr} = dimensions.current, camera = view.current;
    const diagnosticStart = performance.now();
    let diagnosticVisibleAt = 0, diagnosticVisibleDone = 0, diagnosticGatesDone = 0, diagnosticSystemsAt = 0, diagnosticLabelsAt = 0, diagnosticLabelsDone = 0;
    let diagnosticGatesDrawn = 0;''')
replace('    const visible = points.filter(point =>', '    diagnosticVisibleAt = performance.now();\n    const visible = points.filter(point =>')
replace("    if (showConnections && space === 'known') {", "    diagnosticVisibleDone = performance.now();\n    if (showConnections && space === 'known') {")
needle='continue; context.moveTo(a.x, a.y); context.lineTo(b.x, b.y);} context.stroke();'
replace(needle,'continue; diagnosticGatesDrawn++; context.moveTo(a.x, a.y); context.lineTo(b.x, b.y);} context.stroke();')
replace('    if (showSpecialLinks && !replay) for', '    diagnosticGatesDone = performance.now();\n    if (showSpecialLinks && !replay) for')
replace('    const occupied: LabelRect[] = [];', '    diagnosticSystemsAt = performance.now();\n    const occupied: LabelRect[] = [];')
replace('    for (const label of systemLabels.sort', '    diagnosticLabelsAt = performance.now();\n    for (const label of systemLabels.sort')
replace('    if (replay?.events.length) {', '    diagnosticLabelsDone = performance.now();\n    if (replay?.events.length) {')
replace('  };\n  useEffect(() => {redraw();}, [atlas,', '''    const destination = (globalThis as any).__atlasDraw;
    if (destination) destination.push({projection,background,camera:{...camera,width,height},scale:camera.scale,points:points.length,visible:visible.length,gates:atlas.gates.length,gatesDrawn:diagnosticGatesDrawn,labels:systemLabels.length,totalMs:performance.now()-diagnosticStart,visibleMs:diagnosticVisibleDone-diagnosticVisibleAt,gatesWithCanvasMs:diagnosticGatesDone-diagnosticVisibleDone,systemsWithCanvasMs:diagnosticLabelsAt-diagnosticSystemsAt,labelsWithCanvasMs:diagnosticLabelsDone-diagnosticLabelsAt});
  };
  useEffect(() => {redraw();}, [atlas,''')
p.write_text(s)
