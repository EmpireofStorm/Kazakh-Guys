(function (root) {
  function undirectedAdj(modules) {
    const adj = {};
    modules.forEach((m) => {
      adj[m.id] = adj[m.id] || [];
    });
    modules.forEach((m) => {
      (m.dependsOn || []).forEach((d) => {
        if (!adj[d]) adj[d] = [];
        if (adj[m.id].indexOf(d) === -1) adj[m.id].push(d);
        if (adj[d].indexOf(m.id) === -1) adj[d].push(m.id);
      });
    });
    return adj;
  }

  function blastRadius(originModuleId, modules) {
    const adj = undirectedAdj(modules);
    if (!adj[originModuleId]) {
      return { originModuleId, timestamp: Date.now(), affected: [] };
    }
    const dist = {};
    modules.forEach((m) => {
      dist[m.id] = Infinity;
    });
    dist[originModuleId] = 0;
    const q = [originModuleId];
    while (q.length) {
      const cur = q.shift();
      (adj[cur] || []).forEach((nb) => {
        if (dist[nb] === Infinity) {
          dist[nb] = dist[cur] + 1;
          q.push(nb);
        }
      });
    }
    const affected = modules.map((m) => {
      const d = dist[m.id];
      let severity = "dim";
      if (m.id === originModuleId) severity = "origin";
      else if (d === 1) severity = "red";
      else if (d === 2) severity = "amber";
      return { moduleId: m.id, distance: d === Infinity ? null : d, severity };
    });
    return { originModuleId, timestamp: Date.now(), affected };
  }

  function impactWalk(originModuleId, modules) {
    const adj = undirectedAdj(modules);
    const dist = {};
    const hops = [];
    const q = [originModuleId];
    dist[originModuleId] = 0;
    while (q.length) {
      const cur = q.shift();
      (adj[cur] || []).forEach((depId) => {
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
    const pos = {};
    modules.forEach((m) => {
      pos[m.id] = { x: m.x, y: m.y, z: m.z };
    });
    return pos;
  }

  function edgeId(a, b) {
    return a + "__" + b;
  }

  root.OrbitGraph = { blastRadius, impactWalk, counts, layoutPositions, undirectedAdj, edgeId };
})(window);
