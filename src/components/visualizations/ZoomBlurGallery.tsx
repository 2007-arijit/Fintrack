import { useCallback, useEffect, useRef, useState } from "react";
import {
  CanvasTexture,
  LinearFilter,
  Mesh,
  NoColorSpace,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Texture,
  Vector2,
  WebGLRenderer,
} from "three";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { cn } from "@/lib/utils";

export interface ZoomBlurImageItem {
  id: string;
  src: string;
  alt?: string;
}

interface ZoomBlurGalleryProps {
  images: ZoomBlurImageItem[];
  activeIndex?: number;
  onIndexChange?: (index: number) => void;
  /** "capture" scrubs transitions on mouse wheel inside the canvas (Ref 01 faithful); "none" preserves page scroll. */
  wheelMode?: "capture" | "none";
  /** Listen to ArrowLeft/ArrowUp/ArrowRight/ArrowDown at window level (for full-page gallery). */
  globalKeyboard?: boolean;
  /** Enable click-on-canvas navigation (upper/left half = prev, lower/right half = next). */
  clickToNavigate?: boolean;
  className?: string;
}

interface ViewportSize {
  width: number;
  height: number;
  wWidth: number;
  wHeight: number;
  ratio: number;
}

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Adapted from https://github.com/evanw/glfx.js (matching Reference 01)
const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D map;
  uniform vec2 center;
  uniform float strength;
  uniform vec2 uvOffset;
  uniform vec2 uvScale;
  varying vec2 vUv;

  float random(vec3 scale, float seed) {
    /* use the fragment position for a different seed per-pixel */
    return fract(sin(dot(gl_FragCoord.xyz + seed, scale)) * 43758.5453 + seed);
  }

  void main() {
    vec2 tUv = vUv * uvScale + uvOffset;
    if (abs(strength) > 0.001) {
      vec4 color = vec4(0.0);
      float total = 0.0;
      vec2 toCenter = center * uvScale + uvOffset - tUv;

      /* randomize the lookup values to hide the fixed number of samples */
      float offset = random(vec3(12.9898, 78.233, 151.7182), 0.0);

      for (float t = 0.0; t <= 20.0; t++) {
        float percent = (t + offset) / 20.0;
        float weight = 2.0 * (percent - percent * percent);
        vec4 texel = texture2D(map, tUv + toCenter * percent * strength);

        /* switch to pre-multiplied alpha to correctly blur transparent images */
        texel.rgb *= texel.a;

        color += texel * weight;
        total += weight;
      }

      gl_FragColor = color / total;

      /* switch back from pre-multiplied alpha */
      gl_FragColor.rgb /= gl_FragColor.a + 0.00001;
      gl_FragColor.a = 1.0 - abs(strength);
    } else {
      gl_FragColor = texture2D(map, tUv);
    }
  }
`;

const MAX_TEXTURE_SIDE = 2048;
const WHEEL_STEP_THRESHOLD = 34;
const WHEEL_COOLDOWN_MS = 180;

function lerp(a: number, b: number, x: number): number {
  return a + x * (b - a);
}

function lerpv2(v1: Vector2, v2: Vector2, amount: number) {
  v1.x = lerp(v1.x, v2.x, amount);
  v1.y = lerp(v1.y, v2.y, amount);
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"),
  );
}

function createZoomBlurPlane(getSize: () => ViewportSize) {
  const geometry = new PlaneGeometry(1, 1, 1, 1);
  const uMap: { value: Texture | null } = { value: null };
  const uCenter = { value: new Vector2(0.5, 0.5) };
  const uStrength = { value: -1 };
  const uUVOffset = { value: new Vector2(0, 0) };
  const uUVScale = { value: new Vector2(1, 1) };

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      map: uMap,
      center: uCenter,
      strength: uStrength,
      uvOffset: uUVOffset,
      uvScale: uUVScale,
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  });

  const mesh = new Mesh(geometry, material);

  function resize() {
    const size = getSize();
    mesh.scale.set(size.wWidth, size.wHeight, 1);
    const img = uMap.value?.image as { width?: number; height?: number } | undefined;
    if (!img || !img.width || !img.height || size.ratio <= 0) return;

    const iRatio = img.width / img.height;
    uUVOffset.value.set(0, 0);
    uUVScale.value.set(1, 1);
    if (iRatio > size.ratio) {
      uUVScale.value.x = size.ratio / iRatio;
      uUVOffset.value.x = (1 - uUVScale.value.x) / 2;
    } else {
      uUVScale.value.y = iRatio / size.ratio;
      uUVOffset.value.y = (1 - uUVScale.value.y) / 2;
    }
  }

  function setMap(tex: Texture) {
    uMap.value = tex;
    resize();
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return { mesh, uCenter, uStrength, setMap, resize, dispose };
}

function loadCanvasTexture(src: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const sourceW = img.naturalWidth || 1600;
      const sourceH = img.naturalHeight || 1000;
      const scale = Math.min(1, MAX_TEXTURE_SIDE / Math.max(sourceW, sourceH));
      const w = Math.max(1, Math.round(sourceW * scale));
      const h = Math.max(1, Math.round(sourceH * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, w, h);
      }
      const tex = new CanvasTexture(canvas);
      tex.minFilter = LinearFilter;
      tex.magFilter = LinearFilter;
      // Sampled straight through the custom shader: keep the texture in raw
      // sRGB values so the stage matches the source artwork exactly. Marking
      // the texture as sRGB would linearise it here and, because ShaderMaterial
      // has no output-encoding chunk, the frame would composite far too dark.
      tex.colorSpace = NoColorSpace;
      tex.needsUpdate = true;
      resolve(tex);
    };
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

export default function ZoomBlurGallery({
  images,
  activeIndex,
  onIndexChange,
  wheelMode = "capture",
  globalKeyboard = false,
  clickToNavigate = true,
  className,
}: ZoomBlurGalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [fallbackMode, setFallbackMode] = useState(false);
  const [internalIndex, setInternalIndex] = useState(activeIndex ?? 0);
  const [ready, setReady] = useState(false);

  const count = images.length;
  const currentActive =
    count > 0 ? (activeIndex !== undefined ? mod(activeIndex, count) : internalIndex) : 0;

  // Keep the latest list around without retriggering the WebGL scene when the
  // parent re-renders. The scene only rebuilds when the actual sources change.
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const imageSignature = images.map((item) => `${item.id}:${item.src}`).join("|");

  // Refs synced with the Three.js loop
  const progressRef = useRef(currentActive);
  const targetProgressRef = useRef(currentActive);
  const lastReportedIndexRef = useRef(currentActive);
  const onIndexChangeRef = useRef(onIndexChange);
  onIndexChangeRef.current = onIndexChange;
  const inViewRef = useRef(false);
  const suppressClickRef = useRef(false);

  const setTargetProgress = useCallback(
    (value: number) => {
      if (count === 0) return;
      let next = value;
      if (next < 0) {
        progressRef.current += count;
        next += count;
      }
      targetProgressRef.current = next;
    },
    [count],
  );

  const navNext = useCallback(() => {
    const tp = targetProgressRef.current;
    if (Number.isInteger(tp)) setTargetProgress(tp + 1);
    else setTargetProgress(Math.ceil(tp));
  }, [setTargetProgress]);

  const navPrevious = useCallback(() => {
    const tp = targetProgressRef.current;
    if (Number.isInteger(tp)) setTargetProgress(tp - 1);
    else setTargetProgress(Math.floor(tp));
  }, [setTargetProgress]);

  // Sync external activeIndex changes smoothly into targetProgress. Changes the
  // stage itself reported are ignored, otherwise an in-flight multi-scene jump
  // would keep retargeting to whichever scene it is passing through.
  useEffect(() => {
    if (activeIndex === undefined || count === 0) return;
    const normalizedTarget = mod(activeIndex, count);
    if (normalizedTarget === mod(lastReportedIndexRef.current, count)) {
      setInternalIndex(normalizedTarget);
      return;
    }
    const currentMod = mod(Math.round(targetProgressRef.current), count);
    if (normalizedTarget !== currentMod) {
      let delta = normalizedTarget - currentMod;
      if (delta > count / 2) delta -= count;
      if (delta < -count / 2) delta += count;
      setTargetProgress(Math.round(targetProgressRef.current) + delta);
    }
    setInternalIndex(normalizedTarget);
  }, [activeIndex, count, setTargetProgress]);

  // Track whether the stage is on screen so keyboard/wheel navigation never
  // hijacks the rest of the page.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        inViewRef.current = Boolean(entry?.isIntersecting);
      },
      { threshold: 0.12 },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setFallbackMode(true);
      setReady(true);
      return;
    }

    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas || count === 0) return;

    setReady(false);

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        canvas,
        antialias: false,
        alpha: true,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    } catch {
      setFallbackMode(true);
      setReady(true);
      return;
    }

    setFallbackMode(false);
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 10;

    const size: ViewportSize = {
      width: 1,
      height: 1,
      wWidth: 1,
      wHeight: 1,
      ratio: 1,
    };

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      size.width = width;
      size.height = height;
      size.ratio = width / height;

      camera.aspect = size.ratio;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);

      const vFov = (camera.fov * Math.PI) / 180;
      size.wHeight = 2 * Math.tan(vFov / 2) * camera.position.z;
      size.wWidth = size.wHeight * size.ratio;
    };

    updateSize();

    const image1 = createZoomBlurPlane(() => size);
    const image2 = createZoomBlurPlane(() => size);
    scene.add(image1.mesh);
    scene.add(image2.mesh);

    const mouse = new Vector2(0, 0);
    const center = new Vector2(0.5, 0.5);
    let textures: Texture[] = [];
    let disposed = false;
    let loaded = false;
    let inView = true;
    let running = false;
    let rafId = 0;
    let entranceStart: number | null = null;
    const ENTRANCE_MS = 2200;

    const canRun = () => !disposed && loaded && inView && !document.hidden;

    function renderLoop(now: number) {
      if (!canRun()) {
        running = false;
        return;
      }
      rafId = requestAnimationFrame(renderLoop);

      // Mouse-responsive blur center (Ref 01)
      center.copy(mouse).divideScalar(2).addScalar(0.5);
      lerpv2(image1.uCenter.value, center, 0.1);
      lerpv2(image2.uCenter.value, center, 0.1);

      // Initial zoom-blur entrance (-2 -> 0) before user scrolls/navigates
      const pTarget = targetProgressRef.current;
      const pCurr = progressRef.current;
      const progress1 = lerp(pCurr, pTarget, 0.05);
      const pdiff = progress1 - pCurr;

      if (entranceStart !== null && Math.abs(pdiff) < 0.0005 && pCurr === Math.round(pCurr)) {
        const elapsed = now - entranceStart;
        if (elapsed < ENTRANCE_MS) {
          const t = elapsed / ENTRANCE_MS;
          const eased = 1 - Math.pow(1 - t, 2); // Power2.easeOut
          image1.uStrength.value = -2 + 2 * eased;
          image2.uStrength.value = -1;
        } else {
          entranceStart = null;
          setImagesProgress(0);
        }
      } else if (Math.abs(pdiff) > 0.00001) {
        entranceStart = null;
        progressRef.current = progress1;
        syncTexturesForProgress(progress1);
        setImagesProgress(mod(progress1, 1));

        // Only announce a scene once the transition has settled, so a long
        // jump (e.g. rail dot 01 -> 05) does not flash every scene it passes.
        const rounded = Math.round(progress1);
        const nearest = mod(rounded, textures.length);
        if (
          Math.abs(progress1 - rounded) < 0.2 &&
          nearest !== lastReportedIndexRef.current
        ) {
          lastReportedIndexRef.current = nearest;
          setInternalIndex(nearest);
          onIndexChangeRef.current?.(nearest);
        }
      }

      renderer.render(scene, camera);
    }

    const startLoop = () => {
      if (running || !canRun()) return;
      running = true;
      rafId = requestAnimationFrame(renderLoop);
    };

    const stopLoop = () => {
      running = false;
      cancelAnimationFrame(rafId);
      rafId = 0;
    };

    const setImagesProgress = (p: number) => {
      image1.uStrength.value = p;
      image2.uStrength.value = -1 + p;
    };

    let shownPair = -1;
    const syncTexturesForProgress = (p: number) => {
      if (textures.length === 0) return;
      const i = mod(Math.floor(p), textures.length);
      if (i === shownPair) return;
      shownPair = i;
      const j = mod(i + 1, textures.length);
      image1.setMap(textures[i]);
      image2.setMap(textures[j]);
    };

    const resizeObserver = new ResizeObserver(() => {
      if (disposed) return;
      updateSize();
      image1.resize();
      image2.resize();
    });
    resizeObserver.observe(container);

    const stageObserver = new IntersectionObserver(
      ([entry]) => {
        inView = Boolean(entry?.isIntersecting);
        if (inView) startLoop();
        else stopLoop();
      },
      { threshold: 0.04 },
    );
    stageObserver.observe(container);

    const handleVisibility = () => {
      if (document.hidden) stopLoop();
      else startLoop();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      stopLoop();
      setFallbackMode(true);
      setReady(true);
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);

    const updatePointer = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    };

    const handlePointerMove = (e: PointerEvent) => {
      updatePointer(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) {
        updatePointer(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    container.addEventListener("pointermove", handlePointerMove, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: true });

    Promise.all(imagesRef.current.map((item) => loadCanvasTexture(item.src)))
      .then((loadedTextures) => {
        if (disposed) {
          loadedTextures.forEach((t) => t.dispose());
          return;
        }
        textures = loadedTextures;
        loaded = true;
        syncTexturesForProgress(progressRef.current);
        setImagesProgress(mod(progressRef.current, 1));
        entranceStart = performance.now();
        setReady(true);
        startLoop();
      })
      .catch(() => {
        if (!disposed) {
          setFallbackMode(true);
          setReady(true);
        }
      });

    return () => {
      disposed = true;
      stopLoop();
      resizeObserver.disconnect();
      stageObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("touchmove", handleTouchMove);
      image1.dispose();
      image2.dispose();
      textures.forEach((t) => t.dispose());
      renderer.dispose();
    };
  }, [count, imageSignature, reducedMotion]);

  // Wheel navigation: one scene per wheel gesture; releases the page at the
  // first/last scene so the visitor is never trapped inside the gallery.
  useEffect(() => {
    if (wheelMode !== "capture" || reducedMotion) return;
    const container = containerRef.current;
    if (!container || count === 0) return;

    let accumulated = 0;
    let lastNav = 0;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      const delta = e.deltaY || e.deltaX;
      if (!delta) return;

      const target = targetProgressRef.current;
      const progress = progressRef.current;
      const atEnd = target >= count - 1 - 0.001 && progress >= count - 1 - 0.001;
      const atStart = target <= 0.001 && progress <= 0.001;
      if ((delta > 0 && atEnd) || (delta < 0 && atStart)) {
        accumulated = 0;
        return;
      }

      if (e.cancelable) e.preventDefault();
      accumulated += delta;
      if (Math.abs(accumulated) < WHEEL_STEP_THRESHOLD) return;

      const now = performance.now();
      if (now - lastNav < WHEEL_COOLDOWN_MS) return;
      lastNav = now;
      const direction = accumulated > 0 ? 1 : -1;
      accumulated = 0;
      if (direction > 0) navNext();
      else navPrevious();
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [wheelMode, reducedMotion, count, navNext, navPrevious]);

  // Keyboard navigation (←/↑ previous, →/↓ next), only while the stage is visible.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (!globalKeyboard && document.activeElement !== containerRef.current) return;
      if (globalKeyboard && !inViewRef.current) return;

      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        navPrevious();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        navNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [globalKeyboard, navNext, navPrevious]);

  // Touch swipe & click-to-navigate (Ref 01's top/bottom halves).
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!clickToNavigate) return;
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if ((e.target as HTMLElement).closest("button, a, input, [role='button']")) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    if (reducedMotion || fallbackMode) {
      const next =
        relY < rect.height / 2 ? mod(currentActive - 1, count) : mod(currentActive + 1, count);
      setInternalIndex(next);
      onIndexChange?.(next);
      return;
    }
    if (relY < rect.height / 2) {
      navPrevious();
    } else {
      navNext();
    }
  };

  if (count === 0) {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden bg-[#090807]",
          className,
        )}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-roledescription="interactive visual gallery"
      aria-label="FinTrack visual showcase. Use left and right arrow keys to switch scenes."
      onClick={handleContainerClick}
      onTouchStart={(e) => {
        if (e.touches[0]) {
          touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
      }}
      onTouchEnd={(e) => {
        if (!touchStartRef.current || !e.changedTouches[0]) return;
        const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
        const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
        touchStartRef.current = null;
        if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy)) {
          suppressClickRef.current = true;
          window.setTimeout(() => {
            suppressClickRef.current = false;
          }, 420);
          if (dx < 0) navNext();
          else navPrevious();
        }
      }}
      className={cn(
        "relative select-none overflow-hidden bg-[#090807] outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        className,
      )}
    >
      {!fallbackMode ? (
        <>
          {/* Poster frame keeps the stage cinematic while textures decode. */}
          <img
            src={images[0].src}
            alt=""
            aria-hidden="true"
            draggable={false}
            className={cn(
              "pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-700",
              ready ? "opacity-0" : "opacity-70",
            )}
          />
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            className={cn(
              "relative block h-full w-full transition-opacity duration-700",
              ready ? "opacity-100" : "opacity-0",
            )}
          />
        </>
      ) : (
        <div className="relative h-full w-full">
          {images.map((item, idx) => (
            <img
              key={item.id}
              src={item.src}
              alt={item.alt ?? ""}
              draggable={false}
              decoding="async"
              className={cn(
                "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
                idx === currentActive ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
