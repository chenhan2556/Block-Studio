import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';

const STORAGE_KEY = 'block-studio-model-v1';
const MAX_BLOCK_COUNT = 500;
const COLORS = ['#fa816b', '#f4bc58', '#7da6ed', '#6cc5a5', '#b08ce0', '#ee91b6'];
const BLOCK_NEIGHBORS = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];
const starterBlocks = [
  { x: 0, y: 0, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 1, y: 1, z: 0 },
  { x: 0, y: 0, z: 1 },
];
const samples = {
  starter: starterBlocks,
  stairs: [
    { x: -2, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 },
    { x: -1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 2, z: 0 },
  ],
  tower: [
    { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 },
    { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 1 }, { x: 1, y: 1, z: 1 },
    { x: 0, y: 2, z: 0 }, { x: 1, y: 2, z: 0 }, { x: 0, y: 2, z: 1 }, { x: 1, y: 2, z: 1 },
    { x: 0, y: 3, z: 0 }, { x: 1, y: 3, z: 0 }, { x: 0, y: 3, z: 1 }, { x: 1, y: 3, z: 1 },
  ],
};

const state = {
  blocks: loadSavedBlocks() ?? starterBlocks.map((block) => ({ ...block })),
  selected: null,
  frontPosition: null,
  undo: [],
  redo: [],
};
const blockGeometry = new THREE.BoxGeometry(0.96, 0.96, 0.96);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#f6f7fb');
scene.add(new THREE.HemisphereLight('#ffffff', '#dce3f0', 2.15));
const keyLight = new THREE.DirectionalLight('#ffffff', 2.5);
keyLight.position.set(6, 9, 7);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight('#cbdcff', 0.85);
fillLight.position.set(-5, 4, -5);
scene.add(fillLight);
const grid = new THREE.GridHelper(32, 32, '#cdd5e3', '#e4e8f0');
grid.position.y = -0.025;
scene.add(grid);

const mainCanvas = document.querySelector('#main-canvas');
const mainRenderer = new THREE.WebGLRenderer({ canvas: mainCanvas, antialias: true, alpha: false });
mainRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
mainRenderer.outputColorSpace = THREE.SRGBColorSpace;
mainRenderer.toneMapping = THREE.ACESFilmicToneMapping;
mainRenderer.toneMappingExposure = 1.25;
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.position.set(8, 7, 9);
const controls = new OrbitControls(camera, mainCanvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3;
controls.maxDistance = 80;
controls.maxPolarAngle = Math.PI * 0.485;

const viewConfigs = [
  { canvas: document.querySelector('#front-canvas'), direction: new THREE.Vector3(0, 0.04, 1), up: new THREE.Vector3(0, 1, 0), horizontal: 'x', vertical: 'y', overlay: document.querySelector('#front-projection') },
  { canvas: document.querySelector('#right-canvas'), direction: new THREE.Vector3(1, 0.04, 0), up: new THREE.Vector3(0, 1, 0), horizontal: 'z', vertical: 'y', overlay: document.querySelector('#right-projection') },
  { canvas: document.querySelector('#top-canvas'), direction: new THREE.Vector3(0, 1, 0.001), up: new THREE.Vector3(0, 0, -1), horizontal: 'x', vertical: 'z', overlay: document.querySelector('#top-projection') },
].map((config) => ({
  ...config,
  renderer: new THREE.WebGLRenderer({ canvas: config.canvas, antialias: true, alpha: false }),
  camera: new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 100),
}));
viewConfigs.forEach(({ renderer }) => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
});

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(16, 16),
  new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const blockMeshes = new Map();
let toastTimer;
let saveTimer;

function loadSavedBlocks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved) && saved.every(isValidBlock) && saved.length <= MAX_BLOCK_COUNT) return saved;
  } catch (error) {
    console.warn('無法讀取已儲存的積木作品。', error);
  }
  return null;
}

function isValidBlock(block) {
  return block && ['x', 'y', 'z'].every((axis) => Number.isInteger(block[axis])) && block.y >= 0;
}

function blockKey(block) {
  return `${block.x},${block.y},${block.z}`;
}

function generateRandomBlocks(count) {
  const blocks = [{ x: 0, y: 0, z: 0 }];
  const occupied = new Set([blockKey(blocks[0])]);
  const maxHorizontal = Math.max(2, Math.ceil(Math.cbrt(count) * 1.5));
  const maxHeight = Math.max(2, Math.ceil(Math.cbrt(count) * 1.5));

  while (blocks.length < count) {
    const frontier = new Map();
    blocks.forEach((block) => {
      BLOCK_NEIGHBORS.forEach((offset) => {
        const candidate = { x: block.x + offset.x, y: block.y + offset.y, z: block.z + offset.z };
        if (
          candidate.y < 0 ||
          candidate.y >= maxHeight ||
          Math.abs(candidate.x) > maxHorizontal ||
          Math.abs(candidate.z) > maxHorizontal
        ) return;
        const key = blockKey(candidate);
        if (!occupied.has(key)) frontier.set(key, (frontier.get(key) ?? 0) + 1);
      });
    });

    const candidates = [...frontier.entries()];
    const totalWeight = candidates.reduce((sum, [, neighbors]) => sum + neighbors * neighbors, 0);
    let choice = Math.random() * totalWeight;
    let selected = candidates[candidates.length - 1];
    for (const candidate of candidates) {
      choice -= candidate[1] * candidate[1];
      if (choice < 0) {
        selected = candidate;
        break;
      }
    }

    const [key] = selected;
    const [x, y, z] = key.split(',').map(Number);
    blocks.push({ x, y, z });
    occupied.add(key);
  }

  return blocks;
}

function saveHistory() {
  state.undo.push(state.blocks.map((block) => ({ ...block })));
  if (state.undo.length > 60) state.undo.shift();
  state.redo.length = 0;
  updateHistoryButtons();
}

function updateHistoryButtons() {
  document.querySelector('#undo-button').disabled = state.undo.length === 0;
  document.querySelector('#redo-button').disabled = state.redo.length === 0;
}

function queueSave() {
  document.querySelector('#save-status').textContent = '未儲存變更';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.blocks));
      document.querySelector('#save-status').textContent = '已儲存';
    } catch (error) {
      document.querySelector('#save-status').textContent = '儲存失敗';
      showToast('無法儲存作品，請檢查瀏覽器儲存空間。');
      console.error('無法自動儲存積木作品。', error);
    }
  }, 450);
}

function renderBlocks() {
  for (const mesh of blockMeshes.values()) {
    scene.remove(mesh);
    mesh.material.dispose();
    mesh.children[0]?.geometry.dispose();
    mesh.children[0]?.material.dispose();
  }
  blockMeshes.clear();
  state.blocks.forEach((block, index) => {
    const key = blockKey(block);
    const selected = key === state.selected;
    const material = new THREE.MeshStandardMaterial({
      color: COLORS[(block.y + index) % COLORS.length],
      roughness: 0.43,
      metalness: 0.02,
      emissive: selected ? '#283b70' : '#000000',
      emissiveIntensity: selected ? 0.2 : 0,
    });
    const mesh = new THREE.Mesh(blockGeometry, material);
    mesh.position.set(block.x, block.y + 0.5, block.z);
    mesh.userData.blockKey = key;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(blockGeometry),
      new THREE.LineBasicMaterial({ color: selected ? '#405a94' : '#65708a', transparent: true, opacity: selected ? 0.75 : 0.38 }),
    );
    mesh.add(edges);
    scene.add(mesh);
    blockMeshes.set(key, mesh);
  });
  document.querySelector('#block-count').textContent = state.blocks.length;
  fitViews();
}

function bounds() {
  if (state.blocks.length === 0) return { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 1, z: 1 } };
  return {
    min: {
      x: Math.min(...state.blocks.map((block) => block.x)),
      y: Math.min(...state.blocks.map((block) => block.y)),
      z: Math.min(...state.blocks.map((block) => block.z)),
    },
    max: {
      x: Math.max(...state.blocks.map((block) => block.x)),
      y: Math.max(...state.blocks.map((block) => block.y)),
      z: Math.max(...state.blocks.map((block) => block.z)),
    },
  };
}

function fitViews() {
  const { min, max } = bounds();
  const center = new THREE.Vector3((min.x + max.x) / 2, (min.y + max.y + 1) / 2, (min.z + max.z) / 2);
  const span = Math.max(max.x - min.x + 2, max.y - min.y + 2, max.z - min.z + 2, 3);
  const cameraOffset = camera.position.clone().sub(controls.target);
  controls.target.copy(center);
  if (cameraOffset.length() < span * 1.65) cameraOffset.setLength(span * 1.65);
  camera.position.copy(center).add(cameraOffset);
  viewConfigs.forEach(({ camera: viewCamera, direction, up, canvas, horizontal, vertical }) => {
    const width = Math.max(max[horizontal] - min[horizontal] + 2.3, 2.8);
    const height = Math.max(max[vertical] - min[vertical] + 2.3, 2.8);
    const aspect = Math.max(canvas.clientWidth, 1) / Math.max(canvas.clientHeight, 1);
    const viewHeight = Math.max(height, width / aspect);
    viewCamera.left = (-viewHeight * aspect) / 2;
    viewCamera.right = (viewHeight * aspect) / 2;
    viewCamera.top = viewHeight / 2;
    viewCamera.bottom = -viewHeight / 2;
    viewCamera.up.copy(up);
    viewCamera.position.copy(center).addScaledVector(direction, span * 2.5 + 6);
    viewCamera.lookAt(center);
    viewCamera.updateProjectionMatrix();
  });
}

function resizeRenderer(renderer, canvas) {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  return { width, height };
}

function animate() {
  controls.update();
  const { width, height } = resizeRenderer(mainRenderer, mainCanvas);
  if (camera.aspect !== width / height) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  mainRenderer.render(scene, camera);
  viewConfigs.forEach(({ renderer, camera: viewCamera, canvas }) => {
    resizeRenderer(renderer, canvas);
    renderer.render(scene, viewCamera);
  });
  updateProjectionMarkers();
  requestAnimationFrame(animate);
}

function updateProjectionMarkers() {
  if (!state.frontPosition || document.querySelector('#orthographic-grid').hidden) return;
  const { x, y, z } = state.frontPosition;
  const position = new THREE.Vector3(x, y + 0.5, z ?? 0);
  viewConfigs.forEach(({ camera: viewCamera, overlay }, index) => {
    const projected = position.clone().project(viewCamera);
    const left = `${((projected.x + 1) / 2) * 100}%`;
    const top = `${((1 - projected.y) / 2) * 100}%`;
    const [horizontal, vertical, point] = overlay.children;
    overlay.hidden = false;
    const exactBlock = z !== null && z !== undefined;
    horizontal.hidden = !exactBlock && index === 2;
    vertical.hidden = !exactBlock && index === 1;
    horizontal.style.top = top;
    vertical.style.left = left;
    point.style.left = left;
    point.style.top = top;
    horizontal.classList.toggle('projection-exact', exactBlock || index === 0);
    vertical.classList.toggle('projection-exact', exactBlock || index === 0);
    point.hidden = !exactBlock && index !== 0;
  });
}

function updateProjectionHelp() {
  const help = document.querySelector('#projection-help');
  if (!state.frontPosition) {
    help.textContent = document.querySelector('#show-views').checked
      ? '點選前視圖中的積木或格點，即可在其他視圖標示對應位置。'
      : '勾選顯示三視圖；點選前視圖中的積木或格點，可查看對應位置。';
    return;
  }
  const { x, y, z } = state.frontPosition;
  help.textContent = z === null
    ? `前視位置：X ${x}、高度 ${y}。右視圖標示高度，俯視圖標示左右位置；選取積木可定位深度。`
    : `已定位積木：X ${x}、高度 ${y}、深度 ${z}。三視圖已標示其對應位置。`;
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
}

function commitBlocks(blocks, selected = null) {
  saveHistory();
  state.blocks = blocks;
  state.selected = selected;
  const selectedBlock = blocks.find((block) => blockKey(block) === selected);
  state.frontPosition = selectedBlock ? { ...selectedBlock } : null;
  renderBlocks();
  updateProjectionHelp();
  queueSave();
}

function selectBlock(key) {
  state.selected = key;
  const block = state.blocks.find((item) => blockKey(item) === key);
  state.frontPosition = block ? { ...block } : null;
  renderBlocks();
  updateProjectionHelp();
}

function addAdjacent(block, direction) {
  const next = { x: block.x + direction.x, y: block.y + direction.y, z: block.z + direction.z };
  if (next.y < 0 || state.blocks.some((item) => blockKey(item) === blockKey(next))) return false;
  commitBlocks([...state.blocks, next], blockKey(next));
  return true;
}

function moveSelected(dx, dy, dz) {
  const selected = state.blocks.find((block) => blockKey(block) === state.selected);
  if (!selected) {
    showToast('請先點選一塊積木。');
    return;
  }
  const moved = { x: selected.x + dx, y: selected.y + dy, z: selected.z + dz };
  if (moved.y < 0 || state.blocks.some((block) => blockKey(block) === blockKey(moved))) {
    showToast(moved.y < 0 ? '積木不能移到地面以下。' : '這個位置已經有積木了。');
    return;
  }
  commitBlocks(state.blocks.map((block) => blockKey(block) === state.selected ? moved : block), blockKey(moved));
}

mainCanvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const rect = mainCanvas.getBoundingClientRect();
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects([...blockMeshes.values()], false)[0];
  if (hit) selectBlock(hit.object.userData.blockKey);
});

const frontCanvas = document.querySelector('#front-canvas');
frontCanvas.addEventListener('click', (event) => {
  const frontView = viewConfigs[0];
  const rect = frontCanvas.getBoundingClientRect();
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, frontView.camera);
  const hit = raycaster.intersectObjects([...blockMeshes.values()], false)[0];
  if (hit) {
    selectBlock(hit.object.userData.blockKey);
    return;
  }
  const point = new THREE.Vector3(pointer.x, pointer.y, 0).unproject(frontView.camera);
  state.frontPosition = { x: Math.round(point.x), y: Math.max(0, Math.round(point.y - 0.5)), z: null };
  state.selected = null;
  renderBlocks();
  updateProjectionHelp();
});

mainCanvas.addEventListener('dblclick', (event) => {
  const rect = mainCanvas.getBoundingClientRect();
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects([...blockMeshes.values()], false)[0];
  if (!hit || !hit.face) return;
  const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  const axis = ['x', 'y', 'z'].reduce((best, key) => Math.abs(normal[key]) > Math.abs(normal[best]) ? key : best, 'x');
  const direction = { x: 0, y: 0, z: 0 };
  direction[axis] = Math.sign(normal[axis]);
  const block = state.blocks.find((item) => blockKey(item) === hit.object.userData.blockKey);
  if (block && !addAdjacent(block, direction)) showToast('這個位置已有積木，或低於地面。');
});

document.querySelector('#add-button').addEventListener('click', () => {
  const selected = state.blocks.find((block) => blockKey(block) === state.selected);
  const anchor = selected ?? state.blocks[state.blocks.length - 1] ?? { x: 0, y: 0, z: 0 };
  const directions = [{ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }];
  const direction = directions.find((offset) => !state.blocks.some((block) => blockKey(block) === blockKey({ x: anchor.x + offset.x, y: anchor.y + offset.y, z: anchor.z + offset.z })));
  if (direction) addAdjacent(anchor, direction);
  else showToast('周圍沒有空位，請移動或選取其他積木。');
});

const randomCountInput = document.querySelector('#random-count');
randomCountInput.addEventListener('input', () => randomCountInput.setCustomValidity(''));
document.querySelector('#generate-button').addEventListener('click', () => {
  const count = randomCountInput.valueAsNumber;
  if (!Number.isInteger(count) || count < 1 || count > MAX_BLOCK_COUNT) {
    randomCountInput.setCustomValidity(`請輸入 1 到 ${MAX_BLOCK_COUNT} 之間的整數。`);
    randomCountInput.reportValidity();
    showToast(`請輸入 1 到 ${MAX_BLOCK_COUNT} 之間的整數。`);
    return;
  }
  randomCountInput.setCustomValidity('');
  commitBlocks(generateRandomBlocks(count), null);
  document.querySelector('#camera-reset').click();
  showToast(`已隨機生成 ${count} 個相連積木，三視圖已同步更新。`);
});

document.querySelector('#remove-button').addEventListener('click', () => {
  if (!state.selected) {
    showToast('請先點選要刪除的積木。');
    return;
  }
  commitBlocks(state.blocks.filter((block) => blockKey(block) !== state.selected), null);
});

document.querySelectorAll('[data-move]').forEach((button) => {
  button.addEventListener('click', () => {
    const [x, y, z] = button.dataset.move.split(',').map(Number);
    moveSelected(x, y, z);
  });
});

document.querySelector('#undo-button').addEventListener('click', () => {
  if (!state.undo.length) return;
  state.redo.push(state.blocks.map((block) => ({ ...block })));
  state.blocks = state.undo.pop();
  state.selected = null;
  renderBlocks();
  queueSave();
  updateHistoryButtons();
});

document.querySelector('#redo-button').addEventListener('click', () => {
  if (!state.redo.length) return;
  state.undo.push(state.blocks.map((block) => ({ ...block })));
  state.blocks = state.redo.pop();
  state.selected = null;
  renderBlocks();
  queueSave();
  updateHistoryButtons();
});

document.querySelector('#reset-button').addEventListener('click', () => {
  commitBlocks(starterBlocks.map((block) => ({ ...block })), null);
  showToast('已重設為初始造型。');
});

document.querySelector('#save-button').addEventListener('click', () => {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.blocks));
    document.querySelector('#save-status').textContent = '已儲存';
    showToast('作品已儲存到這台裝置。');
  } catch (error) {
    document.querySelector('#save-status').textContent = '儲存失敗';
    showToast('無法儲存作品，請檢查瀏覽器儲存空間。');
    console.error('無法儲存積木作品。', error);
  }
});

document.querySelector('#camera-reset').addEventListener('click', () => {
  camera.position.set(8, 7, 9);
  fitViews();
  showToast('已重設立體工作區視角。');
});

document.querySelector('#show-views').addEventListener('change', (event) => {
  const views = document.querySelector('#orthographic-grid');
  const enabled = event.currentTarget.checked;
  views.hidden = !enabled;
  updateProjectionHelp();
  if (enabled) requestAnimationFrame(fitViews);
});

function switchPage(page) {
  document.querySelectorAll('.nav-link').forEach((button) => button.classList.toggle('active', button.dataset.page === page));
  document.querySelectorAll('.page').forEach((section) => section.classList.toggle('active', section.id === `page-${page}`));
  if (page === 'editor') requestAnimationFrame(fitViews);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.nav-link').forEach((button) => button.addEventListener('click', () => switchPage(button.dataset.page)));
document.querySelectorAll('[data-go-editor]').forEach((button) => button.addEventListener('click', () => switchPage('editor')));
document.querySelectorAll('[data-sample]').forEach((button) => {
  button.addEventListener('click', () => {
    const sample = samples[button.dataset.sample];
    if (!sample) return;
    commitBlocks(sample.map((block) => ({ ...block })), null);
    switchPage('editor');
    showToast('範例已載入，可以開始編輯。');
  });
});

controls.addEventListener('start', () => {
  document.querySelector('.canvas-tip').classList.add('dismissed');
});
renderBlocks();
animate();
