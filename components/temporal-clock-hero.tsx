'use client';

import { useEffect, useRef, useState } from 'react';

const INK = '#1e1e1e';
const PINK = '#f386a1';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** A real, depth-tested WebGL object: the world frame and retained dial drift separately. */
export function TemporalClockHero() {
  const stageRef = useRef<HTMLButtonElement>(null);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    let closed = false;
    let disposeScene = () => {};

    void (async () => {
      try {
        const [
          THREE,
          { EffectComposer },
          { RenderPass },
          { BokehPass },
          { OutputPass },
        ] = await Promise.all([
          import('three'),
          import('three/addons/postprocessing/EffectComposer.js'),
          import('three/addons/postprocessing/RenderPass.js'),
          import('three/addons/postprocessing/BokehPass.js'),
          import('three/addons/postprocessing/OutputPass.js'),
        ]);
        if (closed) return;

        const reducedMotion = window.matchMedia(
          '(prefers-reduced-motion: reduce)',
        );
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(PINK);
        const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 30);
        camera.position.set(0, 0, 11.2);

        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          powerPreference: 'low-power',
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.domElement.className = 'temporal-clock-canvas';
        renderer.domElement.setAttribute('aria-hidden', 'true');
        stage.appendChild(renderer.domElement);

        const composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        // The dial stays in focus; the near and far frame edges fall slightly away.
        composer.addPass(
          new BokehPass(scene, camera, {
            focus: 10.7,
            aperture: 0.00065,
            maxblur: 0.006,
          }),
        );
        composer.addPass(new OutputPass());

        const ink = new THREE.MeshBasicMaterial({ color: INK });
        const face = new THREE.MeshBasicMaterial({ color: PINK });
        const assembly = new THREE.Group();
        const frame = new THREE.Group();
        const clock = new THREE.Group();
        scene.add(assembly);
        assembly.add(frame, clock);
        clock.position.z = 0.22;

        const rod = (
          parent: InstanceType<typeof THREE.Group>,
          from: InstanceType<typeof THREE.Vector3>,
          to: InstanceType<typeof THREE.Vector3>,
          radius: number,
        ) => {
          const difference = new THREE.Vector3().subVectors(to, from);
          const mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(radius, radius, difference.length(), 8),
            ink,
          );
          mesh.position.copy(from).add(to).multiplyScalar(0.5);
          mesh.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            difference.normalize(),
          );
          parent.add(mesh);
          return mesh;
        };

        // Twelve physical edges, rather than a flat drawn rectangle.
        const half = 2.35;
        const corners: InstanceType<typeof THREE.Vector3>[] = [];
        for (const x of [-half, half]) {
          for (const y of [-half, half]) {
            for (const z of [-half, half]) {
              corners.push(new THREE.Vector3(x, y, z));
            }
          }
        }
        for (let i = 0; i < corners.length; i++) {
          for (let j = i + 1; j < corners.length; j++) {
            const a = corners[i];
            const b = corners[j];
            const changedAxes =
              Number(a.x !== b.x) + Number(a.y !== b.y) + Number(a.z !== b.z);
            if (changedAxes === 1) rod(frame, a, b, 0.018);
          }
        }
        for (const corner of corners) {
          const marker = new THREE.Mesh(
            new THREE.SphereGeometry(0.052, 10, 8),
            ink,
          );
          marker.position.copy(corner);
          frame.add(marker);
        }

        // The clock has a thick dial, two separated rims, and hands at distinct Z depths.
        const disc = new THREE.Mesh(
          new THREE.CylinderGeometry(1.82, 1.82, 0.24, 96),
          face,
        );
        disc.rotation.x = Math.PI / 2;
        clock.add(disc);
        for (const z of [-0.17, 0.17]) {
          const rim = new THREE.Mesh(
            new THREE.TorusGeometry(1.86, 0.035, 10, 128),
            ink,
          );
          rim.position.z = z;
          clock.add(rim);
        }
        for (let i = 0; i < 12; i++) {
          const angle = (i / 12) * Math.PI * 2;
          const start = i % 3 === 0 ? 1.54 : 1.65;
          rod(
            clock,
            new THREE.Vector3(
              Math.sin(angle) * start,
              Math.cos(angle) * start,
              0.19,
            ),
            new THREE.Vector3(
              Math.sin(angle) * 1.76,
              Math.cos(angle) * 1.76,
              0.19,
            ),
            i % 3 === 0 ? 0.028 : 0.014,
          );
        }
        // An asymmetric winding crown makes the dial's motion readable
        // independently of the cube, even before the hands have moved far.
        rod(
          clock,
          new THREE.Vector3(0, 1.84, 0.02),
          new THREE.Vector3(0, 2.08, 0.02),
          0.032,
        );
        rod(
          clock,
          new THREE.Vector3(-0.17, 2.08, 0.02),
          new THREE.Vector3(0.17, 2.08, 0.02),
          0.046,
        );
        const innerRing = new THREE.Mesh(
          new THREE.TorusGeometry(1.28, 0.009, 5, 96),
          ink,
        );
        innerRing.position.z = 0.185;
        clock.add(innerRing);
        rod(
          clock,
          new THREE.Vector3(0, 0, 0.25),
          new THREE.Vector3(-0.7, 0.72, 0.25),
          0.064,
        );
        rod(
          clock,
          new THREE.Vector3(0, 0, 0.31),
          new THREE.Vector3(0.46, 1.36, 0.31),
          0.038,
        );
        const secondHand = new THREE.Group();
        rod(
          secondHand,
          new THREE.Vector3(-0.14, -0.34, 0.38),
          new THREE.Vector3(0.43, 1.43, 0.38),
          0.012,
        );
        clock.add(secondHand);
        const pin = new THREE.Mesh(
          new THREE.SphereGeometry(0.105, 16, 12),
          ink,
        );
        pin.position.z = 0.39;
        clock.add(pin);

        frame.rotation.set(-0.19, 0.35, 0.025);
        clock.rotation.set(0.09, -0.28, -0.22);
        let frameTarget = { x: -0.19, y: 0.35, z: 0.025 };
        let clockTarget = { x: 0.09, y: -0.28 };
        let clockRollSpeed = 0.0045;
        let clockRollTarget = 0.0045;
        let nextFrameDrift = performance.now() + 2400;
        let nextClockDrift = performance.now() + 11000;
        let resumeDrift = 0;
        let dragX = 0;
        let dragY = 0;
        let dragging = false;
        let activePointer: number | null = null;
        let pointerX = 0;
        let pointerY = 0;
        let visible = true;
        let lastFrame = 0;

        const render = () => composer.render();
        const resize = () => {
          const width = Math.max(1, stage.clientWidth);
          const height = Math.max(1, stage.clientHeight);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height, false);
          composer.setSize(width, height);
          render();
        };
        const randomBetween = (min: number, max: number) =>
          min + Math.random() * (max - min);
        const tick = (time: number) => {
          if (time - lastFrame < 28) return;
          const step = Math.min((time - (lastFrame || time)) / 33, 2);
          lastFrame = time;
          if (!dragging && time >= resumeDrift && time >= nextFrameDrift) {
            frameTarget = {
              x: randomBetween(-0.3, 0.2),
              y: randomBetween(-0.42, 0.42),
              z: randomBetween(-0.08, 0.08),
            };
            nextFrameDrift = time + randomBetween(8500, 15500);
          }
          if (!dragging && time >= resumeDrift && time >= nextClockDrift) {
            clockTarget = {
              x: randomBetween(-0.22, 0.22),
              y: randomBetween(-0.34, 0.34),
            };
            clockRollTarget =
              (Math.random() > 0.5 ? 1 : -1) * randomBetween(0.0035, 0.0055);
            nextClockDrift = time + randomBetween(11000, 17000);
          }
          const ease = 1 - Math.pow(0.993, step);
          assembly.rotation.x +=
            (dragX - assembly.rotation.x) * (dragging ? 0.28 : 0.1);
          assembly.rotation.y +=
            (dragY - assembly.rotation.y) * (dragging ? 0.28 : 0.1);
          if (!dragging && time >= resumeDrift) {
            frame.rotation.x += (frameTarget.x - frame.rotation.x) * ease;
            frame.rotation.y += (frameTarget.y - frame.rotation.y) * ease;
            frame.rotation.z += (frameTarget.z - frame.rotation.z) * ease;
            clock.rotation.x +=
              (clockTarget.x - clock.rotation.x) * ease * 0.82;
            clock.rotation.y +=
              (clockTarget.y - clock.rotation.y) * ease * 0.82;
            clockRollSpeed +=
              (clockRollTarget - clockRollSpeed) * (1 - Math.pow(0.97, step));
            clock.rotation.z += clockRollSpeed * step;
            if (clock.rotation.z > Math.PI) clock.rotation.z -= Math.PI * 2;
            if (clock.rotation.z < -Math.PI) clock.rotation.z += Math.PI * 2;
            secondHand.rotation.z -= 0.006 * step;
          }
          render();
        };
        const syncLoop = () => {
          renderer.setAnimationLoop(
            visible && !document.hidden && !reducedMotion.matches ? tick : null,
          );
          if (visible && !document.hidden) render();
        };
        const onPointerDown = (event: PointerEvent) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          activePointer = event.pointerId;
          pointerX = event.clientX;
          pointerY = event.clientY;
          dragging = true;
          stage.classList.add('is-dragging');
          stage.setPointerCapture(event.pointerId);
        };
        const onPointerMove = (event: PointerEvent) => {
          if (!dragging || activePointer !== event.pointerId) return;
          dragY = clamp(
            dragY + ((event.clientX - pointerX) / stage.clientWidth) * 2.1,
            -0.68,
            0.68,
          );
          dragX = clamp(
            dragX + ((event.clientY - pointerY) / stage.clientHeight) * 2.1,
            -0.62,
            0.62,
          );
          pointerX = event.clientX;
          pointerY = event.clientY;
          if (reducedMotion.matches) {
            assembly.rotation.set(dragX, dragY, 0);
            render();
          }
        };
        const onPointerUp = (event: PointerEvent) => {
          if (activePointer !== event.pointerId) return;
          activePointer = null;
          dragging = false;
          dragX = 0;
          dragY = 0;
          resumeDrift = performance.now() + 1600;
          stage.classList.remove('is-dragging');
          if (stage.hasPointerCapture(event.pointerId))
            stage.releasePointerCapture(event.pointerId);
          if (reducedMotion.matches) {
            assembly.rotation.set(0, 0, 0);
            render();
          }
        };
        const onKeyDown = (event: KeyboardEvent) => {
          const offsets: Record<string, [number, number]> = {
            ArrowLeft: [0, -0.16],
            ArrowRight: [0, 0.16],
            ArrowUp: [-0.16, 0],
            ArrowDown: [0.16, 0],
          };
          const offset = offsets[event.key];
          if (!offset) return;
          event.preventDefault();
          dragging = true;
          dragX = clamp(dragX + offset[0], -0.62, 0.62);
          dragY = clamp(dragY + offset[1], -0.68, 0.68);
          if (reducedMotion.matches) {
            assembly.rotation.set(dragX, dragY, 0);
            render();
          }
        };
        const onKeyUp = (event: KeyboardEvent) => {
          if (!event.key.startsWith('Arrow')) return;
          dragging = false;
          dragX = 0;
          dragY = 0;
          resumeDrift = performance.now() + 1600;
          if (reducedMotion.matches) {
            assembly.rotation.set(0, 0, 0);
            render();
          }
        };
        const onVisibilityChange = () => syncLoop();
        const onMotionChange = () => {
          if (reducedMotion.matches) {
            frame.rotation.set(-0.19, 0.35, 0.025);
            clock.rotation.set(0.09, -0.28, -0.22);
            assembly.rotation.set(0, 0, 0);
          }
          syncLoop();
        };
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(stage);
        const intersectionObserver = new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
          syncLoop();
        });
        intersectionObserver.observe(stage);
        stage.addEventListener('pointerdown', onPointerDown);
        stage.addEventListener('pointermove', onPointerMove);
        stage.addEventListener('pointerup', onPointerUp);
        stage.addEventListener('pointercancel', onPointerUp);
        stage.addEventListener('keydown', onKeyDown);
        stage.addEventListener('keyup', onKeyUp);
        document.addEventListener('visibilitychange', onVisibilityChange);
        reducedMotion.addEventListener('change', onMotionChange);
        resize();
        syncLoop();
        setReady(true);

        disposeScene = () => {
          renderer.setAnimationLoop(null);
          resizeObserver.disconnect();
          intersectionObserver.disconnect();
          stage.removeEventListener('pointerdown', onPointerDown);
          stage.removeEventListener('pointermove', onPointerMove);
          stage.removeEventListener('pointerup', onPointerUp);
          stage.removeEventListener('pointercancel', onPointerUp);
          stage.removeEventListener('keydown', onKeyDown);
          stage.removeEventListener('keyup', onKeyUp);
          document.removeEventListener('visibilitychange', onVisibilityChange);
          reducedMotion.removeEventListener('change', onMotionChange);
          scene.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            object.geometry.dispose();
          });
          ink.dispose();
          face.dispose();
          composer.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch {
        if (!closed) setUnavailable(true);
      }
    })();

    return () => {
      closed = true;
      disposeScene();
    };
  }, []);

  return (
    <figure
      className="temporal-clock"
      aria-label="The world frame and a retained clock drift out of alignment"
    >
      <div className="temporal-clock-topline" aria-hidden="true">
        <span>ETM / TEMPORAL OBJECT</span>
        <span>WORLD FRAME ≠ RETAINED TIME</span>
      </div>
      <button
        ref={stageRef}
        type="button"
        className="temporal-clock-stage"
        aria-label="Interactive three-dimensional clock and cube. Drag to rotate, or use the arrow keys. Release to return to the front view."
      >
        {!ready && (
          <span className="temporal-clock-placeholder" aria-hidden="true">
            <span className="temporal-clock-placeholder-face" />
            <span>
              {unavailable
                ? '3D VIEW UNAVAILABLE'
                : 'INITIALIZING TEMPORAL FIELD'}
            </span>
          </span>
        )}
        <span
          className="temporal-clock-crosshair temporal-clock-crosshair--tl"
          aria-hidden="true"
        />
        <span
          className="temporal-clock-crosshair temporal-clock-crosshair--br"
          aria-hidden="true"
        />
      </button>
      <figcaption className="temporal-clock-caption">
        <span>DRAG TO ROTATE / RELEASE TO RETURN</span>
        <span>01 : TWO FRAMES OF REFERENCE</span>
      </figcaption>
    </figure>
  );
}
