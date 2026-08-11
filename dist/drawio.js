const paletteByType = {
    frontend: { fill: "#eaf2ff", stroke: "#2563eb" },
    gateway: { fill: "#eef2ff", stroke: "#4f46e5" },
    service: { fill: "#e8f8f5", stroke: "#0f9d8a" },
    worker: { fill: "#e8f8f5", stroke: "#0f9d8a" },
    database: { fill: "#fff6df", stroke: "#d97706" },
    cache: { fill: "#fff6df", stroke: "#d97706" },
    queue: { fill: "#f3e8ff", stroke: "#7c3aed" },
    external: { fill: "#fdecec", stroke: "#dc2626" },
    library: { fill: "#e8f8f5", stroke: "#0f9d8a" },
    other: { fill: "#f3f4f6", stroke: "#64748b" },
};
const paletteByState = {
    violation: { fill: "#fee2e2", stroke: "#dc2626" },
    evolution: { fill: "#ffedd5", stroke: "#ea580c" },
    removed: { fill: "#f1f5f9", stroke: "#94a3b8" },
};
const layerOrder = [
    "experience",
    "edge",
    "application",
    "domain",
    "data",
    "integration",
    "external",
];
function escapeXml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;");
}
function escapeHtmlText(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
/** Generate an uncompressed, editable diagrams.net/draw.io XML document. */
export function generateDrawio(document, options = {}) {
    const ids = Object.keys(document.components).sort();
    const usedLayers = layerOrder.filter((layer) => ids.some((id) => document.components[id]?.layer === layer));
    const grouped = usedLayers.map((layer) => ids.filter((id) => document.components[id]?.layer === layer));
    const positions = new Map();
    for (const [column, group] of grouped.entries()) {
        group.sort().forEach((id, index) => {
            positions.set(id, { x: 60 + column * 230, y: 110 + index * 140 });
        });
    }
    const maxRows = Math.max(1, ...grouped.map((group) => group.length));
    const pageWidth = Math.max(1169, 70 + usedLayers.length * 230);
    const pageHeight = Math.max(827, 250 + maxRows * 140);
    const title = escapeXml(document.metadata.name);
    const displayTitle = escapeXml(options.title ?? `${document.metadata.name} — Expected Architecture`);
    const titleWidth = options.title ? pageWidth - 120 : 600;
    const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<mxfile host="app.diagrams.net" agent="ArchSync" version="1.0">',
        `  <diagram id="archsync-architecture" name="${title}">`,
        `    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageWidth}" pageHeight="${pageHeight}" math="0" shadow="0">`,
        "      <root>",
        '        <mxCell id="0"/>',
        '        <mxCell id="1" parent="0"/>',
        `        <mxCell id="title" value="${displayTitle}" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=22;fontStyle=1;fontColor=#10243e;" vertex="1" parent="1">`,
        `          <mxGeometry x="60" y="30" width="${titleWidth}" height="40" as="geometry"/>`,
        "        </mxCell>",
    ];
    for (const id of ids) {
        const component = document.components[id];
        const position = positions.get(id);
        if (!component || !position)
            continue;
        const state = options.nodeStates?.[id];
        const palette = state ? paletteByState[state] : paletteByType[component.type];
        const name = escapeHtmlText(component.name ?? id);
        const detail = escapeHtmlText(`${component.type} · ${component.layer}${state ? ` · ${state.toUpperCase()}` : ""}`);
        const value = escapeXml(`<b>${name}</b><br><font color="#475569" style="font-size:11px">${detail}</font>`);
        const style = `rounded=1;whiteSpace=wrap;html=1;arcSize=12;fillColor=${palette.fill};strokeColor=${palette.stroke};strokeWidth=${state === "violation" ? 3 : 2};fontColor=#10243e;fontSize=14;spacing=8;shadow=0;${state === "removed" ? "dashed=1;dashPattern=6 4;opacity=70;" : ""}`;
        lines.push(`        <mxCell id="node-${escapeXml(id)}" value="${value}" style="${style}" vertex="1" parent="1">`, `          <mxGeometry x="${position.x}" y="${position.y}" width="170" height="72" as="geometry"/>`, "        </mxCell>");
    }
    [...document.relationships]
        .sort((a, b) => `${a.from}-${a.to}-${a.type}`.localeCompare(`${b.from}-${b.to}-${b.type}`))
        .forEach((relationship, index) => {
        const key = `${relationship.from}|${relationship.type}|${relationship.to}`;
        const state = options.edgeStates?.[key];
        const label = escapeXml(options.edgeLabels?.[key] ?? relationship.type);
        const stroke = state ? paletteByState[state].stroke : "#64748b";
        const width = state === "violation" ? 4 : state === "evolution" ? 3 : 1;
        const widthStyle = state ? `strokeWidth=${width};` : "";
        const dashed = state === "removed" ? "dashed=1;dashPattern=6 4;opacity=70;" : "";
        const sourcePosition = positions.get(relationship.from);
        const targetPosition = positions.get(relationship.to);
        const routeAnnotatedEdge = state !== undefined &&
            sourcePosition !== undefined &&
            targetPosition !== undefined &&
            sourcePosition.x !== targetPosition.x &&
            (Math.abs(sourcePosition.x - targetPosition.x) > 250 ||
                sourcePosition.y !== targetPosition.y);
        lines.push(`        <mxCell id="edge-${index + 1}" value="${label}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;strokeColor=${stroke};${widthStyle}fontColor=${state === "violation" ? "#991b1b" : "#334155"};fontSize=11;labelBackgroundColor=#ffffff;${dashed}" edge="1" parent="1" source="node-${escapeXml(relationship.from)}" target="node-${escapeXml(relationship.to)}">`);
        if (routeAnnotatedEdge) {
            const routeY = Math.max(sourcePosition.y, targetPosition.y) + 150;
            const sourceColumnBlocked = [...positions.values()].some((position) => position.x === sourcePosition.x &&
                position.y > sourcePosition.y &&
                position.y < routeY);
            const sourceLaneX = targetPosition.x > sourcePosition.x
                ? sourcePosition.x + 190
                : sourcePosition.x - 20;
            lines.push('          <mxGeometry relative="1" as="geometry">', '            <Array as="points">');
            if (sourceColumnBlocked) {
                lines.push(`              <mxPoint x="${sourceLaneX}" y="${sourcePosition.y + 36}"/>`, `              <mxPoint x="${sourceLaneX}" y="${routeY}"/>`);
            }
            else {
                lines.push(`              <mxPoint x="${sourcePosition.x + 85}" y="${routeY}"/>`);
            }
            lines.push(`              <mxPoint x="${targetPosition.x + 85}" y="${routeY}"/>`, "            </Array>", "          </mxGeometry>");
        }
        else {
            lines.push('          <mxGeometry relative="1" as="geometry"/>');
        }
        lines.push("        </mxCell>");
    });
    lines.push("      </root>", "    </mxGraphModel>", "  </diagram>", "</mxfile>", "");
    return lines.join("\n");
}
//# sourceMappingURL=drawio.js.map