// Small dependency-free SVG line chart with a crosshair tooltip. Redraws on resize.
// lineChart(el, {
//   series: [{ name, color, points: [[x, y], ...], dots?: true (markers only), dash?: true }],
//   xFmt, yFmt, tipX,             // axis/tooltip label formatters
//   height = 220, yMin, yMax,     // y range (defaults: 0 .. max * 1.08)
//   xMin, xMax, xTicks,          // x range and the max number of x intervals
//   refs: [{ y, label }],         // horizontal reference lines (e.g. a goal)
//   marks: [{ x, label }],        // vertical markers (e.g. "today")
//   empty: "text shown when there is no data"
// })

const NS = "http://www.w3.org/2000/svg";
const M = { l: 54, r: 14, t: 14, b: 28 };

function niceStep(range, count) {
  const raw = range / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return (n >= 5 ? 10 : n >= 2 ? 5 : n >= 1 ? 2 : 1) * mag;
}

const svgEl = (name, attrs = {}, parent) => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.append(e);
  return e;
};

export function lineChart(el, opts) {
  el.classList.add("chart");
  el.innerHTML = "";
  const series = opts.series.filter((s) => s.points.some((p) => p[1] != null));
  if (series.length > 1 || opts.legend) {
    const lg = document.createElement("div");
    lg.className = "chart-legend";
    for (const s of opts.series) {
      const i = document.createElement("span");
      i.innerHTML = `<i class="${s.dots ? "dot" : s.dash ? "dash" : ""}" style="--c:${s.color}"></i>`;
      i.append(s.name);
      lg.append(i);
    }
    el.append(lg);
  }
  const box = document.createElement("div");
  box.className = "chart-box";
  el.append(box);
  if (!series.length) {
    box.innerHTML = `<p class="chart-empty">${opts.empty || "Нет данных"}</p>`;
    return;
  }
  const tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.hidden = true;
  box.append(tip);

  const H = opts.height || 220;
  const all = series.flatMap((s) => s.points.filter((p) => p[1] != null));
  const xs = all.map((p) => p[0]).concat((opts.marks || []).map((m) => m.x));
  const xMin = opts.xMin ?? Math.min(...xs), xMax0 = opts.xMax ?? Math.max(...xs);
  const xMax = xMax0 === xMin ? xMin + 1 : xMax0;
  const ys = all.map((p) => p[1]).concat((opts.refs || []).map((r) => r.y));
  const yMin = opts.yMin ?? 0;
  const yMax = opts.yMax ?? (Math.max(...ys) * 1.08 || 1);

  let svg = null;
  function draw() {
    const W = Math.max(260, box.clientWidth);
    if (svg) svg.remove();
    svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "chart-svg", role: "img", "aria-label": opts.label || "" });
    box.prepend(svg);
    const x = (v) => M.l + ((v - xMin) / (xMax - xMin)) * (W - M.l - M.r);
    const y = (v) => H - M.b - ((v - yMin) / (yMax - yMin)) * (H - M.t - M.b);

    // Grid and y axis
    const step = niceStep(yMax - yMin, 4);
    for (let v = Math.ceil(yMin / step) * step; v <= yMax + 1e-9; v += step) {
      svgEl("line", { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v), class: "chart-grid" }, svg);
      const t = svgEl("text", { x: M.l - 8, y: y(v) + 4, class: "chart-ylab", "text-anchor": "end" }, svg);
      t.textContent = opts.yFmt ? opts.yFmt(v) : v;
    }
    // x labels
    const n = Math.max(2, Math.min(opts.xTicks || 6, Math.floor((W - M.l - M.r) / 110)));
    for (let i = 0; i <= n; i++) {
      const v = xMin + ((xMax - xMin) * i) / n;
      const t = svgEl("text", { x: x(v), y: H - 8, class: "chart-xlab", "text-anchor": i === 0 ? "start" : i === n ? "end" : "middle" }, svg);
      t.textContent = opts.xFmt ? opts.xFmt(v) : v;
    }
    svgEl("line", { x1: M.l, x2: W - M.r, y1: H - M.b, y2: H - M.b, class: "chart-axis" }, svg);

    for (const r of opts.refs || []) {
      svgEl("line", { x1: M.l, x2: W - M.r, y1: y(r.y), y2: y(r.y), class: "chart-ref" }, svg);
      const t = svgEl("text", { x: W - M.r - 4, y: y(r.y) - 6, class: "chart-reflab", "text-anchor": "end" }, svg);
      t.textContent = r.label;
    }
    for (const m of opts.marks || []) {
      if (m.x < xMin || m.x > xMax) continue;
      svgEl("line", { x1: x(m.x), x2: x(m.x), y1: M.t, y2: H - M.b, class: "chart-mark" }, svg);
      const right = x(m.x) > W - M.r - 60; // near the right edge: label on the left of the line
      const t = svgEl("text", { x: x(m.x) + (right ? -4 : 4), y: M.t + 10, class: "chart-marklab", "text-anchor": right ? "end" : "start" }, svg);
      t.textContent = m.label;
    }

    // Series: lines (gaps where y is null), then dot-only series on top
    for (const s of series) {
      if (s.dots) continue;
      let d = "", pen = false;
      for (const [px, py] of s.points) {
        if (py == null) { pen = false; continue; }
        d += `${pen ? "L" : "M"}${x(px).toFixed(1)},${y(py).toFixed(1)}`;
        pen = true;
      }
      svgEl("path", { d, class: "chart-line" + (s.dash ? " dash" : ""), style: `--c:${s.color}` }, svg);
      const pts = s.points.filter((p) => p[1] != null);
      if (pts.length === 1) svgEl("circle", { cx: x(pts[0][0]), cy: y(pts[0][1]), r: 4, class: "chart-dot", style: `--c:${s.color}` }, svg);
    }
    for (const s of series) {
      if (!s.dots) continue;
      for (const [px, py] of s.points) if (py != null) svgEl("circle", { cx: x(px), cy: y(py), r: 4, class: "chart-dot", style: `--c:${s.color}` }, svg);
    }

    // Hover layer: crosshair + nearest point per series
    const cross = svgEl("line", { y1: M.t, y2: H - M.b, class: "chart-cross", visibility: "hidden" }, svg);
    const marks = series.map((s) => svgEl("circle", { r: 5, class: "chart-hover", style: `--c:${s.color}`, visibility: "hidden" }, svg));
    const hit = svgEl("rect", { x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b, class: "chart-hit" }, svg);
    const move = (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      const xv = xMin + ((px - M.l) / (W - M.l - M.r)) * (xMax - xMin);
      let rows = "", any = false, xAt = null;
      series.forEach((s, i) => {
        let best = null;
        for (const p of s.points) if (p[1] != null && (!best || Math.abs(p[0] - xv) < Math.abs(best[0] - xv))) best = p;
        const near = best && Math.abs(x(best[0]) - px) < (s.dots ? 18 : 60);
        marks[i].setAttribute("visibility", near ? "visible" : "hidden");
        if (!near) return;
        any = true;
        xAt = xAt ?? best[0];
        marks[i].setAttribute("cx", x(best[0]));
        marks[i].setAttribute("cy", y(best[1]));
        rows += `<div><i style="--c:${s.color}"></i>${s.name}<b>${opts.yFmt ? opts.yFmt(best[1], true) : best[1]}</b></div>`;
      });
      if (!any) { leave(); return; }
      cross.setAttribute("x1", x(xAt));
      cross.setAttribute("x2", x(xAt));
      cross.setAttribute("visibility", "visible");
      tip.innerHTML = `<span>${(opts.tipX || opts.xFmt || String)(xAt)}</span>${rows}`;
      tip.hidden = false;
      const tx = (x(xAt) / W) * r.width;
      tip.style.left = `${Math.min(r.width - tip.offsetWidth - 4, Math.max(4, tx + 12))}px`;
    };
    const leave = () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); marks.forEach((m) => m.setAttribute("visibility", "hidden")); };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", leave);
  }
  draw();
  if (window.ResizeObserver) {
    let w = box.clientWidth;
    new ResizeObserver(() => { if (Math.abs(box.clientWidth - w) > 4) { w = box.clientWidth; draw(); } }).observe(box);
  }
}
