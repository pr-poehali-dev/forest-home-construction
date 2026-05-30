import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import Icon from "@/components/ui/icon";

type GameScreen = "menu" | "game" | "settings" | "help";
type ActiveTool = "hand" | "build" | "portal" | "laser" | "gravity";
type BuildMaterial = "wood" | "stone" | "glass";

interface InventoryItem {
  id: BuildMaterial;
  label: string;
  emoji: string;
  count: number;
  color: string;
}

interface EnemyData {
  mesh: THREE.Group;
  speed: number;
  health: number;
  id: number;
}

const INVENTORY_ITEMS: InventoryItem[] = [
  { id: "wood", label: "Дерево", emoji: "🪵", count: 64, color: "#c87941" },
  { id: "stone", label: "Камень", emoji: "🪨", count: 32, color: "#aaaaaa" },
  { id: "glass", label: "Стекло", emoji: "🪟", count: 16, color: "#7ecfff" },
];

const CONTROLS_HELP = [
  { key: "WASD", desc: "Движение" },
  { key: "Мышь", desc: "Поворот камеры" },
  { key: "ЛКМ", desc: "Поставить блок / Лазер / Портал A" },
  { key: "ПКМ", desc: "Убрать блок / Портал B" },
  { key: "Пробел", desc: "Прыжок" },
  { key: "E / Tab", desc: "Инвентарь" },
  { key: "Q", desc: "Сменить материал" },
  { key: "1", desc: "Рука" },
  { key: "2", desc: "Строительство" },
  { key: "3", desc: "Портальная пушка" },
  { key: "4", desc: "Лазерный манипулятор" },
  { key: "5", desc: "Гравитационная пушка" },
  { key: "G", desc: "Прыжок от стены" },
  { key: "T", desc: "Замедление времени" },
  { key: "Esc", desc: "Выход в меню" },
];

export default function Index() {
  const [screen, setScreen] = useState<GameScreen>("menu");
  const [activeTool, setActiveTool] = useState<ActiveTool>("build");
  const [selectedMaterial, setSelectedMaterial] = useState<BuildMaterial>("wood");
  const [inventory, setInventory] = useState<InventoryItem[]>(INVENTORY_ITEMS.map(i => ({ ...i })));
  const [showInventory, setShowInventory] = useState(false);
  const [buildProgress, setBuildProgress] = useState(0);
  const [playerLevel, setPlayerLevel] = useState(1);
  const [health, setHealth] = useState(100);
  const [slowTime, setSlowTime] = useState(false);
  const [enemyCount, setEnemyCount] = useState(0);
  const [settingsTab, setSettingsTab] = useState<"graphics" | "sound" | "controls" | "difficulty">("graphics");
  const [volume, setVolume] = useState(70);
  const [fov, setFov] = useState(75);
  const [difficulty, setDifficulty] = useState<"easy" | "normal" | "hard">("normal");
  const [dayTime, setDayTime] = useState(12);
  const [notification, setNotification] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [portalAActive, setPortalAActive] = useState(false);
  const [portalBActive, setPortalBActive] = useState(false);

  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animFrameRef = useRef<number>(0);
  const keysRef = useRef<Set<string>>(new Set());
  const pitchRef = useRef(0);
  const yawRef = useRef(0);
  const blocksRef = useRef<THREE.Mesh[]>([]);
  const enemiesRef = useRef<EnemyData[]>([]);
  const portalARef = useRef<THREE.Mesh | null>(null);
  const portalBRef = useRef<THREE.Mesh | null>(null);
  const laserRef = useRef<THREE.Line | null>(null);
  const playerRef = useRef(new THREE.Vector3(0, 1.7, 8));
  const velYRef = useRef(0);
  const onGroundRef = useRef(true);
  const slowRef = useRef(false);
  const clockRef = useRef(new THREE.Clock());
  const enemyIdRef = useRef(0);
  const dayRef = useRef(Math.PI / 2);
  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeToolRef = useRef<ActiveTool>("build");
  const selectedMatRef = useRef<BuildMaterial>("wood");
  const difficultyRef = useRef<"easy" | "normal" | "hard">("normal");
  const screenRef = useRef<GameScreen>("menu");
  const showInvRef = useRef(false);

  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { selectedMatRef.current = selectedMaterial; }, [selectedMaterial]);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);
  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => { showInvRef.current = showInventory; }, [showInventory]);

  const showNotif = useCallback((msg: string) => {
    setNotification(msg);
    if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    notifTimerRef.current = setTimeout(() => setNotification(null), 2500);
  }, []);

  const destroyEnemy = useCallback((id: number) => {
    const idx = enemiesRef.current.findIndex(e => e.id === id);
    if (idx === -1) return;
    sceneRef.current?.remove(enemiesRef.current[idx].mesh);
    enemiesRef.current.splice(idx, 1);
    setEnemyCount(c => Math.max(0, c - 1));
    showNotif("👹 Враг уничтожен!");
  }, [showNotif]);

  const placeBlock = useCallback(() => {
    if (!sceneRef.current || !cameraRef.current) return;
    const cam = cameraRef.current;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), cam);
    const targets = [
      ...blocksRef.current,
      ...(sceneRef.current.children.filter(c => c.userData.isGround) as THREE.Mesh[]),
    ];
    const hits = raycaster.intersectObjects(targets);
    if (!hits.length || hits[0].distance > 6) return;
    const hit = hits[0];
    const pos = hit.point.clone().add(hit.face!.normal.clone().multiplyScalar(0.5));
    pos.x = Math.round(pos.x);
    pos.y = Math.round(pos.y - 0.5) + 0.5;
    pos.z = Math.round(pos.z);
    const mat = selectedMatRef.current;
    const colors: Record<BuildMaterial, number> = { wood: 0x8B4513, stone: 0x888888, glass: 0x9de4ff };
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const blockMat = new THREE.MeshStandardMaterial({
      color: colors[mat],
      roughness: mat === "stone" ? 0.95 : mat === "wood" ? 0.8 : 0.1,
      metalness: mat === "glass" ? 0.15 : 0,
      transparent: mat === "glass",
      opacity: mat === "glass" ? 0.55 : 1,
    });
    const block = new THREE.Mesh(geo, blockMat);
    block.position.copy(pos);
    block.castShadow = true;
    block.receiveShadow = true;
    block.userData.isBlock = true;
    sceneRef.current.add(block);
    blocksRef.current.push(block);
    setInventory(inv => inv.map(i => i.id === mat ? { ...i, count: Math.max(0, i.count - 1) } : i));
    setBuildProgress(p => {
      const np = Math.min(100, p + 2);
      if (np >= 100 && p < 100) showNotif("🏠 Дом построен! Поздравляем!");
      return np;
    });
    setPlayerLevel(l => blocksRef.current.length % 20 === 0 ? l + 1 : l);
  }, [showNotif]);

  const removeBlock = useCallback(() => {
    if (!sceneRef.current || !cameraRef.current) return;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), cameraRef.current);
    const hits = raycaster.intersectObjects(blocksRef.current);
    if (!hits.length || hits[0].distance > 6) return;
    const block = hits[0].object as THREE.Mesh;
    sceneRef.current.remove(block);
    blocksRef.current = blocksRef.current.filter(b => b !== block);
    setBuildProgress(p => Math.max(0, p - 2));
  }, []);

  const firePortal = useCallback((isB: boolean) => {
    if (!sceneRef.current || !cameraRef.current) return;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), cameraRef.current);
    const targets = [
      ...blocksRef.current,
      ...(sceneRef.current.children.filter(c => c.userData.isGround) as THREE.Mesh[]),
    ];
    const hits = raycaster.intersectObjects(targets);
    if (!hits.length || hits[0].distance > 35) return;
    const pos = hits[0].point.clone().add(hits[0].face!.normal.clone().multiplyScalar(0.06));
    const color = isB ? 0x0088ff : 0xff6600;
    const portalGeo = new THREE.TorusGeometry(0.9, 0.18, 12, 48);
    const portalMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 3, transparent: true, opacity: 0.9 });
    const portal = new THREE.Mesh(portalGeo, portalMat);
    portal.position.copy(pos);
    portal.lookAt(pos.clone().add(hits[0].face!.normal));
    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(0.88, 48),
      new THREE.MeshBasicMaterial({ color: isB ? 0x003899 : 0x993300, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    portal.add(inner);
    if (!isB) {
      if (portalARef.current) sceneRef.current.remove(portalARef.current);
      portalARef.current = portal;
      setPortalAActive(true);
    } else {
      if (portalBRef.current) sceneRef.current.remove(portalBRef.current);
      portalBRef.current = portal;
      setPortalBActive(true);
    }
    sceneRef.current.add(portal);
    showNotif(isB ? "🔵 Портал B установлен!" : "🟠 Портал A установлен!");
  }, [showNotif]);

  const fireLaser = useCallback(() => {
    if (!sceneRef.current || !cameraRef.current) return;
    const cam = cameraRef.current;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), cam);
    const start = cam.position.clone();
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const end = start.clone().add(dir.multiplyScalar(45));
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const mat = new THREE.LineBasicMaterial({ color: 0xff0000 });
    const line = new THREE.Line(geo, mat);
    if (laserRef.current) sceneRef.current.remove(laserRef.current);
    laserRef.current = line;
    sceneRef.current.add(line);
    const allMeshes = enemiesRef.current.map(e => e.mesh);
    const hits = raycaster.intersectObjects(allMeshes, true);
    if (hits.length) {
      const hitObj = hits[0].object;
      const enemy = enemiesRef.current.find(e => e.mesh === hitObj || e.mesh === hitObj.parent);
      if (enemy) {
        enemy.health -= 40;
        if (enemy.health <= 0) destroyEnemy(enemy.id);
        else showNotif("🔴 Враг ранен лазером!");
      }
    }
    setTimeout(() => {
      if (laserRef.current && sceneRef.current) {
        sceneRef.current.remove(laserRef.current);
        laserRef.current = null;
      }
    }, 200);
  }, [destroyEnemy, showNotif]);

  const gravityBlast = useCallback(() => {
    if (!sceneRef.current || !cameraRef.current) return;
    const cam = cameraRef.current;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    let hit = false;
    enemiesRef.current.forEach(enemy => {
      const dist = enemy.mesh.position.distanceTo(cam.position);
      if (dist < 18) {
        const push = dir.clone().multiplyScalar(22 / dist);
        enemy.mesh.position.add(push);
        hit = true;
      }
    });
    if (hit) showNotif("💥 Гравитационный удар!");
    else showNotif("💥 Нет целей в радиусе 18м");
  }, [showNotif]);

  const initGame = useCallback(() => {
    if (!mountRef.current) return;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x2d4a1e, 0.022);
    scene.background = new THREE.Color(0x87CEEB);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 0.1, 500);
    camera.position.copy(playerRef.current);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const sun = new THREE.DirectionalLight(0xFFF5DC, 2.8);
    sun.position.set(60, 90, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 350;
    sun.shadow.camera.left = -100;
    sun.shadow.camera.right = 100;
    sun.shadow.camera.top = 100;
    sun.shadow.camera.bottom = -100;
    sun.shadow.bias = -0.0015;
    scene.add(sun);
    scene.userData.sun = sun;

    const ambient = new THREE.AmbientLight(0x334422, 0.7);
    scene.add(ambient);
    scene.userData.ambient = ambient;

    const hemi = new THREE.HemisphereLight(0x87CEEB, 0x3d6a22, 0.5);
    scene.add(hemi);
    scene.userData.hemi = hemi;

    // Stars
    const starGeo = new THREE.BufferGeometry();
    const sv: number[] = [];
    for (let i = 0; i < 2500; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const r = 380;
      sv.push(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th));
    }
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(sv, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, sizeAttenuation: true, transparent: true, opacity: 0 });
    scene.add(new THREE.Points(starGeo, starMat));
    scene.userData.starMat = starMat;

    // Ground
    const groundGeo = new THREE.PlaneGeometry(240, 240, 60, 60);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x3d7020, roughness: 0.97, metalness: 0 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.userData.isGround = true;
    // Add micro terrain bumps
    const posA = groundGeo.attributes.position;
    for (let i = 0; i < posA.count; i++) {
      const x = posA.getX(i), z = posA.getY(i);
      if (Math.abs(x) > 10 || Math.abs(z) > 10) {
        posA.setZ(i, (Math.sin(x * 0.15) * Math.cos(z * 0.18) + Math.sin(x * 0.4) * 0.3) * 0.9);
      }
    }
    groundGeo.computeVertexNormals();
    scene.add(ground);

    // Trees
    const makeTree = (x: number, z: number, sc: number) => {
      const g = new THREE.Group();
      const th = (5 + Math.random() * 5) * sc;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22 * sc, 0.38 * sc, th, 7),
        new THREE.MeshStandardMaterial({ color: 0x4a2810, roughness: 0.95 })
      );
      trunk.position.y = th / 2;
      trunk.castShadow = true;
      g.add(trunk);
      const layers = 3 + Math.floor(Math.random() * 3);
      for (let l = 0; l < layers; l++) {
        const r = (2.8 - l * 0.55) * sc;
        const h = (2.2 + Math.random()) * sc;
        const y = th * 0.45 + l * h * 0.72 + h / 2;
        const hue = 110 + Math.random() * 25;
        const lum = 18 + Math.random() * 22;
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(r, h, 7 + Math.floor(Math.random() * 3)),
          new THREE.MeshStandardMaterial({ color: new THREE.Color(`hsl(${hue},55%,${lum}%)`), roughness: 0.88 })
        );
        cone.position.y = y;
        cone.rotation.y = Math.random() * Math.PI;
        cone.castShadow = true;
        g.add(cone);
      }
      g.position.set(x, 0, z);
      g.userData.isTree = true;
      scene.add(g);
    };

    for (let i = 0; i < 100; i++) {
      let x, z;
      do { x = (Math.random() - 0.5) * 200; z = (Math.random() - 0.5) * 200; }
      while (Math.abs(x) < 14 && Math.abs(z) < 14);
      makeTree(x, z, 0.65 + Math.random() * 1.1);
    }

    // Rocks
    for (let i = 0; i < 30; i++) {
      const x = (Math.random() - 0.5) * 170;
      const z = (Math.random() - 0.5) * 170;
      if (Math.abs(x) < 12 && Math.abs(z) < 12) continue;
      const s = 0.25 + Math.random() * 1.4;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(s, 0),
        new THREE.MeshStandardMaterial({ color: 0x807868, roughness: 1 })
      );
      rock.position.set(x, s * 0.35, z);
      rock.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
      rock.castShadow = true;
      rock.receiveShadow = true;
      scene.add(rock);
    }

    // Build area guide
    const guide = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, transparent: true, opacity: 0.35 })
    );
    guide.rotation.x = -Math.PI / 2;
    guide.position.y = 0.03;
    scene.add(guide);

    setScreen("game");
  }, [fov]);

  const spawnEnemy = useCallback(() => {
    if (!sceneRef.current) return;
    const angle = Math.random() * Math.PI * 2;
    const dist = 38 + Math.random() * 30;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.42, 1.1, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x1a0e05, roughness: 0.8, emissive: 0x150800, emissiveIntensity: 0.5 })
    );
    body.castShadow = true;
    g.add(body);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff1500 });
    [-0.22, 0.22].forEach(ex => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), eyeMat);
      eye.position.set(ex, 0.45, 0.4);
      g.add(eye);
    });
    g.position.set(x, 1.1, z);
    sceneRef.current.add(g);
    const id = enemyIdRef.current++;
    const spd = 1.5 + Math.random() * (difficultyRef.current === "hard" ? 2.2 : difficultyRef.current === "easy" ? 0.4 : 1.0);
    const hp = difficultyRef.current === "hard" ? 160 : difficultyRef.current === "easy" ? 50 : 100;
    enemiesRef.current.push({ mesh: g, speed: spd, health: hp, id });
    setEnemyCount(c => c + 1);
  }, []);

  // Game loop setup
  useEffect(() => {
    if (screen !== "game") return;

    // Spawn enemies
    spawnEnemy();
    const base = difficulty === "easy" ? 12000 : difficulty === "hard" ? 4500 : 7000;
    const spawnInt = setInterval(spawnEnemy, base);

    const handleKey = (e: KeyboardEvent) => {
      if (screenRef.current !== "game") return;
      keysRef.current.add(e.code);
      if (e.code === "KeyE" || e.code === "Tab") {
        e.preventDefault();
        setShowInventory(v => !v);
      }
      if (e.code === "KeyQ") {
        setSelectedMaterial(m => {
          const mats: BuildMaterial[] = ["wood", "stone", "glass"];
          return mats[(mats.indexOf(m) + 1) % mats.length];
        });
      }
      if (e.code === "Digit1") setActiveTool("hand");
      if (e.code === "Digit2") setActiveTool("build");
      if (e.code === "Digit3") setActiveTool("portal");
      if (e.code === "Digit4") setActiveTool("laser");
      if (e.code === "Digit5") setActiveTool("gravity");
      if (e.code === "KeyT") {
        slowRef.current = !slowRef.current;
        setSlowTime(slowRef.current);
        showNotif(slowRef.current ? "⏱ Время замедлено!" : "⏱ Время нормальное");
      }
      if (e.code === "Space" && onGroundRef.current) {
        velYRef.current = 8;
        onGroundRef.current = false;
      }
      if (e.code === "KeyG" && !onGroundRef.current) {
        velYRef.current = 6;
        showNotif("🧗 Прыжок от стены!");
      }
      if (e.code === "Escape") {
        document.exitPointerLock();
        setScreen("menu");
        setIsLocked(false);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.code);

    const handleMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== rendererRef.current?.domElement) return;
      yawRef.current -= e.movementX * 0.002;
      pitchRef.current -= e.movementY * 0.002;
      pitchRef.current = Math.max(-1.25, Math.min(1.25, pitchRef.current));
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement !== rendererRef.current?.domElement) {
        rendererRef.current?.domElement.requestPointerLock();
        return;
      }
      if (showInvRef.current) return;
      const tool = activeToolRef.current;
      if (e.button === 0) {
        if (tool === "build") placeBlock();
        if (tool === "portal") firePortal(false);
        if (tool === "laser") fireLaser();
        if (tool === "gravity") gravityBlast();
      }
      if (e.button === 2) {
        if (tool === "build") removeBlock();
        if (tool === "portal") firePortal(true);
      }
    };

    const handleContextMenu = (e: Event) => e.preventDefault();
    const handlePointerLock = () => {
      const locked = document.pointerLockElement === rendererRef.current?.domElement;
      setIsLocked(locked);
    };

    document.addEventListener("keydown", handleKey);
    document.addEventListener("keyup", handleKeyUp);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("pointerlockchange", handlePointerLock);

    // Animate
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      const rawDelta = Math.min(clockRef.current.getDelta(), 0.05);
      const delta = slowRef.current ? rawDelta * 0.25 : rawDelta;

      const cam = cameraRef.current;
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      if (!cam || !renderer || !scene) return;

      // Day/night
      dayRef.current += delta * 0.025;
      const t = (Math.sin(dayRef.current) + 1) / 2;
      setDayTime(Math.round(t * 24));
      scene.background = new THREE.Color().lerpColors(new THREE.Color(0x050818), new THREE.Color(0x6bb8e8), t);
      const sun = scene.userData.sun as THREE.DirectionalLight;
      if (sun) {
        sun.intensity = 0.2 + t * 2.8;
        sun.position.set(Math.cos(dayRef.current) * 90, Math.sin(dayRef.current) * 90, 40);
      }
      const amb = scene.userData.ambient as THREE.AmbientLight;
      if (amb) amb.intensity = 0.15 + t * 0.7;
      const starMat = scene.userData.starMat as THREE.PointsMaterial;
      if (starMat) starMat.opacity = Math.max(0, 1 - t * 3);

      // Camera
      cam.rotation.order = "YXZ";
      cam.rotation.y = yawRef.current;
      cam.rotation.x = pitchRef.current;

      // Movement
      const speed = 6.5 * delta;
      const fwd = new THREE.Vector3(-Math.sin(yawRef.current), 0, -Math.cos(yawRef.current));
      const rgt = new THREE.Vector3(Math.cos(yawRef.current), 0, -Math.sin(yawRef.current));
      const keys = keysRef.current;
      if (keys.has("KeyW")) playerRef.current.addScaledVector(fwd, speed);
      if (keys.has("KeyS")) playerRef.current.addScaledVector(fwd, -speed);
      if (keys.has("KeyA")) playerRef.current.addScaledVector(rgt, -speed);
      if (keys.has("KeyD")) playerRef.current.addScaledVector(rgt, speed);

      velYRef.current -= 22 * delta;
      playerRef.current.y += velYRef.current * delta;
      if (playerRef.current.y <= 1.7) {
        playerRef.current.y = 1.7;
        velYRef.current = 0;
        onGroundRef.current = true;
      }
      cam.position.copy(playerRef.current);

      // Enemies
      enemiesRef.current.forEach(enemy => {
        const dir = playerRef.current.clone().sub(enemy.mesh.position).setY(0).normalize();
        enemy.mesh.position.addScaledVector(dir, enemy.speed * delta);
        enemy.mesh.lookAt(playerRef.current.clone().setY(enemy.mesh.position.y));
        if (enemy.mesh.position.distanceTo(playerRef.current) < 1.6) {
          setHealth(h => {
            const nh = Math.max(0, h - 8 * delta);
            if (nh <= 0) {
              document.exitPointerLock();
              setScreen("menu");
              setIsLocked(false);
            }
            return nh;
          });
        }
      });

      // Portal teleport
      if (portalARef.current && portalBRef.current) {
        const pa = portalARef.current.position;
        const pb = portalBRef.current.position;
        if (playerRef.current.distanceTo(pa) < 1.3) {
          playerRef.current.copy(pb.clone().add(new THREE.Vector3(0, 1, 0)));
          showNotif("✨ Телепортация через портал!");
        } else if (playerRef.current.distanceTo(pb) < 1.3) {
          playerRef.current.copy(pa.clone().add(new THREE.Vector3(0, 1, 0)));
          showNotif("✨ Телепортация через портал!");
        }
      }

      // Rotate portals
      if (portalARef.current) portalARef.current.rotation.z += delta * 1.8;
      if (portalBRef.current) portalBRef.current.rotation.z += delta * 1.8;

      renderer.render(scene, cam);
    };
    animate();

    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;
      cameraRef.current.aspect = window.innerWidth / window.innerHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      clearInterval(spawnInt);
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("pointerlockchange", handlePointerLock);
    };
  }, [screen, difficulty, spawnEnemy, placeBlock, removeBlock, firePortal, fireLaser, gravityBlast, showNotif]);

  const startGame = () => {
    setHealth(100);
    setBuildProgress(0);
    setPlayerLevel(1);
    setInventory(INVENTORY_ITEMS.map(i => ({ ...i })));
    enemiesRef.current = [];
    blocksRef.current = [];
    portalARef.current = null;
    portalBRef.current = null;
    setPortalAActive(false);
    setPortalBActive(false);
    playerRef.current.set(0, 1.7, 8);
    yawRef.current = 0;
    pitchRef.current = 0;
    velYRef.current = 0;
    setEnemyCount(0);
    setSlowTime(false);
    slowRef.current = false;
    onGroundRef.current = true;
    if (rendererRef.current) {
      rendererRef.current.dispose();
      rendererRef.current.domElement.remove();
      rendererRef.current = null;
    }
    sceneRef.current = null;
    setTimeout(initGame, 50);
  };

  const toolConfig: { id: ActiveTool; icon: string; label: string; key: string }[] = [
    { id: "hand", icon: "Hand", label: "Рука", key: "1" },
    { id: "build", icon: "Hammer", label: "Стройка", key: "2" },
    { id: "portal", icon: "Disc", label: "Портал", key: "3" },
    { id: "laser", icon: "Zap", label: "Лазер", key: "4" },
    { id: "gravity", icon: "Magnet", label: "Гравитация", key: "5" },
  ];

  const hourStr = `${String(dayTime).padStart(2, "0")}:00`;

  return (
    <div className="w-full h-screen overflow-hidden bg-black select-none" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>

      {/* ======= MAIN MENU ======= */}
      {screen === "menu" && (
        <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden"
          style={{ background: "radial-gradient(ellipse at 50% 25%, #162809 0%, #070f03 60%, #000 100%)" }}>
          {/* bg texture */}
          <div className="absolute inset-0 opacity-20 pointer-events-none"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%2322441a' fill-opacity='0.5'%3E%3Cpath d='M40 0L40 80M0 40L80 40' stroke='%2322441a' stroke-width='0.5'/%3E%3C/g%3E%3C/svg%3E\")" }} />

          <div className="relative z-10 flex flex-col items-center gap-8">
            <div className="flex flex-col items-center gap-4">
              <div className="text-8xl" style={{ filter: "drop-shadow(0 0 30px rgba(74,222,128,0.6))", animation: "float 3s ease-in-out infinite" }}>🌲</div>
              <div className="flex flex-col items-center">
                <h1 className="text-6xl font-black text-white tracking-tighter leading-none"
                  style={{ fontFamily: "'Unbounded', sans-serif", textShadow: "0 0 60px rgba(74,222,128,0.5), 0 4px 16px rgba(0,0,0,0.8)" }}>
                  ЛЕСНАЯ
                </h1>
                <h1 className="text-6xl font-black tracking-tighter leading-none"
                  style={{ fontFamily: "'Unbounded', sans-serif", color: "#4ade80", textShadow: "0 0 40px rgba(74,222,128,0.8)" }}>
                  КРЕПОСТЬ
                </h1>
              </div>
              <p className="text-xs tracking-[0.3em] uppercase text-green-400/50">Построй · Выживи · Победи</p>
            </div>

            <div className="flex flex-col gap-3 w-64">
              <button onClick={startGame}
                className="w-full py-4 rounded-2xl font-bold text-sm tracking-widest uppercase transition-all hover:scale-105 active:scale-95"
                style={{ background: "linear-gradient(135deg, #16a34a 0%, #4ade80 100%)", color: "#000", boxShadow: "0 0 40px rgba(74,222,128,0.5), 0 4px 20px rgba(0,0,0,0.5)", fontFamily: "'Unbounded', sans-serif" }}>
                ▶ НАЧАТЬ ИГРУ
              </button>
              <button onClick={() => setScreen("settings")}
                className="w-full py-3.5 rounded-2xl text-sm transition-all hover:scale-105 active:scale-95 hover:bg-white/10"
                style={{ background: "rgba(255,255,255,0.04)", color: "#aaa", border: "1px solid rgba(255,255,255,0.1)" }}>
                ⚙ Настройки
              </button>
              <button onClick={() => setScreen("help")}
                className="w-full py-3.5 rounded-2xl text-sm transition-all hover:scale-105 active:scale-95 hover:bg-white/10"
                style={{ background: "rgba(255,255,255,0.04)", color: "#aaa", border: "1px solid rgba(255,255,255,0.1)" }}>
                ? Справка
              </button>
            </div>

            <div className="flex gap-5 text-xs text-green-400/30">
              <span>Сложность: <span className="text-green-400/60">{difficulty === "easy" ? "Лёгкая" : difficulty === "hard" ? "Сложная" : "Нормальная"}</span></span>
              <span>v1.0</span>
            </div>
          </div>
        </div>
      )}

      {/* ======= SETTINGS ======= */}
      {screen === "settings" && (
        <div className="relative w-full h-full flex items-center justify-center"
          style={{ background: "radial-gradient(ellipse at 50% 50%, #0d1f08 0%, #030a02 100%)" }}>
          <div className="w-full max-w-md bg-black/70 backdrop-blur-xl rounded-3xl border border-green-900/30 p-8"
            style={{ boxShadow: "0 0 80px rgba(74,222,128,0.07), 0 30px 60px rgba(0,0,0,0.5)" }}>
            <h2 className="text-xl font-black text-white mb-6" style={{ fontFamily: "'Unbounded', sans-serif" }}>Настройки</h2>
            <div className="flex gap-1.5 mb-6 bg-white/5 p-1 rounded-xl">
              {(["graphics", "sound", "controls", "difficulty"] as const).map(tab => (
                <button key={tab} onClick={() => setSettingsTab(tab)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ background: settingsTab === tab ? "#16a34a" : "transparent", color: settingsTab === tab ? "#000" : "#666" }}>
                  {tab === "graphics" ? "Графика" : tab === "sound" ? "Звук" : tab === "controls" ? "Управление" : "Сложность"}
                </button>
              ))}
            </div>
            {settingsTab === "graphics" && (
              <div className="space-y-5">
                <div>
                  <label className="text-xs text-green-400/60 mb-2 block">Поле зрения (FOV): <span className="text-green-400">{fov}°</span></label>
                  <input type="range" min={55} max={110} value={fov} onChange={e => setFov(+e.target.value)} className="w-full accent-green-500" />
                </div>
                <div className="text-xs text-white/20 space-y-1">
                  <div>Тени: PCF Soft Shadow Maps</div>
                  <div>Tone Mapping: ACES Filmic</div>
                  <div>Anti-Aliasing: включено</div>
                  <div>Fog: Exponential</div>
                </div>
              </div>
            )}
            {settingsTab === "sound" && (
              <div>
                <label className="text-xs text-green-400/60 mb-2 block">Громкость: <span className="text-green-400">{volume}%</span></label>
                <input type="range" min={0} max={100} value={volume} onChange={e => setVolume(+e.target.value)} className="w-full accent-green-500" />
              </div>
            )}
            {settingsTab === "controls" && (
              <div className="grid grid-cols-2 gap-y-2 gap-x-3 max-h-60 overflow-y-auto">
                {CONTROLS_HELP.map(c => (
                  <div key={c.key} className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-lg bg-green-900/20 text-green-300 text-xs font-mono border border-green-800/30 min-w-14 text-center shrink-0">{c.key}</span>
                    <span className="text-xs text-white/50">{c.desc}</span>
                  </div>
                ))}
              </div>
            )}
            {settingsTab === "difficulty" && (
              <div className="space-y-2.5">
                {(["easy", "normal", "hard"] as const).map(d => (
                  <button key={d} onClick={() => setDifficulty(d)}
                    className="w-full py-3.5 px-4 rounded-xl text-sm text-left transition-all border"
                    style={{ background: difficulty === d ? "rgba(74,222,128,0.1)" : "transparent", color: difficulty === d ? "#4ade80" : "#555", borderColor: difficulty === d ? "rgba(74,222,128,0.4)" : "rgba(255,255,255,0.06)" }}>
                    {d === "easy" ? "🌿 Лёгкая — враги медленные" : d === "normal" ? "⚔️ Нормальная — стандартный баланс" : "🔥 Сложная — враги быстрые и сильные"}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setScreen("menu")}
              className="mt-6 w-full py-3 rounded-xl text-sm text-white/30 hover:text-white/60 transition-all border border-white/8 hover:border-white/20">
              ← Назад в меню
            </button>
          </div>
        </div>
      )}

      {/* ======= HELP ======= */}
      {screen === "help" && (
        <div className="relative w-full h-full flex items-center justify-center overflow-auto py-8"
          style={{ background: "radial-gradient(ellipse at 50% 50%, #0d1f08 0%, #030a02 100%)" }}>
          <div className="w-full max-w-md bg-black/70 backdrop-blur-xl rounded-3xl border border-green-900/30 p-8"
            style={{ boxShadow: "0 0 80px rgba(74,222,128,0.07)" }}>
            <h2 className="text-xl font-black text-white mb-6" style={{ fontFamily: "'Unbounded', sans-serif" }}>Справка</h2>
            <div className="mb-6">
              <h3 className="text-xs font-bold text-green-400/70 uppercase tracking-widest mb-3">Управление</h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {CONTROLS_HELP.map(c => (
                  <div key={c.key} className="flex items-center gap-3">
                    <span className="px-2 py-0.5 rounded-lg bg-green-900/20 text-green-300 text-xs font-mono border border-green-800/30 min-w-16 text-center shrink-0">{c.key}</span>
                    <span className="text-xs text-white/60">{c.desc}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-bold text-green-400/70 uppercase tracking-widest mb-3">Механики</h3>
              <div className="space-y-2.5 text-xs text-white/50">
                <p>🟠🔵 <span className="text-white/70">Порталы</span> — ЛКМ = портал A, ПКМ = портал B. Войди в один — выйди из другого мгновенно.</p>
                <p>🔴 <span className="text-white/70">Лазер</span> — луч на 45м, снимает 40 HP с врагов. Быстро и точно.</p>
                <p>💥 <span className="text-white/70">Гравитация</span> — взрывная волна в радиусе 18м отбрасывает врагов.</p>
                <p>⏱ <span className="text-white/70">Замедление</span> — T замедляет время в 4×. Для тактических решений.</p>
                <p>🧗 <span className="text-white/70">Стены</span> — нажмите G в прыжке для дополнительного отталкивания.</p>
                <p>🏠 <span className="text-white/70">Строительство</span> — Q меняет материал. Стройте в области зелёной сетки.</p>
                <p>👹 <span className="text-white/70">Враги</span> — тёмные существа с красными глазами. Появляются из леса.</p>
              </div>
            </div>
            <button onClick={() => setScreen("menu")}
              className="mt-6 w-full py-3 rounded-xl text-sm text-white/30 hover:text-white/60 transition-all border border-white/8 hover:border-white/20">
              ← Назад в меню
            </button>
          </div>
        </div>
      )}

      {/* ======= GAME ======= */}
      {screen === "game" && (
        <>
          <div ref={mountRef} className="absolute inset-0" />

          {/* Crosshair */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-5 h-5">
              <div className="absolute top-1/2 left-0 w-full h-px bg-white/75 -translate-y-1/2" />
              <div className="absolute left-1/2 top-0 h-full w-px bg-white/75 -translate-x-1/2" />
              <div className="absolute inset-0 rounded-full border border-white/25" />
            </div>
          </div>

          {/* TOP LEFT: Health + Level */}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none">
            <div className="flex items-center gap-2 bg-black/55 backdrop-blur px-3 py-2 rounded-xl border border-white/10">
              <span className="text-sm">❤️</span>
              <div className="w-24 h-1.5 bg-white/15 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${health}%`, background: health > 60 ? "#22c55e" : health > 30 ? "#eab308" : "#ef4444" }} />
              </div>
              <span className="text-xs text-white/60 font-mono w-7">{Math.round(health)}</span>
            </div>
            <div className="flex items-center gap-2 bg-black/55 backdrop-blur px-3 py-1.5 rounded-xl border border-white/10">
              <span className="text-xs">⭐</span>
              <span className="text-xs text-white/70">Ур. {playerLevel}</span>
            </div>
          </div>

          {/* TOP CENTER: Day/Night + Slow */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 pointer-events-none">
            <div className="flex items-center gap-2 bg-black/55 backdrop-blur px-3 py-2 rounded-xl border border-white/10">
              <span className="text-sm">{dayTime >= 6 && dayTime < 20 ? "☀️" : "🌙"}</span>
              <span className="text-xs text-white/70 font-mono">{hourStr}</span>
            </div>
            {slowTime && (
              <div className="bg-blue-900/70 backdrop-blur px-3 py-1 rounded-xl border border-blue-400/30">
                <span className="text-xs text-blue-300 font-mono">⏱ ×0.25 СЛОУ</span>
              </div>
            )}
          </div>

          {/* TOP RIGHT: Enemies */}
          <div className="absolute top-3 right-3 flex flex-col gap-1.5 pointer-events-none items-end">
            <div className="flex items-center gap-2 bg-black/55 backdrop-blur px-3 py-2 rounded-xl border border-white/10">
              <span className="text-sm">👹</span>
              <span className="text-xs text-white/60">×{enemyCount}</span>
            </div>
          </div>

          {/* BUILD PROGRESS (below center) */}
          <div className="absolute top-16 left-1/2 -translate-x-1/2 pointer-events-none">
            <div className="flex flex-col items-center gap-1.5 bg-black/55 backdrop-blur px-5 py-2.5 rounded-xl border border-white/10">
              <span className="text-xs text-white/40 tracking-wider uppercase">Прогресс дома</span>
              <div className="flex items-center gap-2">
                <div className="w-44 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${buildProgress}%`, background: "linear-gradient(90deg, #15803d, #4ade80)" }} />
                </div>
                <span className="text-xs text-green-400 font-mono w-10">{buildProgress}%</span>
              </div>
            </div>
          </div>

          {/* TOOL BAR */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2 pointer-events-auto">
            {toolConfig.map(tool => (
              <button key={tool.id} onClick={() => setActiveTool(tool.id)}
                className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-2xl transition-all duration-200 hover:scale-110 active:scale-95"
                style={{
                  background: activeTool === tool.id ? "rgba(74,222,128,0.18)" : "rgba(0,0,0,0.65)",
                  border: activeTool === tool.id ? "1px solid rgba(74,222,128,0.6)" : "1px solid rgba(255,255,255,0.1)",
                  backdropFilter: "blur(12px)",
                  boxShadow: activeTool === tool.id ? "0 0 20px rgba(74,222,128,0.35)" : "none",
                }}>
                <span className="text-xs font-mono" style={{ color: activeTool === tool.id ? "#86efac" : "rgba(255,255,255,0.25)" }}>{tool.key}</span>
                <Icon name={tool.icon} size={20} className={activeTool === tool.id ? "text-green-400" : "text-white/50"} />
                <span className="text-xs" style={{ color: activeTool === tool.id ? "#4ade80" : "rgba(255,255,255,0.35)" }}>{tool.label}</span>
              </button>
            ))}
          </div>

          {/* MATERIAL BAR (build only) */}
          {activeTool === "build" && (
            <div className="absolute bottom-28 left-1/2 -translate-x-1/2 flex gap-2 pointer-events-auto">
              {inventory.map(item => (
                <button key={item.id} onClick={() => setSelectedMaterial(item.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all hover:scale-105 active:scale-95"
                  style={{
                    background: selectedMaterial === item.id ? `${item.color}22` : "rgba(0,0,0,0.6)",
                    border: `1px solid ${selectedMaterial === item.id ? item.color + "80" : "rgba(255,255,255,0.08)"}`,
                    backdropFilter: "blur(12px)",
                    boxShadow: selectedMaterial === item.id ? `0 0 15px ${item.color}40` : "none",
                  }}>
                  <span className="text-xl">{item.emoji}</span>
                  <div>
                    <div className="text-xs text-white/80">{item.label}</div>
                    <div className="text-xs font-mono" style={{ color: item.color }}>×{item.count}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* PORTAL STATUS */}
          {activeTool === "portal" && (
            <div className="absolute bottom-28 left-1/2 -translate-x-1/2 flex gap-3 pointer-events-none">
              {[
                { label: "Портал A (ЛКМ)", active: portalAActive, color: "#ff6600" },
                { label: "Портал B (ПКМ)", active: portalBActive, color: "#0088ff" },
              ].map(p => (
                <div key={p.label} className="flex items-center gap-2 bg-black/65 backdrop-blur px-3 py-2 rounded-xl border"
                  style={{ borderColor: p.active ? p.color + "70" : "rgba(255,255,255,0.1)" }}>
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: p.active ? p.color : "#333", boxShadow: p.active ? `0 0 8px ${p.color}` : "none" }} />
                  <span className="text-xs text-white/60">{p.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* INVENTORY */}
          {showInventory && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/75 backdrop-blur-md pointer-events-auto"
              onClick={e => { if (e.target === e.currentTarget) setShowInventory(false); }}>
              <div className="bg-black/85 rounded-3xl border border-green-900/30 p-6 w-80"
                style={{ boxShadow: "0 0 80px rgba(74,222,128,0.1), 0 30px 60px rgba(0,0,0,0.6)" }}>
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-base font-black text-white" style={{ fontFamily: "'Unbounded', sans-serif" }}>Инвентарь</h3>
                  <button onClick={() => setShowInventory(false)} className="text-white/30 hover:text-white transition-colors">
                    <Icon name="X" size={16} />
                  </button>
                </div>
                <div className="space-y-2">
                  {inventory.map(item => (
                    <button key={item.id}
                      onClick={() => { setSelectedMaterial(item.id); setActiveTool("build"); setShowInventory(false); }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl transition-all hover:scale-101 text-left"
                      style={{
                        background: selectedMaterial === item.id ? `${item.color}18` : "rgba(255,255,255,0.03)",
                        border: `1px solid ${selectedMaterial === item.id ? item.color + "55" : "rgba(255,255,255,0.06)"}`,
                      }}>
                      <span className="text-2xl">{item.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white/85">{item.label}</div>
                        <div className="w-full h-1 bg-white/10 rounded-full mt-1.5">
                          <div className="h-full rounded-full" style={{ width: `${(item.count / 64) * 100}%`, background: item.color }} />
                        </div>
                      </div>
                      <span className="text-sm font-mono font-bold shrink-0" style={{ color: item.color }}>×{item.count}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-xs text-white/20 text-center">E / Tab — закрыть</p>
              </div>
            </div>
          )}

          {/* NOTIFICATION */}
          {notification && (
            <div className="absolute top-1/2 left-1/2 pointer-events-none z-50"
              style={{ transform: "translate(-50%, -50%)", animation: "notifAnim 2.5s ease forwards" }}>
              <div className="bg-black/85 backdrop-blur px-6 py-3 rounded-2xl border border-white/15 text-white text-sm whitespace-nowrap"
                style={{ boxShadow: "0 8px 30px rgba(0,0,0,0.5)" }}>
                {notification}
              </div>
            </div>
          )}

          {/* CLICK TO PLAY overlay */}
          {!isLocked && !showInventory && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20">
              <div className="bg-black/80 backdrop-blur px-8 py-5 rounded-2xl border border-white/15 flex flex-col items-center gap-2">
                <span className="text-2xl">🖱</span>
                <p className="text-white/90 text-sm">Нажмите для захвата мыши</p>
                <p className="text-white/35 text-xs">Esc — выйти в меню</p>
              </div>
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-12px); }
        }
        @keyframes notifAnim {
          0% { opacity: 0; transform: translate(-50%, calc(-50% - 10px)) scale(0.85); }
          12% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          70% { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%, calc(-50% + 5px)) scale(0.95); }
        }
      `}</style>
    </div>
  );
}