(function (root) {
  function blastRadius(originModuleId, modules) {
    const byId = {};
    modules.forEach((m) => {
      byId[m.id] = m;
    });
    if (!byId[originModuleId]) {
      return { originModuleId, timestamp: Date.now(), affected: [] };
    }

    const dist = {};
    const q = [originModuleId];
    dist[originModuleId] = 0;

    while (q.length) {
      const cur = q.shift();
      const d = dist[cur];
      const node = byId[cur];
      (node.dependents || []).forEach((depId) => {
        if (dist[depId] === undefined) {
          dist[depId] = d + 1;
          q.push(depId);
        }
      });
    }

    const affected = modules.map((m) => {
      const d = dist[m.id];
      let severity = "dim";
      if (m.id === originModuleId) severity = "origin";
      else if (d === 1) severity = "red";
      else if (d === 2) severity = "amber";
      return { moduleId: m.id, distance: d === undefined ? null : d, severity };
    });

    return {
      originModuleId,
      timestamp: Date.now(),
      affected,
    };
  }

  function impactWalk(originModuleId, modules) {
    const byId = {};
    modules.forEach((m) => {
      byId[m.id] = m;
    });
    const dist = {};
    const hops = [];
    const q = [originModuleId];
    dist[originModuleId] = 0;
    while (q.length) {
      const cur = q.shift();
      ((byId[cur] && byId[cur].dependents) || []).forEach((depId) => {
        if (dist[depId] !== undefined) return;
        dist[depId] = dist[cur] + 1;
        q.push(depId);
        const d = dist[depId];
        const severity = d === 1 ? "red" : d === 2 ? "amber" : "dim";
        if (severity === "red" || severity === "amber") {
          hops.push({ from: cur, to: depId, severity: severity, distance: d });
        }
      });
    }
    return hops;
  }

  function counts(result) {
    let red = 0;
    let amber = 0;
    result.affected.forEach((a) => {
      if (a.severity === "red") red += 1;
      if (a.severity === "amber") amber += 1;
    });
    return { red, amber, flagged: red + amber > 0 };
  }

  function layoutPositions(modules) {
    const rings = { infra: 6.5, core: 10.5, svc: 14.5, edge: 18.5 };
    const grouped = { infra: [], core: [], svc: [], edge: [] };
    modules.forEach((m) => grouped[m.layer].push(m));
    const pos = {};
    Object.keys(grouped).forEach((layer) => {
      const list = grouped[layer];
      const r = rings[layer];
      list.forEach((m, i) => {
        const t = (i / Math.max(list.length, 1)) * Math.PI * 2 + (layer === "core" ? 0.4 : 0);
        const y = (layer === "infra" ? -2.2 : layer === "edge" ? 2.6 : layer === "svc" ? 1.1 : -0.4) + Math.sin(i) * 0.55;
        pos[m.id] = { x: Math.cos(t) * r, y, z: Math.sin(t) * r };
      });
    });
    return pos;
  }

  root.OrbitGraph = { blastRadius, impactWalk, counts, layoutPositions };
})(window);
