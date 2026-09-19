(function () {
  const CREW = [
    {
      id: "graphdev",
      name: "GraphDev",
      status: "MAPPING",
      blurb: "See what a change would break.",
      tone: "map",
      color: 0x7c6cff,
      x: 16,
      z: 6,
      size: 1.45,
      href: "orbit.html",
    },
    {
      id: "security",
      name: "Security",
      status: "INBOUND",
      blurb: "Find issues in the code.",
      tone: "in",
      color: 0xff5a6a,
      x: 11,
      z: -14,
      size: 1.4,
      href: "security.html",
    },
    {
      id: "tbd-a",
      name: "Open slot",
      status: "UNASSIGNED",
      blurb: "Reserved for a future agent.",
      tone: "ghost",
      color: 0x5a6a7a,
      x: -13,
      z: -12,
      size: 0.7,
      href: null,
      ghost: true,
    },
    {
      id: "tbd-b",
      name: "Open slot",
      status: "UNASSIGNED",
      blurb: "Reserved for a future agent.",
      tone: "ghost",
      color: 0x5a6a7a,
      x: 2,
      z: 18,
      size: 0.7,
      href: null,
      ghost: true,
    },
  ];

  const mount = document.getElementById("scene");
  const labelRoot = document.getElementById("labels");
  const launch = document.getElementById("launch");
  const tick = document.getElementById("tick-state");

  function viewSize() {
    return { w: mount.clientWidth || innerWidth, h: mount.clientHeight || innerHeight };
  }

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x070b14, 0.012);
  const first = viewSize();
  const camera = new THREE.PerspectiveCamera(42, first.w / first.h, 0.1, 400);
  camera.position.set(0, 48, 36);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(first.w, first.h);
  renderer.setClearColor(0x070b14, 1);
  mount.appendChild(renderer.domElement);

  const controls = new OrbitCam(camera, renderer.domElement);
  controls.minDistance = 22;
  controls.maxDistance = 90;

  const starGeo = new THREE.BufferGeometry();
  const n = 1400;
  const starPos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 260;
    starPos[i * 3 + 1] = (Math.random() - 0.5) * 120;
    starPos[i * 3 + 2] = (Math.random() - 0.5) * 260;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  scene.add(
    new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xb7c8ff, size: 0.28, opacity: 0.45, transparent: true })
    )
  );

  scene.add(new THREE.AmbientLight(0x6a7390, 0.55));
  const sunLight = new THREE.PointLight(0xffc14a, 2.0, 120);
  scene.add(sunLight);
  const rim = new THREE.DirectionalLight(0x4fd6ff, 0.35);
  rim.position.set(-20, 30, 10);
  scene.add(rim);

  function ringLine(radius) {
    const pts = [];
    for (let i = 0; i <= 96; i++) {
      const t = (i / 96) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(t) * radius, 0.02, Math.sin(t) * radius));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: 0x4a6080,
      transparent: true,
      opacity: 0.28,
    });
    scene.add(new THREE.Line(geo, mat));
  }
  ringLine(10);
  ringLine(18);
  ringLine(26);

  const user = new THREE.Group();
  const userCore = new THREE.Mesh(
    new THREE.SphereGeometry(2.4, 40, 40),
    new THREE.MeshStandardMaterial({
      color: 0xffb43a,
      emissive: 0xff8a1a,
      emissiveIntensity: 0.85,
      roughness: 0.35,
      metalness: 0.15,
    })
  );
  const userHalo = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 28, 28),
    new THREE.MeshBasicMaterial({
      color: 0xffc14a,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const userRing = new THREE.Mesh(
    new THREE.TorusGeometry(3.6, 0.05, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0xffb43a, transparent: true, opacity: 0.7 })
  );
  userRing.rotation.x = Math.PI / 2;
  user.add(userCore);
  user.add(userHalo);
  user.add(userRing);
  scene.add(user);

  const userLab = document.createElement("button");
  userLab.type = "button";
  userLab.className = "lobby-node core";
  userLab.innerHTML = '<span class="dot"></span><span class="cap">YOU</span><strong>User</strong><em>Human in the loop</em>';
  labelRoot.appendChild(userLab);

  const lanes = [];
  const planets = [];

  function addDashed(from, to, color, ghost) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineDashedMaterial({
      color: color,
      dashSize: ghost ? 0.55 : 0.9,
      gapSize: ghost ? 0.7 : 0.75,
      transparent: true,
      opacity: ghost ? 0.35 : 0.95,
    });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    scene.add(line);
    lanes.push({ line: line, mat: mat, speed: ghost ? 0.04 : 0.11 });
  }

  const origin = new THREE.Vector3(0, 0.15, 0);
  CREW.forEach(function (c) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(c.size, 28, 28),
      new THREE.MeshStandardMaterial({
        color: c.color,
        emissive: c.color,
        emissiveIntensity: c.ghost ? 0.1 : 0.55,
        roughness: 0.4,
        metalness: 0.2,
        transparent: !!c.ghost,
        opacity: c.ghost ? 0.4 : 1,
      })
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(c.size * 1.45, 16, 16),
      new THREE.MeshBasicMaterial({
        color: c.color,
        transparent: true,
        opacity: c.ghost ? 0.06 : 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    g.add(core);
    g.add(halo);
    g.position.set(c.x, 0.35, c.z);
    g.userData = { crew: c, core: core, halo: halo };
    scene.add(g);
    addDashed(origin, g.position.clone().setY(0.15), c.color, !!c.ghost);

    const lab = document.createElement("button");
    lab.type = "button";
    lab.className = "lobby-node " + c.tone;
    lab.dataset.id = c.id;
    lab.innerHTML =
      '<span class="dot"></span><span class="cap">' +
      c.status +
      "</span><strong>" +
      c.name +
      "</strong><em>" +
      c.blurb +
      "</em>";
    lab.addEventListener("click", function (ev) {
      ev.stopPropagation();
      select(c);
      if (c.href) location.href = c.href;
    });
    labelRoot.appendChild(lab);
    planets.push({ crew: c, group: g, lab: lab });
  });

  let selected = CREW[0];
  function select(crew) {
    selected = crew;
    tick.textContent = crew.status;
    launch.disabled = !crew.href;
    launch.textContent = crew.href ? "Enter " + crew.name : "Slot unassigned";
    planets.forEach(function (p) {
      p.lab.classList.toggle("selected", p.crew.id === crew.id);
    });
  }
  select(selected);

  launch.addEventListener("click", function () {
    if (selected && selected.href) location.href = selected.href;
  });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down = null;
  renderer.domElement.addEventListener("pointerdown", function (e) {
    down = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener("pointerup", function (e) {
    if (!down) return;
    const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (dist > 7) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(planets.map(function (p) { return p.group.userData.core; }));
    if (!hits.length) return;
    const crew = hits[0].object.parent.userData.crew;
    select(crew);
    if (crew.href) location.href = crew.href;
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
  function placeLabel(el, world, below) {
    v.copy(world).project(camera);
    const { w, h } = viewSize();
    let x = (v.x * 0.5 + 0.5) * w;
    let y = (-v.y * 0.5 + 0.5) * h;
    if (below) y += 22;
    else {
      const dx = x - w * 0.5;
      const dy = y - h * 0.48;
      const len = Math.hypot(dx, dy) || 1;
      x += (dx / len) * 28;
      y += (dy / len) * 26;
    }
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.display = v.z > 1 ? "none" : "block";
  }

  const t0 = performance.now();
  const clockEl = document.getElementById("clock");
  function animate(now) {
    requestAnimationFrame(animate);
    controls.update();
    const sec = Math.floor((now - t0) / 1000);
    clockEl.textContent =
      "T+" + String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
    userHalo.scale.setScalar(1 + Math.sin(now * 0.002) * 0.04);
    userRing.rotation.z = now * 0.0004;
    lanes.forEach(function (l) {
      l.mat.dashOffset -= l.speed;
    });
    planets.forEach(function (p) {
      placeLabel(p.lab, p.group.position.clone().add(new THREE.Vector3(0, p.crew.size + 0.35, 0)));
      const hot = selected && selected.id === p.crew.id;
      p.group.userData.halo.material.opacity = p.crew.ghost ? 0.06 : hot ? 0.32 : 0.16;
    });
    placeLabel(userLab, new THREE.Vector3(0, -2.8, 0), true);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);

  try {
    const sum = sessionStorage.getItem("orbit-push-summary");
    const box = document.getElementById("agent-prompt");
    if (sum && box && !box.value.trim()) {
      box.value = sum;
      box.dataset.reply = "1";
    }
  } catch (e) {}

  try {
    if (sessionStorage.getItem("orbit-next-step") === "sql-compat" && window.CrewUI) {
      CrewUI.toast({
        bot: "Security",
        wants: "rewrite the SQL so GraphDev callers do not implode",
        detail: "Second pass keeps lookup(id) and binds inside user-service.",
        onAllow: function () {
          sessionStorage.removeItem("orbit-next-step");
          location.href = "security.html?compat=1";
        },
        onDeny: function () {
          sessionStorage.removeItem("orbit-next-step");
        },
      });
    }
  } catch (e2) {}

  OrbitAgent.bindPrompt({
    room: "mission",
    sendId: "agent-send",
    inputId: "agent-prompt",
    logId: "agent-log",
    replyInField: true,
    statusId: "tick-state",
    intercept: function (prompt) {
      if (/sql/i.test(prompt) && window.SqlLoop) {
        SqlLoop.start();
        return true;
      }
      return false;
    },
    context: function () {
      return { selectedPlanet: selected && selected.id, phase: "start" };
    },
    onResult: function (data) {
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
          CrewUI.setActivity("You allowed Security. Opening Findings…", true);
          location.href = "security.html?crew=1";
        },
        onGraph: function (graph) {
          CrewUI.setActivity("You allowed GraphDev. Opening the universe…", true);
          location.href = graph.href || "orbit.html";
        },
      });
    },
  });
})();
