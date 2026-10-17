/**
 * Paint the supplied Maps DOM surface without reconciling React's scene. Camera
 * translation and viewport size are CSS pixels; zoom maps card/world units to
 * those pixels. Missing controls are allowed (for example a collapsed minimap).
 * References belong to the caller's document, which may be a detached window.
 * This helper changes styles, attributes and the zoom text, but owns no timers.
 */
export function paintChainCamera(surface, camera, size, limits) {
    const {x, y, zoom} = camera;
    if (surface.root) {
        surface.root.dataset.cameraX = String(x);
        surface.root.dataset.cameraY = String(y);
        surface.root.dataset.cameraZoom = String(zoom);
    }
    if (surface.viewport) {
        surface.viewport.dataset.zoom = String(zoom);
        surface.viewport.style.backgroundPosition = `${x}px ${y}px`;
        surface.viewport.style.backgroundSize = `${40 * zoom}px ${40 * zoom}px`;
    }
    if (surface.world) surface.world.style.transform = `translate(${x}px,${y}px) scale(${zoom})`;
    if (surface.output) {
        const label = `${Math.round(zoom * 100)}%`;
        if (surface.output.textContent !== label) {
            // Retain the text node across camera frames. Replacing it with
            // textContent invalidates ancestor :has() selectors and can force
            // the entire dense map through style recalculation for one label.
            const text = surface.output.firstChild;
            if (text?.nodeType === 3 && text === surface.output.lastChild) text.nodeValue = label;
            else surface.output.textContent = label;
        }
        surface.output.dataset.zoom = String(zoom);
    }
    if (surface.zoomOut) surface.zoomOut.disabled = zoom <= limits.min + .001;
    if (surface.zoomIn) surface.zoomIn.disabled = zoom >= limits.max - .001;
    if (surface.minimap) {
        for (const [name, value] of Object.entries({x: -x / zoom, y: -y / zoom, width: size.width / zoom, height: size.height / zoom})) {
            surface.minimap.setAttribute(name, String(value));
        }
    }
}
