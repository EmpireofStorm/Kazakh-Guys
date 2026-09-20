(function (root) {
  function OrbitCam(camera, el) {
    const target = new THREE.Vector3(0, 0, 0);
    const spherical = new THREE.Spherical();
    spherical.setFromVector3(camera.position.clone().sub(target));
    let drag = null;
    let damping = 0.08;
    const vel = { theta: 0, phi: 0 };
    this.enableDamping = true;
    this.minDistance = 80;
    this.maxDistance = 1400;
    this.target = target;
    this.autoRotate = true;
    this.autoRotateSpeed = 0.5;
    this.enabled = true;

    el.addEventListener("pointerdown", (e) => {
      if (!this.enabled) return;
      drag = { x: e.clientX, y: e.clientY, btn: e.button };
      this.autoRotate = false;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointerup", () => {
      drag = null;
    });
    el.addEventListener("pointermove", (e) => {
      if (!this.enabled || !drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (drag.btn === 2 || e.shiftKey) {
        const pan = new THREE.Vector3();
        pan.set(-dx * 0.05, dy * 0.05, 0).applyQuaternion(camera.quaternion);
        target.add(pan);
      } else {
        vel.theta -= dx * 0.005;
        vel.phi -= dy * 0.005;
      }
    });
    el.addEventListener("wheel", (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      spherical.radius = THREE.MathUtils.clamp(
        spherical.radius + e.deltaY * 0.35,
        this.minDistance,
        this.maxDistance
      );
    }, { passive: false });
    el.addEventListener("contextmenu", (e) => e.preventDefault());

    this.update = function () {
      if (!this.enabled) {
        camera.lookAt(target);
        return;
      }
      if (this.autoRotate && !drag) spherical.theta += 0.002 * this.autoRotateSpeed;
      spherical.theta += vel.theta;
      spherical.phi += vel.phi;
      vel.theta *= this.enableDamping ? 1 - damping : 0;
      vel.phi *= this.enableDamping ? 1 - damping : 0;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0.12, Math.PI - 0.12);
      camera.position.setFromSpherical(spherical).add(target);
      camera.lookAt(target);
    };

    this.syncFromCamera = function () {
      spherical.setFromVector3(camera.position.clone().sub(target));
    };
  }

  root.OrbitCam = OrbitCam;
})(window);
