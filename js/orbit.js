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
  scene.background = new THREE.Color(0x050709);
  const first = viewSize();
  const camera = new THREE.PerspectiveCamera(52, first.w / first.h, 0.1, 3000);
  camera.position.set(90, 130, 480);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(first.w, first.h);
  renderer.setClearColor(0x050709, 1);
  mount.appendChild(renderer.domElement);

  const controls = new OrbitCam(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 80;
  controls.maxDistance = 1400;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.5;

  const starGeo = new THREE.BufferGeometry();
  const starCount = 500;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 1600;
    starPos[i * 3 + 1] = (Math.random() - 0.5) * 1600;
    starPos[i * 3 + 2] = (Math.random() - 0.5) * 1600;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x3a4b5c, size: 1.6, opacity: 0.6, transparent: true })));

  const modules = OrbitData.MODULES;
  const pos = OrbitGraph.layoutPositions(modules);
  const bodies = {};
  const rings = {};

  function makeTextSprite(text) {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    const fontSize = 26;
    ctx.font = fontSize + "px monospace";
    const w = Math.ceil(ctx.measureText(text).width) + 24;
    c.width = w;
    c.height = fontSize + 18;
    ctx.font = fontSize + "px monospace";
    ctx.fillStyle = "rgba(220,232,240,0.85)";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 12, c.height / 2);
    const tex = new THREE.CanvasTexture(c);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(w * 0.18, c.height * 0.18, 1);
    return sprite;
  }

  modules.forEach((m) => {
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(6, 24, 24),
      new THREE.MeshBasicMaterial({ color: COLORS.cyan })
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(11.5, 24, 24),
      new THREE.MeshBasicMaterial({
        color: COLORS.cyan,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    g.add(core);
    g.add(halo);
    const p = pos[m.id];
    g.position.set(p.x, p.y, p.z);
    g.userData = { id: m.id, core: core, halo: halo, radius: 6 };
    scene.add(g);
    bodies[m.id] = g;
    const label = makeTextSprite(m.name);
    label.position.set(0, -15, 0);
    g.add(label);
  });

  const laneMat = new THREE.LineBasicMaterial({ color: 0x3a4b5c, transparent: true, opacity: 0.5 });
  const laneSet = [];
  const edgeMeshMap = {};
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
      edgeMeshMap[OrbitGraph.edgeId(m.id, dep)] = line;
      edgeMeshMap[OrbitGraph.edgeId(dep, m.id)] = line;
    });
  });

  const selectionRing = new THREE.Mesh(
    new THREE.RingGeometry(8.5, 10.2, 40),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
  );
  scene.add(selectionRing);

  let activeFlowDots = [];
  let scanTimers = [];
  let cameraFlight = null;
  let trailLines = [];

  function flowPulse(line, hex) {
    const attr = line.geometry.attributes.position;
    const start = new THREE.Vector3(attr.getX(0), attr.getY(0), attr.getZ(0));
    const end = new THREE.Vector3(attr.getX(1), attr.getY(1), attr.getZ(1));
    const dot = new THREE.Mesh(new THREE.SphereGeometry(2, 10, 10), new THREE.MeshBasicMaterial({ color: hex }));
    scene.add(dot);
    const t0 = performance.now();
    function step() {
      const t = ((performance.now() - t0) / 700) % 1;
      dot.position.lerpVectors(start, end, t);
      dot.userData.raf = requestAnimationFrame(step);
    }
    step();
    return dot;
  }

  function ping3D(originVec) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0x4fd6ff, wireframe: true, transparent: true, opacity: 0.7 })
    );
    mesh.position.copy(originVec);
    scene.add(mesh);
    const t0 = performance.now();
    function step() {
      const t = (performance.now() - t0) / 900;
      if (t >= 1) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        return;
      }
      const s = 1 + t * 48;
      mesh.scale.set(s, s, s);
      mesh.material.opacity = 0.7 * (1 - t);
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function clearFlows() {
    scanTimers.forEach(clearTimeout);
    scanTimers = [];
    activeFlowDots.forEach(function (d) {
      cancelAnimationFrame(d.userData.raf);
      scene.remove(d);
    });
    activeFlowDots = [];
  }

  let selectedId = null;
  let stagedFinding = null;
  let lastScan = null;
  let riskAccepted = false;
  let riskNote = "";
  let scanBusy = false;
  let scanDoneCb = null;
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
    if (b.userData.halo) {
      b.userData.halo.material.color.setHex(col);
      b.userData.halo.material.opacity = halo;
    }
  }

  function paintIdle() {
    modules.forEach((m) => {
      const isSelected = selectedId === m.id;
      tint(bodies[m.id], isSelected ? COLORS.origin : COLORS.cyan, isSelected ? 0.32 : 0.18);
    });
    laneSet.forEach((l) => {
      l.material.color.setHex(0x3a4b5c);
      l.material.opacity = 0.5;
    });
    if (selectedId && bodies[selectedId]) selectionRing.position.copy(bodies[selectedId].position);
  }

  function thoughtFor(id, severity) {
    const m = OrbitData.BY_ID[id];
    const name = m ? m.name : id;
    if (severity === "origin") {
      return tour && tour.safe ? name + " — rewrite stays inside this file." : "Checking who uses " + name + ".";
    }
    if (tour && tour.safe) {
      return name + " still matches. No break.";
    }
    if (severity === "red") {
      return name + " uses this file — would break.";
    }
    return name + " is nearby.";
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
      tint(b, col, glow > 0.5 ? 0.3 : 0.12);
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
    if (els.run) els.run.disabled = false;
    els.accept.disabled = true;
    els.apply.disabled = true;
    if (finding) {
      els.hazard.classList.remove("hidden");
      els.sev.textContent = finding.severity + " · " + finding.id + " · staged patch";
      els.sev.className = "sev " + finding.severity;
      els.desc.textContent = finding.description;
      els.patch.textContent =
        finding.suggestedFix ||
        (OrbitData.FIXES && OrbitData.FIXES[finding.id] && OrbitData.FIXES[finding.id].replacement) ||
        "";
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
    els.hint.textContent = "Impact runs after the fix loop. You still approve.";
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

  function runScan(done) {
    if (!selectedId || scanBusy) return;
    if (typeof done === "function") scanDoneCb = done;
    scanBusy = true;
    if (els.run) els.run.disabled = true;
    els.apply.disabled = true;
    els.readout.classList.add("hidden");
    hideThoughts();
    clearFlows();
    paintIdle();
    const safe = isSafePatch();
    const raw = OrbitGraph.blastRadius(selectedId, modules);
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
    reveal = null;
    const origin = bodies[selectedId];
    ping3D(origin.position);
    els.tick.textContent = "SCAN · " + selectedId.toUpperCase();
    els.tickState.textContent = "PING";
    setHopDesc("Checking " + selectedId, safe ? "Should stay green." : "Direct neighbors, then one hop out.");

    const dist = {};
    result.affected.forEach(function (a) {
      dist[a.moduleId] = a.severity === "origin" ? 0 : a.distance;
    });
    const redIds = [];
    const amberIds = [];
    const dimIds = [];
    modules.forEach(function (n) {
      if (n.id === selectedId) return;
      if (safe) dimIds.push(n.id);
      else if (dist[n.id] === 1) redIds.push(n.id);
      else if (dist[n.id] === 2) amberIds.push(n.id);
      else dimIds.push(n.id);
    });

    if (safe) {
      scanTimers.push(
        setTimeout(function () {
          dimIds.forEach(function (id) {
            tint(bodies[id], COLORS.slate, 0.08);
          });
          finishReveal(result);
        }, 500)
      );
      return;
    }

    scanTimers.push(
      setTimeout(function () {
        redIds.forEach(function (id) {
          tint(bodies[id], COLORS.red, 0.34);
        });
        laneSet.forEach(function (line) {
          const a = line.userData.from;
          const b = line.userData.to;
          if (Math.min(dist[a], dist[b]) === 0) {
            line.material.color.setHex(0xff4b4b);
            line.material.opacity = 0.9;
            activeFlowDots.push(flowPulse(line, 0xff4b4b));
          }
        });
      }, 450)
    );
    scanTimers.push(
      setTimeout(function () {
        amberIds.forEach(function (id) {
          tint(bodies[id], COLORS.amber, 0.3);
        });
        laneSet.forEach(function (line) {
          const a = line.userData.from;
          const b = line.userData.to;
          if (Math.min(dist[a], dist[b]) === 1) {
            line.material.color.setHex(0xffb84d);
            line.material.opacity = 0.85;
            activeFlowDots.push(flowPulse(line, 0xffb84d));
          }
        });
      }, 950)
    );
    scanTimers.push(
      setTimeout(function () {
        dimIds.forEach(function (id) {
          tint(bodies[id], COLORS.slate, 0.08);
        });
        finishReveal(result);
      }, 1300)
    );
  }

  function finishReveal(result) {
    scanBusy = false;
    if (els.run) els.run.disabled = false;
    hideThoughts();
    const unlocked = { red: true, amber: true };
    paintScan(result, unlocked);
    const c = OrbitGraph.counts(result);
    const dims = result.affected.filter((a) => a.severity === "dim").length;
    els.readout.classList.remove("hidden");
    els.origin.textContent = result.originModuleId;
    els.red.textContent = String(c.red);
    els.amber.textContent = String(c.amber);
    els.dim.textContent = String(dims);
    els.list.textContent = c.flagged ? "Red nodes would break." : "Safe to draft.";
    els.tick.textContent = c.flagged ? "WOULD BREAK" : "LOOKS SAFE";
    els.tickState.textContent = "DONE";
    setHopDesc(c.flagged ? "Would break" : "Looks safe", c.flagged ? c.red + " direct · " + c.amber + " nearby" : "No other files break.");
    updateApplyLock();
    reveal = null;
    const cb = scanDoneCb;
    scanDoneCb = null;
    if (cb) cb(result);
    if (document.body.classList.contains("fix-mode")) return;
    if (loopPass === "1") {
      if (c.flagged && window.SqlLoop) SqlLoop.afterGraphFail();
      else if (window.SqlLoop) SqlLoop.afterGraphOk();
      return;
    }
    if (loopPass === "2") {
      if (window.SqlLoop) SqlLoop.afterGraphOk();
    }
  }

  if (els.run) els.run.addEventListener("click", runScan);

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
    if (document.body.classList.contains("fix-mode")) return;
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

  function flyCameraTo(nodeId, duration) {
    const n = bodies[nodeId];
    if (!n) return;
    const nodePos = n.position.clone();
    const lookAt = nodePos.clone().multiplyScalar(0.4);
    const viewDir = new THREE.Vector3(60, 90, 340).normalize();
    const camPos = lookAt.clone().add(viewDir.multiplyScalar(480));
    cameraFlight = {
      fromPos: camera.position.clone(),
      toPos: camPos,
      fromTarget: controls.target.clone(),
      toTarget: lookAt,
      start: performance.now(),
      duration: duration || 900,
    };
  }

  function stepFlight() {
    if (!cameraFlight) return false;
    const ft = Math.min((performance.now() - cameraFlight.start) / cameraFlight.duration, 1);
    const e = ft < 0.5 ? 2 * ft * ft : 1 - Math.pow(-2 * ft + 2, 2) / 2;
    camera.position.lerpVectors(cameraFlight.fromPos, cameraFlight.toPos, e);
    controls.target.lerpVectors(cameraFlight.fromTarget, cameraFlight.toTarget, e);
    camera.lookAt(controls.target);
    if (ft >= 1) {
      cameraFlight = null;
      if (controls.syncFromCamera) controls.syncFromCamera();
    }
    return true;
  }

  function drawTrail(fromId, toId, hex) {
    const a = bodies[fromId];
    const b = bodies[toId];
    if (!a || !b) return;
    const geo = new THREE.BufferGeometry().setFromPoints([a.position.clone(), b.position.clone()]);
    const mat = new THREE.LineBasicMaterial({ color: hex, transparent: true, opacity: 0.95 });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    trailLines.push(line);
  }

  function clearTrail() {
    trailLines.forEach(function (l) {
      scene.remove(l);
      l.geometry.dispose();
      l.material.dispose();
    });
    trailLines = [];
  }

  function categoryLabel(id) {
    const cat = (OrbitData.CATEGORIES || []).find(function (c) {
      return c.id === id;
    });
    return cat ? cat.label : id;
  }

  function nextIssueLabel(finding) {
    const next = finding && OrbitData.nextOpenFinding ? OrbitData.nextOpenFinding(finding.id) : null;
    if (!next) return { next: null, text: "All issues in this scan are done." };
    return {
      next: next,
      text: "Next: " + categoryLabel(next.attackCategory) + " — " + next.moduleId,
    };
  }

  function closeAppliedModal() {
    const modal = document.getElementById("applied-modal");
    if (modal) modal.classList.remove("active");
  }

  function startFixFor(finding) {
    closeAppliedModal();
    if (!finding) return;
    try {
      sessionStorage.setItem("orbit-loop-finding", finding.id);
    } catch (e) {}
    stagedFinding = finding;
    selectModule(finding.moduleId, finding);
    if (history.replaceState) {
      history.replaceState({}, "", "orbit.html?finding=" + encodeURIComponent(finding.id) + "&fix=1");
    }
    if (window.FixExplorer) FixExplorer.open(finding.moduleId, finding);
  }

  function showFollowup(opts) {
    const modal = document.getElementById("applied-modal");
    if (!modal) return;
    const approved = !!opts.approved;
    const finding = opts.finding;
    const info = nextIssueLabel(finding);
    const banner = document.getElementById("applied-banner");
    const title = document.getElementById("applied-title");
    const nextEl = document.getElementById("applied-next");
    const pathEl = document.getElementById("applied-path");
    const body = document.getElementById("applied-body");
    const scroll = document.getElementById("applied-scroll");
    const nextBtn = document.getElementById("applied-next-btn");
    pathEl.textContent = (opts.moduleId || finding.moduleId) + "  ·  " + (opts.file || "");
    banner.classList.toggle("skipped", !approved);
    title.textContent = approved ? "Fix applied and saved" : "Fix not approved";
    nextEl.textContent = info.text;
    if (approved && opts.code) {
      scroll.style.display = "block";
      body.textContent = opts.code;
    } else {
      scroll.style.display = approved ? "block" : "none";
      body.textContent = opts.code || "";
    }
    nextBtn.style.display = info.next ? "block" : "none";
    nextBtn.onclick = function () {
      startFixFor(info.next);
    };
    modal.classList.add("active");
  }

  function silentDraft(finding, fix) {
    if (!finding) return;
    stagedFinding = finding;
    const prId = "PR-" + (1800 + OrbitData.loadPrs().length + 1);
    OrbitData.savePr({
      id: prId,
      findingId: finding.id,
      body: (fix && (fix.replacement || fix.patchedFile)) || "",
      at: Date.now(),
    });
    OrbitData.setFinding(finding.id, { status: "pr-opened", prId: prId });
    els.tick.textContent = "PR OPENED · MERGE IS OFF";
    els.tickState.textContent = "REVIEW";
  }

  function showVerifiedFix(moduleId, finding, adopted) {
    const catalog =
      (finding && OrbitData.FIXES && (OrbitData.FIXES[finding.id] || OrbitData.FIXES[finding.id + "-SAFE"])) ||
      {};
    const mod = OrbitData.BY_ID[moduleId];
    const file = catalog.file || (mod && mod.filePath && mod.filePath[0]) || moduleId;
    const sources = OrbitData.SOURCES || {};
    const flagged = catalog.flagged || sources[file] || (finding && finding.description) || "";
    const replacement =
      (adopted && adopted.patch) || catalog.replacement || catalog.patchedFile || "";
    const payload = {
      title: (finding && finding.title) || catalog.title || "Verified fix",
      file: file,
      why: catalog.why || "Verified against the graph and tests. Approve opens a draft only.",
      flagged: flagged,
      replacement: replacement,
      patchedFile: (adopted && adopted.patch) || catalog.patchedFile || replacement,
      findingId: finding && finding.id,
      moduleId: moduleId,
      safe: true,
    };
    if (!window.CrewUI || !CrewUI.showFixReview) return;
    CrewUI.showFixReview(payload, {
      final: true,
      onApprove: function (fix) {
        try {
          sessionStorage.setItem("orbit-approved-patch", JSON.stringify(fix));
        } catch (e) {}
        silentDraft(finding, fix);
        showFollowup({
          approved: true,
          finding: finding,
          moduleId: moduleId,
          file: file,
          code: replacement,
        });
      },
      onDeny: function () {
        if (finding) OrbitData.setFinding(finding.id, { status: "skipped" });
        showFollowup({
          approved: false,
          finding: finding,
          moduleId: moduleId,
          file: file,
          code: "",
        });
      },
    });
  }

  const appliedClose = document.getElementById("applied-close");
  const appliedLobby = document.getElementById("applied-lobby");
  if (appliedClose) appliedClose.addEventListener("click", closeAppliedModal);
  if (appliedLobby) {
    appliedLobby.addEventListener("click", function () {
      location.href = "index.html";
    });
  }

  window.OrbitViz = {
    flyCameraTo: flyCameraTo,
    ping: function (id) {
      if (bodies[id]) ping3D(bodies[id].position);
    },
    setNodeColor: function (id, hex, opacity) {
      if (bodies[id]) tint(bodies[id], hex, opacity);
    },
    drawTrail: drawTrail,
    clearTrail: clearTrail,
    setControlsEnabled: function (on) {
      controls.enabled = !!on;
      if (on) controls.autoRotate = false;
    },
    resize: fit,
    showVerifiedFix: showVerifiedFix,
    runScan: runScan,
  };

  function animate(now) {
    requestAnimationFrame(animate);
    if (!stepFlight()) controls.update();
    if (selectedId && bodies[selectedId]) {
      selectionRing.position.copy(bodies[selectedId].position);
      selectionRing.lookAt(camera.position);
    }
    const t = now * 0.002;
    modules.forEach(function (n) {
      const s = 1 + Math.sin(t + n.x * 0.01) * 0.08;
      if (bodies[n.id] && bodies[n.id].userData.halo) bodies[n.id].userData.halo.scale.set(s, s, s);
    });
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);

  const fid = urlParams.get("finding");
  if (fid) {
    const f = OrbitData.FINDINGS.find((x) => x.id === fid);
    if (f) {
      selectModule(f.moduleId, f);
      if (urlParams.get("fix") === "1" && window.FixExplorer) {
        FixExplorer.open(f.moduleId, f);
      } else {
        runScan();
      }
    }
  } else {
    selectModule("task-service", null);
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
