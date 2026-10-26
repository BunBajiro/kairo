/** Glyph bounds are in CSS pixels, including the text outline, never camera/world units. */
export function mapLabelBounds(x, baseline, metrics, fontSize, halo = 1.5) {
  const finite = value => Number.isFinite(value) ? value : 0;
  const ascent = Number.isFinite(metrics.actualBoundingBoxAscent) ? Math.max(0, metrics.actualBoundingBoxAscent) : fontSize;
  const descent = Number.isFinite(metrics.actualBoundingBoxDescent) ? Math.max(0, metrics.actualBoundingBoxDescent) : fontSize * .22;
  return {
    left: x - Math.max(0, finite(metrics.actualBoundingBoxLeft)) - halo,
    right: x + Math.max(finite(metrics.width), finite(metrics.actualBoundingBoxRight)) + halo,
    top: baseline - ascent - halo,
    bottom: baseline + descent + halo,
  };
}

/** Fade the whole label before any glyph/halo touches the edge; smooth at both ends. */
export function labelEdgeOpacity(rect, viewport, fade = 44, inset = 4) {
  const distance = Math.min(rect.left - inset, rect.top - inset, viewport.width - inset - rect.right, viewport.height - inset - rect.bottom);
  if (!Number.isFinite(distance) || !Number.isFinite(fade) || fade <= 0) return 0;
  const progress = Math.max(0, Math.min(1, distance / fade));
  return progress * progress * (3 - 2 * progress);
}

export function labelCollisionBounds(rect, padding = 6) {
  return {left:rect.left-padding,top:rect.top-padding,right:rect.right+padding,bottom:rect.bottom+padding};
}
