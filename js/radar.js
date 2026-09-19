(function (root) {
  const CHECKS = [
    { id: "secret", label: "Secrets & config", cats: ["secret"] },
    { id: "access", label: "Access control", cats: ["idor", "authz"] },
    { id: "rate", label: "Rate limiting", cats: ["ssrf"] },
    { id: "deps", label: "Dependencies", cats: ["cve"] },
    { id: "net", label: "Network & CORS", cats: ["ssrf"] },
    { id: "tls", label: "Transport (TLS)", cats: [] },
    { id: "err", label: "Error handling", cats: ["deser"] },
    { id: "input", label: "Input validation", cats: ["sqli", "xss"] },
  ];

  const RING = { critical: 0.22, high: 0.38, medium: 0.55, low: 0.72 };

  function hashAngle(id) {
    let n = 0;
    String(id).split("").forEach(function (ch) {
      n = (n * 31 + ch.charCodeAt(0)) % 360;
    });
    return ((n / 360) * Math.PI * 2 + 0.4) % (Math.PI * 2);
  }

  function grade(hits, cats, check) {
    const selected = (cats || []).some(function (c) {
      return check.cats.indexOf(c) !== -1;
    });
    const related = (hits || []).filter(function (h) {
      return check.cats.indexOf(h.attackCategory) !== -1;
    });
    if (!related.length) return selected ? "pass" : "pass";
    if (related.some(function (h) { return h.severity === "critical" || h.severity === "high"; })) return "fail";
    if (related.some(function (h) { return h.severity === "medium"; })) return "warn";
    return "info";
  }

  function ensure() {
    if (document.getElementById("radar-overlay")) return;
    const el = document.createElement("div");
    el.id = "radar-overlay";
    el.className = "radar-overlay hidden";
    el.innerHTML =
      '<div class="radar-top"><span><a href="index.html">Hub</a> | <b>Security · Perimeter scan</b></span><span class="radar-live" id="radar-live">Scanning</span></div>' +
      '<aside class="radar-check"><div class="kicker">Preflight checklist</div><ul id="radar-checks"></ul></aside>' +
      '<aside class="radar-legend"><div class="kicker">Distance = severity</div><ul>' +
      '<li><span><i style="background:#ff4b4b"></i>Critical — core</span></li>' +
      '<li><span><i style="background:#ff8a3d"></i>High</span></li>' +
      '<li><span><i style="background:#ffb84d"></i>Medium</span></li>' +
      '<li><span><i style="background:#4fd6ff"></i>Low — edge</span></li>' +
      "</ul></aside>" +
      '<div class="radar-stage"><canvas id="radar-canvas"></canvas><div class="radar-blips" id="radar-blips"></div><div class="radar-core">SYSTEM</div></div>' +
      '<button type="button" class="primary radar-skip" id="radar-skip">Skip to findings</button>';
    document.body.appendChild(el);
  }

  function sizeCanvas(canvas) {
    const stage = canvas.parentNode;
    const w = stage.clientWidth || 640;
    const h = stage.clientHeight || 480;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h, cx: w / 2, cy: h / 2, r: Math.min(w, h) * 0.42 };
  }

  function drawRadar(ctx, geo, sweep) {
    ctx.clearRect(0, 0, geo.w, geo.h);
    ctx.strokeStyle = "rgba(79,214,255,0.18)";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(geo.cx, geo.cy, geo.r * (i / 4), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(geo.cx - geo.r, geo.cy);
    ctx.lineTo(geo.cx + geo.r, geo.cy);
    ctx.moveTo(geo.cx, geo.cy - geo.r);
    ctx.lineTo(geo.cx, geo.cy + geo.r);
    ctx.stroke();
    ctx.save();
    ctx.translate(geo.cx, geo.cy);
    ctx.rotate(sweep);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, geo.r);
    g.addColorStop(0, "rgba(79,214,255,0.22)");
    g.addColorStop(1, "rgba(79,214,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, geo.r, -0.42, 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function run(hits, cats, done) {
    ensure();
    const overlay = document.getElementById("radar-overlay");
    const live = document.getElementById("radar-live");
    const list = document.getElementById("radar-checks");
    const blipsRoot = document.getElementById("radar-blips");
    const canvas = document.getElementById("radar-canvas");
    const skip = document.getElementById("radar-skip");
    overlay.classList.remove("hidden");
    live.className = "radar-live";
    live.textContent = "Scanning";
    list.innerHTML = "";
    CHECKS.forEach(function (c) {
      const li = document.createElement("li");
      li.innerHTML = "<span>" + c.label + '</span><span class="st wait" data-check="' + c.id + '">—</span>';
      list.appendChild(li);
    });
    blipsRoot.innerHTML = "";
    const findings = hits && hits.length ? hits : [];
    const nodes = findings.map(function (f, i) {
      const ang = f.id === "F-SQL-1" ? -0.55 : hashAngle(f.id) + i * 0.35;
      const ring = f.id === "F-SQL-1" ? 0.36 : RING[f.severity] || RING.medium;
      const el = document.createElement("div");
      el.className = "radar-blip " + f.severity;
      el.innerHTML =
        '<div class="radar-dot"></div><div class="radar-cap">' +
        f.severity +
        "</div><p>" +
        (f.title || f.id) +
        "</p>";
      blipsRoot.appendChild(el);
      return { f: f, ang: ang, ring: ring, el: el, shown: false };
    });
    let geo = sizeCanvas(canvas);
    function place() {
      geo = sizeCanvas(canvas);
      nodes.forEach(function (n) {
        const x = geo.cx + Math.cos(n.ang) * geo.r * n.ring;
        const y = geo.cy + Math.sin(n.ang) * geo.r * n.ring;
        n.el.style.left = x + "px";
        n.el.style.top = y + "px";
      });
    }
    place();
    let sweep = -Math.PI / 2;
    let raf = 0;
    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      live.className = "radar-live done";
      live.textContent = "Scan complete";
      CHECKS.forEach(function (c) {
        const st = grade(findings, cats, c);
        const cell = list.querySelector('[data-check="' + c.id + '"]');
        if (cell) {
          cell.className = "st " + st;
          cell.textContent = st;
        }
      });
      nodes.forEach(function (n) {
        n.el.classList.add("on");
      });
      setTimeout(function () {
        overlay.classList.add("hidden");
        if (done) done();
      }, 900);
    }
    skip.onclick = finish;
    function tick() {
      sweep += 0.028;
      drawRadar(geo.ctx, geo, sweep);
      const wrapped = ((sweep % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      nodes.forEach(function (n) {
        if (n.shown) return;
        const a = ((n.ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const d = Math.abs(wrapped - a);
        if (d < 0.08 || d > Math.PI * 2 - 0.08) {
          n.shown = true;
          n.el.classList.add("on");
          CHECKS.forEach(function (c) {
            if (c.cats.indexOf(n.f.attackCategory) === -1) return;
            const st = grade(findings, cats, c);
            const cell = list.querySelector('[data-check="' + c.id + '"]');
            if (cell) {
              cell.className = "st " + st;
              cell.textContent = st;
            }
          });
        }
      });
      if (nodes.length && nodes.every(function (n) { return n.shown; }) && sweep > Math.PI * 1.6) {
        finish();
        return;
      }
      if (!nodes.length && sweep > Math.PI * 2.2) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    }
    window.addEventListener("resize", place, { once: false });
    raf = requestAnimationFrame(tick);
  }

  root.RadarUI = { run: run };
})(window);
