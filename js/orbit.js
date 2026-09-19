(function () {
  const COLORS = {
    cyan: 0x4fd6ff,
    red: 0xff4b4b,
    amber: 0xffb84d,
    slate: 0x3a4b5c,
    hazard: 0xc77dff,
    origin: 0xffffff,
  };

  const mount = document.getElementById("scene");
  function viewSize() {
    return { w: mount.clientWidth || innerWidth, h: mount.clientHeight || innerHeight };
  }

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050709, 0.028);
  const first = viewSize();
  const camera = new THREE.PerspectiveCamera(50, first.w / first.h, 0.1, 200);
  camera.position.set(12, 8, 22);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(first.w, first.h);
  renderer.setClearColor(0x050709, 1);
  mount.appendChild(renderer.domElement);

  const controls = new OrbitCam(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 6;
  controls.maxDistance = 48;

  const starGeo = new THREE.BufferGeometry();
  const starCount = 1400;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 260;
    starPos[i * 3 + 1] = (Math.random() - 0.5) * 160;
    starPos[i * 3 + 2] = (Math.random() - 0.5) * 260;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x4fd6ff, size: 0.35, opacity: 0.45, transparent: true })));

  scene.add(new THREE.AmbientLight(0x4a5a6a, 0.7));
  const key = new THREE.PointLight(0x4fd6ff, 1.1, 200);
  key.position.set(20, 40, 30);
  scene.add(key);

  const modules = OrbitData.MODULES;
  const pos = OrbitGraph.layoutPositions(modules);
  const bodies = {};
  const rings = {};
  const labelRoot = document.getElementById("labels");

  function glowMat(color, opacity) {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  modules.forEach((m) => {
    const g = new THREE.Group();
    const r = 0.32 + m.criticalityScore * 0.22;
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(r, 10, 10),
      new THREE.MeshBasicMaterial({ color: COLORS.cyan })
    );
    const halo = new THREE.Mesh(new THREE.SphereGeometry(r * 1.7, 10, 10), glowMat(COLORS.cyan, 0.18));
    g.add(core);
    g.add(halo);
    const p = pos[m.id];
    g.position.set(p.x, p.y, p.z);
    g.userData = { id: m.id, core, halo, radius: r };
    scene.add(g);
    bodies[m.id] = g;

    if (m.findings.length) {
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(r * 2.1, 0.035, 6, 24),
        new THREE.MeshBasicMaterial({ color: COLORS.hazard })
      );
      torus.rotation.x = Math.PI / 2;
      g.add(torus);
      rings[m.id] = torus;
    }

    const lab = document.createElement("div");
    lab.className = "label3d";
    lab.textContent = m.name;
    lab.dataset.id = m.id;
    labelRoot.appendChild(lab);
  });

  const laneMat = new THREE.LineBasicMaterial({ color: 0x3a4b5c, transparent: true, opacity: 0.55 });
  const laneSet = [];
  modules.forEach((m) => {
    m.dependsOn.forEach((dep) => {
      if (!pos[dep]) return;
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(pos[m.id].x, pos[m.id].y, pos[m.id].z),
        new THREE.Vector3(pos[dep].x, pos[dep].y, pos[dep].z),
      ]);
      const line = new THREE.Line(geo, laneMat.clone());
      line.userData = { from: m.id, to: dep };
      scene.add(line);
      laneSet.push(line);
    });
  });

  const pulse = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0x4fd6ff, transparent: true, opacity: 0, wireframe: true })
  );
  pulse.visible = false;
  scene.add(pulse);

  const tracer = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x4fd6ff, transparent: true, opacity: 0.95 })
  );
  tracer.visible = false;
  scene.add(tracer);

  const lookRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.04, 6, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
  );
  lookRing.rotation.x = Math.PI / 2;
  lookRing.visible = false;
  scene.add(lookRing);

  let selectedId = null;
  let stagedFinding = null;
  let lastScan = null;
  let riskAccepted = false;
  let riskNote = "";
  let scanBusy = false;
  let reveal = null;
  let tour = null;
  const urlParams = new URLSearchParams(location.search);
  const loopPass = urlParams.get("loop") === "1" ? urlParams.get("pass") || "1" : "";
  if (loopPass) document.body.classList.add("loop-mode");

  function isSafePatch() {
    if (new URLSearchParams(location.search).get("safe") === "1") return true;
    try {
      const patch = JSON.parse(sessionStorage.getItem("orbit-approved-patch") || "null");
      return !!(patch && patch.safe);
    } catch (e) {
      return false;
    }
  }

  const els = {
    title: document.getElementById("mod-title"),
    paths: document.getElementById("mod-paths"),
    hazard: document.getElementById("hazard-box"),
    sev: document.getElementById("finding-sev"),
    desc: document.getElementById("finding-desc"),
    patch: document.getElementById("patch"),
    run: document.getElementById("run-bfs"),
    accept: document.getElementById("accept-risk"),
    apply: document.getElementById("apply"),
    hint: document.getElementById("apply-hint"),
    readout: document.getElementById("readout"),
    origin: document.getElementById("ro-origin"),
    red: document.getElementById("ro-red"),
    amber: document.getElementById("ro-amber"),
    dim: document.getElementById("ro-dim"),
    list: document.getElementById("ro-list"),
    tick: document.getElementById("tick"),
    tickState: document.getElementById("tick-state"),
    codeStage: document.getElementById("code-stage"),
    codeMod: document.getElementById("code-mod"),
    codeTabs: document.getElementById("code-tabs"),
    codeBody: document.getElementById("code-body"),
    thoughts: document.getElementById("scan-thoughts"),
    thoughtsNode: document.getElementById("scan-thoughts-node"),
    thoughtsText: document.getElementById("scan-thoughts-text"),
    hopStep: document.getElementById("hop-step"),
    hopWhy: document.getElementById("hop-why"),
    hudCode: document.getElementById("hud-code"),
    agentLog: document.getElementById("agent-log"),
    riskModal: document.getElementById("risk-modal"),
    riskNote: document.getElementById("risk-note"),
    prModal: document.getElementById("pr-modal"),
    prId: document.getElementById("pr-id"),
    prBody: document.getElementById("pr-body"),
  };

  function colorFor(severity) {
    if (severity === "red") return COLORS.red;
    if (severity === "amber") return COLORS.amber;
    if (severity === "origin") return COLORS.origin;
    return COLORS.slate;
  }

  function tint(b, col, halo) {
    b.userData.core.material.color.setHex(col);
    if (b.userData.core.material.emissive) {
      b.userData.core.material.emissive.setHex(col);
      b.userData.core.material.emissiveIntensity = 0.5;
    }
    b.userData.halo.material.color.setHex(col);
    b.userData.halo.material.opacity = halo;
  }

  function paintIdle() {
    modules.forEach((m) => {
      const b = bodies[m.id];
      tint(b, COLORS.cyan, selectedId === m.id ? 0.28 : 0.12);
    });
    laneSet.forEach((l) => {
      l.material.color.setHex(0x3a4b5c);
      l.material.opacity = 0.45;
    });
  }

  function thoughtFor(id, severity) {
    const m = OrbitData.BY_ID[id];
    const name = m ? m.name : id;
    if (severity === "origin") {
      return tour && tour.safe
        ? "Still on " + name + ". lookup(id) is unchanged for callers; the bind stays inside this module."
        : "Still on " + name + " after 5s. The $1 bind is staged — tracing who still treats lookup as a concatenated SQL string.";
    }
    if (tour && tour.safe) {
      return name + " still calls lookup(id). Same contract, so GraphDev does not flag a break.";
    }
    if (severity === "red") {
      return name + " calls this lookup directly. Flagging will-break: callers may still wrap the old string SQL.";
    }
    return name + " is one hop further. Needs review of the response shape, not an immediate rewrite.";
  }

  function setHopDesc(step, why) {
    if (els.hopStep) els.hopStep.textContent = step;
    if (els.hopWhy) els.hopWhy.textContent = why || "";
  }

  function hideThoughts() {
    if (els.thoughts) els.thoughts.classList.add("hidden");
  }

  function showThoughts(id, text) {
    setHopDesc("Holding on " + id + " (>5s)", text);
  }

  function paintLive() {
    if (!tour) return;
    modules.forEach((m) => {
      const flagged = tour.revealed[m.id];
      const looking = tour.lookingId === m.id;
      let col = COLORS.cyan;
      let glow = 0.32;
      let halo = 0.12;
      if (looking) {
        col = COLORS.origin;
        glow = 1.05;
        halo = 0.42;
      } else if (flagged === "red") {
        col = COLORS.red;
        glow = 0.8;
        halo = 0.28;
      } else if (flagged === "amber") {
        col = COLORS.amber;
        glow = 0.7;
        halo = 0.24;
      } else if (flagged === "ok") {
        col = 0x9dffb0;
        glow = 0.75;
        halo = 0.26;
      } else if (flagged === "origin") {
        col = COLORS.cyan;
        glow = 0.85;
        halo = 0.28;
      }
      const b = bodies[m.id];
      tint(b, col, halo);
      const lab = labelRoot.querySelector('[data-id="' + m.id + '"]');
      lab.className =
        "label3d " +
        (looking
          ? "origin"
          : flagged === "red"
            ? "red"
            : flagged === "amber"
              ? "amber"
              : flagged === "ok"
                ? "ok"
                : "");
    });
    laneSet.forEach((l) => {
      const a = l.userData.from;
      const b = l.userData.to;
      const beamHere =
        tour.phase === "beam" &&
        ((tour.beamFrom === a && tour.beamTo === b) || (tour.beamFrom === b && tour.beamTo === a));
      const fa = tour.revealed[a];
      const tb = tour.revealed[b];
      if (beamHere) {
        l.material.color.setHex(COLORS.origin);
        l.material.opacity = 0.95;
      } else if (fa === "ok" || tb === "ok") {
        l.material.color.setHex(0x9dffb0);
        l.material.opacity = 0.8;
      } else if (fa === "red" || tb === "red") {
        l.material.color.setHex(COLORS.red);
        l.material.opacity = 0.85;
      } else if (fa === "amber" || tb === "amber") {
        l.material.color.setHex(COLORS.amber);
        l.material.opacity = 0.7;
      } else {
        l.material.color.setHex(0x4a6a7c);
        l.material.opacity = 0.4;
      }
    });
  }

  function paintScan(result, unlocked) {
    const map = {};
    result.affected.forEach((a) => {
      map[a.moduleId] = a;
    });
    modules.forEach((m) => {
      const a = map[m.id];
      let col = COLORS.cyan;
      let glow = 0.3;
      if (a.severity === "origin") {
        col = COLORS.origin;
        glow = 0.85;
      } else if (a.severity === "red" && unlocked.red) {
        col = COLORS.red;
        glow = 0.8;
      } else if (a.severity === "amber" && unlocked.amber) {
        col = COLORS.amber;
        glow = 0.72;
      }
      const b = bodies[m.id];
      tint(b, col, glow > 0.5 ? 0.25 : 0.12);
      const lab = labelRoot.querySelector('[data-id="' + m.id + '"]');
      lab.className =
        "label3d " +
        (a.severity === "red" && unlocked.red
          ? "red"
          : a.severity === "amber" && unlocked.amber
            ? "amber"
            : "");
    });
    laneSet.forEach((l) => {
      const fa = map[l.userData.from];
      const ta = map[l.userData.to];
      const hot = (fa && fa.severity === "red") || (ta && ta.severity === "red");
      const warm = (fa && fa.severity === "amber") || (ta && ta.severity === "amber");
      if (hot && unlocked.red) {
        l.material.color.setHex(COLORS.red);
        l.material.opacity = 0.9;
      } else if (warm && unlocked.amber) {
        l.material.color.setHex(COLORS.amber);
        l.material.opacity = 0.7;
      } else {
        l.material.color.setHex(0x4a6a7c);
        l.material.opacity = 0.4;
      }
    });
  }

  function selectModule(id, finding) {
    selectedId = id;
    lastScan = null;
    riskAccepted = false;
    riskNote = "";
    stagedFinding = finding || null;
    const m = OrbitData.BY_ID[id];
    if (!m) return;
    els.title.textContent = m.name;
    els.paths.textContent = m.filePath.join(" · ");
    els.run.disabled = false;
    els.accept.disabled = true;
    els.apply.disabled = true;
    if (finding) {
      els.hazard.classList.remove("hidden");
      els.sev.textContent = finding.severity + " · " + finding.id + " · staged patch";
      els.sev.className = "sev " + finding.severity;
      els.desc.textContent = finding.description;
      els.patch.textContent = finding.suggestedFix;
      OrbitData.setFinding(finding.id, { status: "fix-drafted" });
      els.tick.textContent = "PATCH STAGED FROM SECURITY · " + finding.id;
      els.tickState.textContent = "STAGED";
    } else {
      const fid = m.findings[0];
      const f = fid && OrbitData.FINDINGS.find((x) => x.id === fid);
      if (f) {
        els.hazard.classList.remove("hidden");
        els.sev.textContent = "hazard marker · " + f.id;
        els.sev.className = "sev " + f.severity;
        els.desc.textContent = f.description;
        els.patch.textContent = f.suggestedFix;
        stagedFinding = f;
      } else {
        els.hazard.classList.add("hidden");
      }
      els.tick.textContent = "BODY SELECTED · " + m.name;
      els.tickState.textContent = "LOCK";
    }
    paintIdle();
    els.hint.textContent = "Scan treats this change as BFS origin. Apply stays locked until then.";
    showModuleCode(m);
  }

  function showModuleCode(m) {
    const sources = Object.assign({}, OrbitData.SOURCES || {});
    try {
      const patch = JSON.parse(sessionStorage.getItem("orbit-approved-patch") || "null");
      const wantPatched = new URLSearchParams(location.search).get("patched") === "1";
      if (wantPatched && patch && patch.file && patch.patchedFile) {
        sources[patch.file] = patch.patchedFile;
        if (els.tick && !tour) els.tick.textContent = "SIMULATING APPROVED PATCH · " + patch.file;
      }
    } catch (e) {}
    const files = (m.filePath || []).map((p) => ({ path: p, body: sources[p] || "// not in catalog" }));
    if (!files.length) return;
    if (els.codeStage) els.codeStage.classList.add("hidden");
    if (els.hudCode) {
      els.hudCode.classList.remove("hidden");
      els.hudCode.textContent = files[0].path + "\n\n" + files[0].body;
    }
  }

  if (document.getElementById("code-close")) {
    document.getElementById("code-close").addEventListener("click", function () {
      els.codeStage.classList.add("hidden");
    });
  }

  function updateApplyLock() {
    if (!lastScan) {
      els.apply.disabled = true;
      els.accept.disabled = true;
      return;
    }
    const c = OrbitGraph.counts(lastScan);
    els.accept.disabled = !c.flagged || riskAccepted;
    const ok = !c.flagged || riskAccepted;
    els.apply.disabled = !ok;
    if (!c.flagged) {
      if (stagedFinding) OrbitData.setFinding(stagedFinding.id, { status: "verified-safe" });
      els.hint.textContent = "Looks safe. You can change the code (opens a draft only).";
    } else if (riskAccepted) {
      els.hint.textContent = "You accepted the remaining risk.";
    } else {
      els.hint.textContent = "Red files would break. Wait for a better fix, or change anyway.";
    }
  }

  function runScan() {
    if (!selectedId || scanBusy) return;
    scanBusy = true;
    els.run.disabled = true;
    els.apply.disabled = true;
    els.readout.classList.add("hidden");
    hideThoughts();
    const safe = isSafePatch();
    const raw = OrbitGraph.blastRadius(selectedId, modules);
    const hops = OrbitGraph.impactWalk(selectedId, modules);
    const result = safe
      ? {
          originModuleId: raw.originModuleId,
          timestamp: raw.timestamp,
          affected: raw.affected.map(function (a) {
            if (a.severity === "origin") return a;
            return { moduleId: a.moduleId, distance: a.distance, severity: "dim" };
          }),
        }
      : raw;
    lastScan = result;
    riskAccepted = false;
    tour = {
      result: result,
      hops: hops,
      hopIndex: -1,
      revealed: {},
      phase: "look",
      lookingId: selectedId,
      lookStart: performance.now(),
      thoughtShown: false,
      beamFrom: null,
      beamTo: null,
      beamStart: 0,
      safe: safe,
    };
    tour.revealed[selectedId] = "origin";
    reveal = null;
    tracer.visible = false;
    const origin = bodies[selectedId];
    pulse.position.copy(origin.position);
    pulse.visible = true;
    pulse.scale.set(1, 1, 1);
    pulse.material.opacity = 0.45;
    lookRing.position.copy(origin.position);
    lookRing.scale.setScalar(Math.max(origin.userData.radius, 1.2));
    lookRing.visible = true;
    els.tick.textContent = "LIVE TRACK · " + selectedId.toUpperCase();
    els.tickState.textContent = "LOOK";
    setHopDesc(
      "Checking " + selectedId,
      safe ? "Seeing who uses this file. Should stay green." : "Seeing who uses this file."
    );
    paintLive();
  }

  function finishReveal(result) {
    scanBusy = false;
    els.run.disabled = false;
    pulse.visible = false;
    tracer.visible = false;
    lookRing.visible = false;
    tour = null;
    hideThoughts();
    const unlocked = { red: true, amber: true };
    paintScan(result, unlocked);
    const c = OrbitGraph.counts(result);
    const reds = result.affected.filter((a) => a.severity === "red").map((a) => a.moduleId);
    const ambers = result.affected.filter((a) => a.severity === "amber").map((a) => a.moduleId);
    const dims = result.affected.filter((a) => a.severity === "dim").length;
    els.readout.classList.remove("hidden");
    els.origin.textContent = result.originModuleId;
    els.red.textContent = String(c.red) + (reds.length ? " · " + reds.join(", ") : "");
    els.amber.textContent = String(c.amber) + (ambers.length ? " · " + ambers.join(", ") : "");
    els.dim.textContent = String(dims);
    els.list.textContent = c.flagged
      ? "Red = this change would break that file."
      : "Looks safe. Nothing else would break.";
    els.tick.textContent = c.flagged ? "WOULD BREAK" : "LOOKS SAFE";
    els.tickState.textContent = "DONE";
    setHopDesc("Check done", c.flagged ? "Two files would break." : "No breaks.");
    updateApplyLock();
    reveal = null;
    if (loopPass === "1") {
      if (window.SqlLoop) SqlLoop.afterGraphFail();
      return;
    }
    if (loopPass === "2") {
      if (window.SqlLoop) SqlLoop.afterGraphOk();
      return;
    }
    writePushSummary(result, reds, ambers, c);
    offerCompatRewrite(c);
  }

  function offerCompatRewrite(c) {
    if (!c.flagged || isSafePatch() || !window.CrewUI) return;
    try {
      sessionStorage.setItem("orbit-next-step", "sql-compat");
    } catch (e) {}
    CrewUI.toast({
      bot: "Security",
      wants: "rewrite the SQL so GraphDev callers do not implode",
      detail: "Second pass keeps lookup(id) and the same row shape. Bind stays inside user-service.",
      onAllow: function () {
        try {
          sessionStorage.removeItem("orbit-next-step");
        } catch (e) {}
        location.href = "security.html?compat=1";
      },
    });
  }

  function fallbackPushSummary(origin, reds, ambers, flagged) {
    const redList = reds.length ? reds.join(", ") : "none";
    const amberList = ambers.length ? ambers.join(", ") : "none";
    if (!flagged) {
      return (
        "If you Change the code on this graph-safe rewrite, GraphDev sees callers still using lookup(id). Bound SQL stays inside " +
        origin +
        ". Change the code opens a pull request only — nothing merges or deploys until a human reviews it."
      );
    }
    return (
      "If you Change the code on this first lookup patch, GraphDev expects breakage in the direct callers: " +
      redList +
      ". Those modules still treat user lookup as string SQL. Change nonetheless would push anyway with a risk note. The cleaner next step is Security rewriting lookup so the contract holds and the graph stays green. One hop further: " +
      amberList +
      ". Nothing merges until you sign off."
    );
  }

  function writePushSummary(result, reds, ambers, c) {
    const origin = result.originModuleId;
    const fallback = fallbackPushSummary(origin, reds, ambers, c.flagged);
    setHopDesc("Writing push summary…", "GraphDev is briefing Mission Control on what Apply would actually do.");
    const prompt =
      "Write a short Mission Control briefing in plain prose (no markdown, no bullets). Explain what happens IF the human Applies this staged patch. Origin module: " +
      origin +
      ". Will-break (direct dependents): " +
      (reds.join(", ") || "none") +
      ". Needs review (one hop): " +
      (ambers.join(", ") || "none") +
      ". Explain Change the code vs Change nonetheless. If callers would break, tell them to send Security a graph-safe rewrite that keeps lookup(id). 4-6 sentences.";
    function save(text) {
      const clean = OrbitAgent.plainText ? OrbitAgent.plainText(text) : text;
      try {
        sessionStorage.setItem("orbit-push-summary", clean);
      } catch (e) {}
      setHopDesc("Push summary ready", clean);
      const box = document.getElementById("agent-prompt");
      if (box) {
        box.value = clean;
        box.dataset.reply = "1";
      }
    }
    if (!window.OrbitAgent || !OrbitAgent.runAgent) {
      save(fallback);
      return;
    }
    OrbitAgent.runAgent("graphdev", prompt, {
      phase: "summarize-push",
      originModuleId: origin,
      willBreak: reds,
      needsReview: ambers,
    })
      .then(function (data) {
        save(data.output || fallback);
      })
      .catch(function () {
        save(fallback);
      });
  }

  els.run.addEventListener("click", runScan);

  els.accept.addEventListener("click", function () {
    els.riskModal.classList.remove("hidden");
  });
  document.getElementById("risk-cancel").addEventListener("click", function () {
    els.riskModal.classList.add("hidden");
  });
  document.getElementById("risk-ok").addEventListener("click", function () {
    const note = els.riskNote.value.trim();
    if (!note) return;
    riskAccepted = true;
    riskNote = note;
    els.riskModal.classList.add("hidden");
    updateApplyLock();
    els.apply.disabled = false;
    els.apply.click();
  });

  els.apply.addEventListener("click", function () {
    if (els.apply.disabled || !lastScan) return;
    const c = OrbitGraph.counts(lastScan);
    const prId = "PR-" + (1800 + OrbitData.loadPrs().length + 1);
    const finding = stagedFinding;
    const body = [
      "SIMULATED PULL REQUEST — no git remote called",
      "Finding: " + (finding ? finding.id : "exploratory"),
      "Origin: " + lastScan.originModuleId,
      "Will break: " + c.red,
      "Needs review: " + c.amber,
      riskNote ? "Risk accepted: " + riskNote : "Risk: none (clean scan)",
      "",
      finding ? finding.suggestedFix : "(no staged diff — exploratory apply blocked)",
    ].join("\n");
    if (!finding) {
      els.hint.textContent = "Change the code needs a staged Security patch in this demo.";
      return;
    }
    OrbitData.savePr({ id: prId, findingId: finding.id, body, at: Date.now() });
    OrbitData.setFinding(finding.id, { status: "pr-opened", prId, riskNote: riskNote || null });
    els.prId.textContent = prId + " · human review required · merge disabled";
    els.prBody.textContent = body;
    els.prModal.classList.remove("hidden");
    document.getElementById("pr-back").href = "security.html?restored=1";
    els.tick.textContent = "PR OPENED · MERGE IS OFF";
    els.tickState.textContent = "REVIEW";
  });

  document.getElementById("pr-close").addEventListener("click", function () {
    els.prModal.classList.add("hidden");
  });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  renderer.domElement.addEventListener("pointerdown", function (ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(
      Object.values(bodies).map((b) => b.userData.core)
    );
    if (hits.length) {
      const id = hits[0].object.parent.userData.id;
      selectModule(id, null);
    }
  });

  function fit() {
    const { w, h } = viewSize();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener("resize", fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(mount);

  const v = new THREE.Vector3();
  function projectLabels() {
    modules.forEach((m) => {
      const lab = labelRoot.querySelector('[data-id="' + m.id + '"]');
      v.copy(bodies[m.id].position).project(camera);
      const { w, h } = viewSize();
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      lab.style.left = x + "px";
      lab.style.top = y + "px";
      lab.style.display = v.z > 1 ? "none" : "block";
    });
  }

  function animate(now) {
    requestAnimationFrame(animate);
    controls.update();
    Object.keys(rings).forEach((id) => {
      rings[id].rotation.z = now * 0.001;
      rings[id].scale.setScalar(1 + Math.sin(now * 0.004) * 0.06);
    });
    if (tour) {
      const looking = bodies[tour.lookingId];
      if (looking && controls.target) controls.target.lerp(looking.position, 0.045);
      lookRing.rotation.z = now * 0.003;
      if (looking) {
        lookRing.position.copy(looking.position);
        pulse.position.copy(looking.position);
        pulse.scale.setScalar(1 + Math.sin(now * 0.006) * 0.15);
      }
      if (tour.phase === "look") {
        const dt = now - tour.lookStart;
        const hop = tour.hopIndex >= 0 ? tour.hops[tour.hopIndex] : null;
        const sev = hop ? hop.severity : "origin";
        if (!loopPass && !tour.thoughtShown && dt > 5000) {
          tour.thoughtShown = true;
          showThoughts(tour.lookingId, thoughtFor(tour.lookingId, sev));
        }
        const dwell = loopPass
          ? hop
            ? 480
            : 640
          : tour.safe
            ? hop
              ? 1200
              : 2000
            : hop
              ? hop.to === "api-gateway"
                ? 5600
                : 1400
              : 5400;
        if (dt > dwell) {
          const next = tour.hopIndex + 1;
          if (next >= tour.hops.length) {
            finishReveal(tour.result);
          } else {
            const nx = tour.hops[next];
            tour.hopIndex = next;
            tour.phase = "beam";
            tour.beamFrom = nx.from;
            tour.beamTo = nx.to;
            tour.beamStart = now;
            tracer.visible = true;
            lookRing.visible = false;
            hideThoughts();
            els.tick.textContent = "BEAM · " + nx.from + " → " + nx.to;
            els.tickState.textContent = "JUMP";
            setHopDesc("Next: " + nx.to, nx.severity === "red" ? "Uses this file directly." : "One step away.");
            paintLive();
          }
        }
      } else if (tour.phase === "beam") {
        const fromB = bodies[tour.beamFrom];
        const toB = bodies[tour.beamTo];
        const u = Math.min(1, (now - tour.beamStart) / 780);
        if (fromB && toB) tracer.position.lerpVectors(fromB.position, toB.position, u);
        const hop = tour.hops[tour.hopIndex];
        tracer.material.color.setHex(hop && hop.severity === "red" ? COLORS.red : COLORS.amber);
        if (controls.target && toB) controls.target.lerp(toB.position, 0.06);
        if (u >= 1) {
          if (hop) tour.revealed[hop.to] = tour.safe ? "ok" : hop.severity;
          tour.phase = "look";
          tour.lookingId = tour.beamTo;
          tour.lookStart = now;
          tour.thoughtShown = false;
          tracer.visible = false;
          lookRing.visible = true;
          const dest = bodies[tour.lookingId];
          if (dest) lookRing.scale.setScalar(Math.max(dest.userData.radius, 1.2));
          els.tick.textContent = "LOOKING · " + tour.lookingId.toUpperCase();
          els.tickState.textContent = "LOOK";
          setHopDesc(
            tour.lookingId,
            tour.safe ? "OK" : hop && hop.severity === "red" ? "Would break" : "Check this"
          );
          const destMod = OrbitData.BY_ID[tour.lookingId];
          if (destMod) showModuleCode(destMod);
          paintLive();
        }
      }
    } else if (reveal) {
      const dt = now - reveal.t0;
      pulse.scale.setScalar(1 + dt / 180);
      pulse.material.opacity = Math.max(0, 0.55 - dt / 2200);
      if (reveal.phase === "delay" && dt > 420) {
        reveal.phase = "red";
        reveal.unlocked.red = true;
        paintScan(reveal.result, reveal.unlocked);
        els.tick.textContent = "RED REVEAL · DIRECT DEPENDENTS";
      } else if (reveal.phase === "red" && dt > 980) {
        reveal.phase = "amber";
        reveal.unlocked.amber = true;
        paintScan(reveal.result, reveal.unlocked);
        els.tick.textContent = "AMBER REVEAL · ONE HOP FURTHER";
      } else if (reveal.phase === "amber" && dt > 1500) {
        finishReveal(reveal.result);
      }
    }
    projectLabels();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);

  const fid = urlParams.get("finding");
  if (fid) {
    const f = OrbitData.FINDINGS.find((x) => x.id === fid);
    if (f) {
      selectModule(f.moduleId, f);
      runScan();
    }
  } else {
    paintIdle();
  }

  OrbitAgent.bindPrompt({
    room: "graphdev",
    sendId: "agent-send",
    inputId: "agent-prompt",
    logId: "agent-log",
    statusId: "tick-state",
    intercept: function (prompt) {
      if (/sql/i.test(prompt) && window.SqlLoop) {
        SqlLoop.start();
        return true;
      }
      return false;
    },
    context: function () {
      return { selectedModuleId: selectedId };
    },
    onResult: function (data) {
      if (els.agentLog) els.agentLog.classList.remove("hidden");
      CrewUI.proposeActions(data.actions || [], {
        onScan: function (scan) {
          sessionStorage.setItem(
            "orbit-agent-scan",
            JSON.stringify({
              categories: scan.categories || [],
              findingIds: (scan.findings || []).map(function (f) {
                return f.id;
              }),
            })
          );
          location.href = "security.html?crew=1";
        },
        onGraph: function (graph) {
          if (graph.findingId) location.href = "orbit.html?finding=" + encodeURIComponent(graph.findingId);
        },
      });
    },
  });
})();
