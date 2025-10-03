(() => {
  // ========== Config ==========
  const TILESETS = ['./assets/sprites/tileset.png']; // dodaj kolejne ścieżki gdy będziesz miał więcej
  const TILE_TYPES = [
    { name: 'ground', value: 0 },
    { name: 'wall',   value: 1 },
    { name: 'ice',    value: 2 },
    { name: 'ledge',  value: 3 },
    { name: 'water',  value: 4 },
    { name: 'lava',   value: 5 },
    { name: 'decor',  value: 6 }
  ];
  // flags in A nibble: bit0 flipX, bit1 flipY, bit2 rot90, bit3 reserved
  const FLAG = { FLIP_X:1, FLIP_Y:2, ROT_90:4 };

  const VISUAL_LAYERS = ['ground','details','details2','ceiling','ceiling2'];
  const ALL_LAYERS = [...VISUAL_LAYERS, 'scripts'];

  // ==========/ State ==========
  const state = {
    mapW: 32, mapH: 18, tileSize: 32, zoom: 1,
    activeLayer: 'ground',
    ghostOther: true, showGrid: true,
    tool: 'pencil', fillShape: true,
    brush: { tileX: 0, tileY: 0, typeB: 0, flagsA: 0 },
    tileset: { url: TILESETS[0], img: null, cols: 0, rows: 0 },

    project: { maps: [], current: 0, variables: [] },
    layers: { ground: null, details: null, details2: null, ceiling: null, ceiling2: null },
    scripts: [],             // [{kind, x, y, props}]
    selectedScript: null,    // {x,y} (ostatnio kliknięty/pipetowany)
    scriptBrush: { kind: 'script', props: {} },

    mouseDown: false, mouseButton: 0,
    shapeDrag: { active:false, startX:0, startY:0, endX:0, endY:0 },
    preview: { active:false, cells:[], erase:false },
    dragScript: { active:false, origX:0, origY:0 },
    history: { undo: [], redo: [], current: null, changeIndex: null, limit: 25 },

    // Overlay/Variables
    ovOpen: false,
    ovSpriteImgCache: new Map(), // url -> Image
    varsLoaded: false,
    vars: [],           // [{id, name, type: 'int'|'bool'|'float'|'enum'|'enum_flags', options?: string[], default: any}]
    varsFilter: { q:'', type:'' },
  };

  // ==========/ DOM refs ==========
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));

  const mapCanvas = $('#mapCanvas');
  const mapCtx = mapCanvas.getContext('2d');
  const pickerCanvas = $('#pickerCanvas');
  const pickerCtx = pickerCanvas.getContext('2d');
  const pickedCanvas = $('#pickedTileCanvas');
  const pickedCtx = pickedCanvas.getContext('2d');

  const tilesetSelect = $('#tilesetSelect');
  const tileSizeInput = $('#tileSize');
  const typeSelect = $('#typeSelect');
  const flagFlipX = $('#flagFlipX');
  const flagFlipY = $('#flagFlipY');
  const flagRot90 = $('#flagRot90');

  const mapWInput = $('#mapW');
  const mapHInput = $('#mapH');
  const applySizeBtn = $('#applySize');

  const zoomRange = $('#zoomRange');
  const zoomLabel = $('#zoomLabel');
  const ghostOther = $('#ghostOther');
  const showGrid = $('#showGrid');

  const saveJsonBtn = $('#saveJsonBtn');
  const loadJsonInput = $('#loadJsonInput');
  const clearLayerBtn = $('#clearLayerBtn');
  const mapNameInput = $('#mapName');

  const posLabel = $('#posLabel');
  const tileLabel = $('#tileLabel');
  const layerLabel = $('#layerLabel');
  const tilesetName = $('#tilesetName');
  const pickedLabel = $('#pickedLabel');
  const pickedTypeLabel = $('#pickedTypeLabel');
  const pickedFlagsLabel = $('#pickedFlagsLabel');

  const undoBtn = $('#undoBtn');
  const redoBtn = $('#redoBtn');

  const fillWrap = $('#fillWrap');
  const fillShape = $('#fillShape');

  // Scripts panel (toolbar)
  const scriptTools = $('#scriptTools');
  const scriptProps = $('#scriptProps');

  // Project UI
  const mapsList = $('#mapsList');
  const newMapBtn = $('#newMapBtn');
  const delMapBtn = $('#delMapBtn');
  const renameMapBtn = $('#renameMapBtn');
  const saveProjectBtn = $('#saveProjectBtn');
  const loadProjectInput = $('#loadProjectInput');

  const openScriptEditorBtn = $('#openScriptEditorBtn');

  // Overlay (RPGMaker-like) — referencje mogą być null, jeśli nie używasz overlayu
  const ov = $('#scriptOverlay');
  const ovSave = $('#scriptOvSave');
  const ovClose = $('#scriptOvClose');
  const spritePreview = $('#spritePreview');
  const spriteUseToggle = $('#spriteUseToggle');
  const spriteSheetSelect = $('#spriteSheetSelect');
  const spriteFrameX = $('#spriteFrameX');
  const spriteFrameY = $('#spriteFrameY');
  const spriteAnimSpeed = $('#spriteAnimSpeed');
  const spriteDir = $('#spriteDir');
  const spriteLoop = $('#spriteLoop');
  const spriteGrid = $('#spriteGrid');
  const flowList = $('#flowList');
  const actionAddSel = $('#actionAddSel');
  const actionAddBtn = $('#actionAddBtn');
  const actionCollapseAll = $('#actionCollapseAll');
  const actionExpandAll = $('#actionExpandAll');
  const actionClear = $('#actionClear');

  // Variables panel
  const varsSearch = $('#varsSearch');
  const varsTypeFilter = $('#varsTypeFilter');
  const varsResetFilter = $('#varsResetFilter');
  const varsAddBtn = $('#varsAddBtn');
  const varsExportBtn = $('#varsExportBtn');
  const varsImportInput = $('#varsImportInput');
  const varsTableBody = $('#varsTableBody');

  // Toast / modal (opcjonalnie)
  const toast = $('#toast');

  // ==========/ Init ==========
  boot();

  function boot(){
    initTilesetSelect();
    initTypeSelect();
    bindUI();
    resizeMap(state.mapW, state.mapH);
    resizeMapCanvas();
    updatePickedLabels();
    loadTileset(state.tileset.url);
    // pokaż panel projektu od razu (potem loadTileset i tak odświeży)
    initProjectIfEmpty();
    refreshMapsList();

    zoomLabel.textContent = `x${state.zoom}`;
    updateUndoRedoButtons();
    initOverlayUI(); // bezpieczne nawet, gdy overlayu brak (guardy w funkcji)
  }

  // ==========/ UI wiring ==========
  function bindUI(){
    // Layer switch
    $$('input[name="layer"]').forEach(r => {
      r.addEventListener('change', () => {
        state.activeLayer = r.value;
        layerLabel.textContent = state.activeLayer;
        const ceilingMode = (state.activeLayer === 'ceiling' || state.activeLayer === 'ceiling2');
        const scriptsMode = (state.activeLayer === 'scripts');
        typeSelect.disabled = ceilingMode || scriptsMode;
        flagFlipX.disabled = scriptsMode;
        flagFlipY.disabled = scriptsMode;
        flagRot90.disabled = scriptsMode;

        // tools availability on Scripts
        const toolInputs = $$('input[name="tool"]');
        toolInputs.forEach(inp => inp.disabled = scriptsMode && inp.value!=='pencil');
        if (scriptsMode) {
          state.tool = 'pencil';
          const pencil = toolInputs.find(i=>i.value==='pencil');
          if (pencil) pencil.checked = true;
        }
        fillWrap.style.display = (state.tool==='rect' || state.tool==='circle') && !scriptsMode ? '' : 'none';
        scriptTools && (scriptTools.style.display = scriptsMode ? '' : 'none');
        state.preview.active=false;
        render();
      });
    });

    // Tools
    $$('input[name="tool"]').forEach(t => {
      t.addEventListener('change', () => {
        state.tool = t.value;
        fillWrap.style.display = (state.tool==='rect' || state.tool==='circle') && state.activeLayer!=='scripts' ? '' : 'none';
        state.preview.active=false;
        render();
      });
    });
    fillShape.addEventListener('change', () => { state.fillShape = fillShape.checked; render(); });

    ghostOther.addEventListener('change', () => { state.ghostOther = ghostOther.checked; render(); });
    showGrid.addEventListener('change', () => { state.showGrid = showGrid.checked; render(); });

    // Type/flags
    [flagFlipX, flagFlipY, flagRot90].forEach(chk => chk.addEventListener('change', () => {
      state.brush.flagsA = (flagFlipX.checked?FLAG.FLIP_X:0) | (flagFlipY.checked?FLAG.FLIP_Y:0) | (flagRot90.checked?FLAG.ROT_90:0);
      updatePickedLabels();
      renderPickedPreview();
    }));
    typeSelect.addEventListener('change', () => {
      state.brush.typeB = parseInt(typeSelect.value,10) || 0;
      updatePickedLabels();
    });

    // Tileset
    tileSizeInput.addEventListener('change', () => {
      const v = clamp(parseInt(tileSizeInput.value,10)||32, 4, 128);
      state.tileSize = v; tileSizeInput.value = v;
      computeTilesetGrid();
      drawPicker();
      resizeMapCanvas();
      render();
      renderPickedPreview();
      // refresh overlay sprite thumbnails if opened
      if (state.ovOpen) buildSpriteThumbs();
    });

    // Project
    newMapBtn?.addEventListener('click', newMap);
    delMapBtn?.addEventListener('click', deleteMap);
    renameMapBtn?.addEventListener('click', renameMap);
    saveProjectBtn?.addEventListener('click', saveProject);
    loadProjectInput?.addEventListener('change', (e)=> loadProject(e.target.files[0]));
    mapNameInput?.addEventListener('change', () => {
      const cm = currentMap(); if (!cm) return;
      cm.name = mapNameInput.value || cm.name || cm.id || 'map';
      cm.id = cm.name;
      refreshMapsList();
    });

    // Size / zoom
    mapWInput.addEventListener('change', syncSizeInputs);
    mapHInput.addEventListener('change', syncSizeInputs);
    applySizeBtn.addEventListener('click', () => {
      const W = parseInt(mapWInput.value,10);
      const H = parseInt(mapHInput.value,10);
      beginAction({ kind:'resize', layer:'*' });
      const old = snapshotAll();
      resizeMap(W,H,true);
      endAction({ kind:'resize', layer:'*', snapshotBefore: old, snapshotAfter: snapshotAll() });
      render();
    });
    function syncSizeInputs(){
      mapWInput.value = clamp(parseInt(mapWInput.value,10)||state.mapW,1, 4096);
      mapHInput.value = clamp(parseInt(mapHInput.value,10)||state.mapH,1, 4096);
    }

    zoomRange.addEventListener('input', () => {
      state.zoom = parseInt(zoomRange.value,10) || 1;
      zoomLabel.textContent = `x${state.zoom}`;
      resizeMapCanvas();
      render();
    });

    // Scripts toolbar
    scriptProps && scriptProps.addEventListener('change', () => {
      const p = tryParseJSON(scriptProps.value);
      if (p!==undefined) state.scriptBrush.props = p;
    });

    openScriptEditorBtn?.addEventListener('click', () => {
      if (!state.selectedScript) {
        notify('Wybierz obiekt na warstwie Scripts (klik LPM), potem otwórz edytor.');
        return;
      }
      openOverlayFor(state.selectedScript.x, state.selectedScript.y);
    });

    // Save / Load / Clear (pojedyncza mapa)
    saveJsonBtn.addEventListener('click', saveJSON);
    loadJsonInput.addEventListener('change', (e)=> loadJSON(e.target.files[0]));
    clearLayerBtn.addEventListener('click', () => {
      const name = state.activeLayer;
      if (!confirm(`Are you really sure about that?\nThis will clear '${name}'.`)) return;
      beginAction({ kind:'clear', layer: name });
      if (name==='scripts') {
        const before = deepClone(state.scripts);
        state.scripts = [];
        state.history.current.scriptChanges.push({x:-1,y:-1,before:before, after: []});
        state.selectedScript = null;
      } else {
        for (let y=0;y<state.mapH;y++) for (let x=0;x<state.mapW;x++){
          const before=getTile(name,x,y);
          if(before){ setTile(name,x,y,null); recordChange(name,x,y,before,null); }
        }
      }
      endAction(); render();
    });

    // Undo/Redo
    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);
    window.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod){
        if (e.key.toLowerCase()==='z' && !e.shiftKey){ e.preventDefault(); undo(); return; }
        if ((e.key.toLowerCase()==='y') || (e.key.toLowerCase()==='z' && e.shiftKey)){ e.preventDefault(); redo(); return; }
      }
      // Delete on Scripts — usuń zaznaczony obiekt
      if (e.key === 'Delete' && state.activeLayer==='scripts'){
        const sel = state.selectedScript && findScriptAt(state.selectedScript.x, state.selectedScript.y);
        if (!sel) return;
        beginAction({ kind:'script-remove', layer:'scripts' });
        recordScriptChange(sel.x, sel.y, { kind: sel.kind, x: sel.x, y: sel.y, props: deepClone(sel.props||{}) }, null);
        removeScriptAt(sel.x, sel.y);
        state.selectedScript = null;
        endAction();
        render();
      }
    });

    // Canvas events
    mapCanvas.addEventListener('contextmenu', e => e.preventDefault());
    mapCanvas.addEventListener('mousedown', onCanvasDown);
    mapCanvas.addEventListener('mousemove', onCanvasMove);
    mapCanvas.addEventListener('dblclick', onCanvasDblClick);
    window.addEventListener('mouseup', onCanvasUp);

    // Picker
    pickerCanvas.addEventListener('mousedown', (e) => {
      const p = pointerInCanvas(e, pickerCanvas);
      const ts = state.tileSize;
      const tileX = Math.floor(p.x / ts);
      const tileY = Math.floor(p.y / ts);
      state.brush.tileX = clamp(tileX,0,state.tileset.cols-1);
      state.brush.tileY = clamp(tileY,0,state.tileset.rows-1);
      drawPicker(); renderPickedPreview(); updatePickedLabels();
      e.preventDefault();
    });
  }

  // ==========/ Tileset ==========
  function initTilesetSelect(){
    tilesetSelect.innerHTML = '';
    TILESETS.forEach((url, i) => {
      const opt = document.createElement('option');
      opt.value = url; opt.textContent = url;
      if (i===0) opt.selected = true;
      tilesetSelect.appendChild(opt);
    });
    tilesetSelect.addEventListener('change', () => loadTileset(tilesetSelect.value));
  }
  function initTypeSelect(){
    typeSelect.innerHTML = '';
    TILE_TYPES.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.value; opt.textContent = `${t.name} (${t.value})`;
      typeSelect.appendChild(opt);
    });
    typeSelect.value = 0;
  }
  async function loadTileset(url){
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await img.decode();
    state.tileset.img = img;
    state.tileset.url = url;
    tilesetName.textContent = url.split('/').pop();
    computeTilesetGrid();
    drawPicker();
    renderPickedPreview();
    render();
    initProjectIfEmpty();
    refreshMapsList();
  }
  function computeTilesetGrid(){
    const { img } = state.tileset; if (!img) return;
    const ts = state.tileSize;
    state.tileset.cols = Math.floor(img.width / ts);
    state.tileset.rows = Math.floor(img.height / ts);
    pickerCanvas.width = state.tileset.cols * ts;
    pickerCanvas.height = state.tileset.rows * ts;
  }
  function drawPicker(){
    const { img } = state.tileset; if (!img) return;
    const ts = state.tileSize;
    pickerCtx.clearRect(0,0,pickerCanvas.width,pickerCanvas.height);
    pickerCtx.imageSmoothingEnabled = false;
    pickerCtx.drawImage(img, 0,0);
    pickerCtx.strokeStyle = '#223'; pickerCtx.lineWidth = 1;
    for (let x=0; x<=pickerCanvas.width; x+=ts){ pickerCtx.beginPath(); pickerCtx.moveTo(x+.5,0); pickerCtx.lineTo(x+.5,pickerCanvas.height); pickerCtx.stroke(); }
    for (let y=0; y<=pickerCanvas.height; y+=ts){ pickerCtx.beginPath(); pickerCtx.moveTo(0,y+.5); pickerCtx.lineTo(pickerCanvas.width,y+.5); pickerCtx.stroke(); }
    pickerCtx.strokeStyle = '#6ea8fe'; pickerCtx.lineWidth = 2;
    pickerCtx.strokeRect(state.brush.tileX*ts+1, state.brush.tileY*ts+1, ts-2, ts-2);
  }
  function renderPickedPreview(){
    const {img} = state.tileset; if (!img) return;
    const ts = state.tileSize;
    pickedCanvas.width = ts*2; pickedCanvas.height = ts*2;
    pickedCtx.imageSmoothingEnabled = false;
    pickedCtx.clearRect(0,0,pickedCanvas.width,pickedCanvas.height);
    const sx = state.brush.tileX * ts; const sy = state.brush.tileY * ts;
    pickedCtx.save();
    pickedCtx.translate(pickedCanvas.width/2, pickedCanvas.height/2);
    applyBrushTransform(pickedCtx);
    pickedCtx.drawImage(img, sx, sy, ts, ts, -ts, -ts, ts*2, ts*2);
    pickedCtx.restore();
  }
  function updatePickedLabels(){
    pickedLabel.textContent = `(${state.brush.tileX},${state.brush.tileY})`;
    const t = TILE_TYPES.find(t => t.value===state.brush.typeB) || {name:'custom', value: state.brush.typeB};
    pickedTypeLabel.textContent = `${t.name} (${t.value})`;
    pickedFlagsLabel.textContent = '0b' + (state.brush.flagsA & 0x0f).toString(2).padStart(4,'0');
  }

  // ===== Project (multi-map) =====
  function currentMap(){ return state.project.maps[state.project.current]; }

  function captureCurrentMap(){
    const name = mapNameInput.value || `map_${Date.now()}`;
    const data = {
      id: name, name,
      tileset: state.tileset.url,
      tileSize: state.tileSize,
      width: state.mapW, height: state.mapH,
      layers: {},
      scripts: deepClone(state.scripts)
    };
    for (const L of ['ground','details','details2','ceiling','ceiling2']) data.layers[L] = deepClone(state.layers[L]);
    return data;
  }

  async function applyMapObject(m){
    mapNameInput.value = m.name || m.id || 'map';
    state.tileSize = m.tileSize || state.tileSize; tileSizeInput.value = state.tileSize;
    await loadTileset(m.tileset || state.tileset.url);
    resizeMap(m.width|0, m.height|0, false);
    for (const L of ['ground','details','details2','ceiling','ceiling2']){
      if (m.layers && m.layers[L]) state.layers[L] = deepClone(m.layers[L]);
      else state.layers[L] = allocateLayerGrid(state.mapW, state.mapH);
    }
    state.scripts = Array.isArray(m.scripts) ? m.scripts.map(s=>({ kind:'script', x:s.x|0, y:s.y|0, props: s.props||{} })) : [];
    render();
  }

  function initProjectIfEmpty(){
    if (!state.project.maps.length){
      state.project.maps.push(captureCurrentMap());
      state.project.current = 0;
    } else {
      mapNameInput.value = currentMap().name || currentMap().id || 'map';
    }
  }

  function refreshMapsList(){
    if (!mapsList) return;
    mapsList.innerHTML = '';
    state.project.maps.forEach((m, i) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ghost' + (i===state.project.current ? ' is-active' : '');
      btn.style.cssText = 'width:100%; text-align:left;';
      btn.textContent = `${i===state.project.current ? '▶ ' : ''}${m.name || m.id}`;
      btn.addEventListener('click', () => selectMap(i));
      li.appendChild(btn);
      mapsList.appendChild(li);
    });
  }

  async function selectMap(idx){
    if (idx<0 || idx>=state.project.maps.length) return;
    state.project.maps[state.project.current] = captureCurrentMap();
    state.project.current = idx;
    await applyMapObject(state.project.maps[idx]);
    refreshMapsList();
  }

  function newMap(){
    const base='map'; let n=1; const names = new Set(state.project.maps.map(m=>m.name||m.id));
    while (names.has(`${base}_${n}`)) n++;
    const m = {
      id:`${base}_${n}`, name:`${base}_${n}`,
      tileset: state.tileset.url, tileSize: state.tileSize,
      width:32, height:18, layers:{}, scripts:[]
    };
    for (const L of ['ground','details','details2','ceiling','ceiling2']) m.layers[L] = allocateLayerGrid(m.width,m.height);
    state.project.maps[state.project.current] = captureCurrentMap();
    state.project.maps.push(m);
    state.project.current = state.project.maps.length-1;
    applyMapObject(m);
    refreshMapsList();
  }

  function deleteMap(){
    if (state.project.maps.length<=1){ alert('Nie można usunąć ostatniej mapy'); return; }
    const curr = currentMap();
    if (!confirm(`Are you really sure about that?\nDelete map '${curr.name||curr.id}'?`)) return;
    state.project.maps.splice(state.project.current, 1);
    state.project.current = Math.max(0, state.project.current-1);
    applyMapObject(currentMap());
    refreshMapsList();
  }

  function renameMap(){
    const curr = currentMap();
    const name = prompt('New map name:', curr.name || curr.id);
    if (!name) return;
    curr.name = name; curr.id = name;
    mapNameInput.value = name;
    refreshMapsList();
  }

  function saveProject(){
    state.project.maps[state.project.current] = captureCurrentMap();
    const data = { projectVersion:1, variables: state.project.variables||[], maps: state.project.maps };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'project.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  }

  async function loadProject(file){
    if (!file) return;
    try{
      const text = await file.text();
      const obj = JSON.parse(text);
      if (Array.isArray(obj.maps)){
        state.project.maps = obj.maps.map(normalizeMapObject);
        state.project.variables = Array.isArray(obj.variables) ? obj.variables : (obj.variables || []);
        state.project.current = 0;
        await applyMapObject(state.project.maps[0]);
        refreshMapsList();
      } else {
        const single = normalizeMapObject(obj);
        state.project.maps = [single]; state.project.variables = Array.isArray(obj.variables)?obj.variables:[];
        state.project.current = 0;
        await applyMapObject(single);
        refreshMapsList();
      }
    } catch {
      alert('Błędny JSON projektu/mapy');
    } finally {
      loadProjectInput.value = '';
    }
  }

  function normalizeMapObject(obj){
    const W = obj.width|0, H = obj.height|0;
    const m = {
      id: obj.id || obj.name || 'map',
      name: obj.name || obj.id || 'map',
      tileset: obj.tileset || state.tileset.url,
      tileSize: obj.tileSize || state.tileSize,
      width: W || state.mapW, height: H || state.mapH,
      layers: {},
      scripts: Array.isArray(obj.scripts) ? obj.scripts.map(s=>({ kind:'script', x:s.x|0, y:s.y|0, props: s.props||{} })) : []
    };
    for (const L of ['ground','details','details2','ceiling','ceiling2']){
      if (obj.layers && obj.layers[L]) m.layers[L] = deepClone(obj.layers[L]);
      else m.layers[L] = allocateLayerGrid(m.width, m.height);
    }
    return m;
  }

  // ==========/ Map data ==========
  function allocateLayerGrid(W,H){
    const g = new Array(H);
    for (let y=0; y<H; y++){ g[y] = new Array(W).fill(null); }
    return g;
  }
  function resizeMap(W,H, preserve=false){
    const oldW = state.mapW, oldH = state.mapH;
    const oldLayers = preserve ? { ...state.layers } : null;
    const oldScripts = preserve ? [...state.scripts] : null;
    state.mapW = W; state.mapH = H;
    mapWInput.value = W; mapHInput.value = H;
    for (const L of VISUAL_LAYERS){ state.layers[L] = allocateLayerGrid(W,H); }
    if (preserve && oldLayers){
      const minW = Math.min(oldW, W), minH = Math.min(oldH, H);
      for (const L of VISUAL_LAYERS){
        const src = oldLayers[L]; if (!src) continue;
        for (let y=0;y<minH;y++) for (let x=0;x<minW;x++) state.layers[L][y][x] = src[y][x];
      }
      state.scripts = oldScripts.filter(s => s.x < W && s.y < H);
    } else {
      state.scripts = [];
    }
    resizeMapCanvas();
  }
  function resizeMapCanvas(){
    const scale = state.zoom;
    const cssW = state.mapW * state.tileSize * scale;
    const cssH = state.mapH * state.tileSize * scale;
    mapCanvas.width = cssW; mapCanvas.height = cssH;
    mapCtx.imageSmoothingEnabled = false;
  }
  function setTile(layer, x, y, tile){
    if (x<0||y<0||x>=state.mapW||y>=state.mapH) return;
    state.layers[layer][y][x] = tile; // tile = {r,g,b,a} or null
  }
  function getTile(layer, x, y){
    if (x<0||y<0||x>=state.mapW||y>=state.mapH) return null;
    return state.layers[layer][y][x];
  }
  const isCeilingLayer = (name) => (name==='ceiling' || name==='ceiling2');

  // ==========/ Render ==========
  function render(){
    const ts = state.tileSize; const z = state.zoom; const {img} = state.tileset;
    mapCtx.clearRect(0,0,mapCanvas.width,mapCanvas.height);
    const drawLayer = (name, alpha) => {
      const grid = state.layers[name]; if (!grid || !img) return;
      mapCtx.save(); mapCtx.globalAlpha = alpha; mapCtx.scale(z,z);
      for (let y=0; y<state.mapH; y++){
        for (let x=0; x<state.mapW; x++){
          const t = grid[y][x]; if (!t) continue;
          drawTileAt(x,y, t.r, t.g, t.b, t.a);
        }
      }
      mapCtx.restore();
    };
    for (const L of VISUAL_LAYERS){
      const alpha = (state.activeLayer===L) ? 1.0 : (state.ghostOther?0.35:0.15);
      drawLayer(L, alpha);
    }
    drawScriptsOverlay();
    drawPreview();
    if (state.showGrid){
      mapCtx.save(); mapCtx.scale(z,z);
      mapCtx.strokeStyle = 'rgba(255,255,255,0.06)';
      for (let x=0; x<=state.mapW*ts; x+=ts){ mapCtx.beginPath(); mapCtx.moveTo(x+.5,0); mapCtx.lineTo(x+.5,state.mapH*ts); mapCtx.stroke(); }
      for (let y=0; y<=state.mapH*ts; y+=ts){ mapCtx.beginPath(); mapCtx.moveTo(0,y+.5); mapCtx.lineTo(state.mapW*ts,y+.5); mapCtx.stroke(); }
      mapCtx.restore();
    }
  }
  function drawTileAt(tx,ty, r,g, b, a){
    const { img } = state.tileset; if (!img) return;
    const ts = state.tileSize; const z = state.zoom;
    const sx = r * ts; const sy = g * ts;
    const dx = tx * ts * z; const dy = ty * ts * z;
    mapCtx.save();
    mapCtx.translate(dx + (ts*z)/2, dy + (ts*z)/2);
    applyFlagsTransform(mapCtx, a);
    mapCtx.drawImage(img, sx, sy, ts, ts, -(ts*z)/2, -(ts*z)/2, ts*z, ts*z);
    mapCtx.restore();
  }
  function drawScriptsOverlay(){
    const ts = state.tileSize; const z = state.zoom;
    mapCtx.save(); mapCtx.scale(z,z);
    for (const s of state.scripts){
      const x = s.x*ts, y = s.y*ts;
      mapCtx.fillStyle = 'rgba(255,215,0,0.85)';
      mapCtx.strokeStyle = 'rgba(0,0,0,0.8)'; mapCtx.lineWidth = 2;
      mapCtx.beginPath(); mapCtx.rect(x+2, y+2, ts-4, ts-4); mapCtx.fill(); mapCtx.stroke();
      mapCtx.fillStyle = '#000'; mapCtx.font = `${Math.floor(ts*0.5)}px monospace`;
      mapCtx.textAlign = 'center'; mapCtx.textBaseline = 'middle';
      const label = (s.kind||'').slice(0,1).toUpperCase();
      mapCtx.fillText(label, x+ts/2, y+ts/2);

      // zaznaczenie
      if (state.selectedScript && state.selectedScript.x===s.x && state.selectedScript.y===s.y){
        mapCtx.strokeStyle = 'rgba(80,180,255,0.9)';
        mapCtx.lineWidth = 2;
        mapCtx.strokeRect(x+1.5, y+1.5, ts-3, ts-3);
      }
    }
    mapCtx.restore();
  }
  function drawPreview(){
    if (!state.preview.active) return;
    const { img } = state.tileset; if (!img) return;
    const ts = state.tileSize; const z = state.zoom;
    mapCtx.save(); mapCtx.globalAlpha = state.preview.erase ? 0.35 : 0.5;
    mapCtx.scale(z,z);
    for (const {x,y} of state.preview.cells){
      if (x<0||y<0||x>=state.mapW||y>=state.mapH) continue;
      if (state.preview.erase){
        mapCtx.fillStyle = 'rgba(255,60,60,0.35)';
        mapCtx.fillRect(x*ts, y*ts, ts, ts);
      } else {
        const sx = state.brush.tileX * ts; const sy = state.brush.tileY * ts;
        mapCtx.save();
        mapCtx.translate(x*ts + ts/2, y*ts + ts/2);
        applyBrushTransform(mapCtx);
        mapCtx.drawImage(img, sx, sy, ts, ts, -ts/2, -ts/2, ts, ts);
        mapCtx.restore();
      }
    }
    mapCtx.restore();
  }
  function applyBrushTransform(ctx){
    const f = state.brush.flagsA & 0x0f;
    if (f & FLAG.ROT_90) ctx.rotate(Math.PI/2);
    const sx = (f & FLAG.FLIP_X) ? -1 : 1;
    const sy = (f & FLAG.FLIP_Y) ? -1 : 1;
    ctx.scale(sx, sy);
  }
  function applyFlagsTransform(ctx, a){
    const f = a & 0x0f;
    if (f & FLAG.ROT_90) ctx.rotate(Math.PI/2);
    const sx = (f & FLAG.FLIP_X) ? -1 : 1;
    const sy = (f & FLAG.FLIP_Y) ? -1 : 1;
    ctx.scale(sx, sy);
  }

  // ==========/ History ==========
  function beginAction(meta){
    state.history.current = { ...meta, changes: [], scriptChanges: [] };
    state.history.changeIndex = new Map();
    state.preview.active = false;
  }
  function recordChange(layer, x, y, before, after){
    const key = layer+':'+x+','+y;
    if (!state.history.changeIndex.has(key)){
      const idx = state.history.current.changes.length;
      state.history.changeIndex.set(key, idx);
      state.history.current.changes.push({ layer, x, y, before: deepClone(before), after: deepClone(after) });
    } else {
      const idx = state.history.changeIndex.get(key);
      state.history.current.changes[idx].after = deepClone(after);
    }
  }
  function endAction(meta){
    const action = state.history.current; if (!action) return;
    Object.assign(action, meta||{});
    if (action.changes.length===0 && action.scriptChanges.length===0 && !action.snapshotBefore){
      state.history.current=null; return;
    }
    state.history.undo.push(action);
    if (state.history.undo.length>state.history.limit) state.history.undo.shift();
    state.history.redo = [];
    state.history.current = null; state.history.changeIndex=null;
    updateUndoRedoButtons();
  }
  function applyAction(action, dir){ // dir: 1 redo, -1 undo
    if (action.snapshotBefore){
      const snap = dir===-1 ? action.snapshotBefore : action.snapshotAfter;
      restoreSnapshot(snap);
    } else {
      for (const ch of action.changes){
        const src = dir===-1 ? ch.before : ch.after;
        setTile(ch.layer, ch.x, ch.y, cloneTile(src));
      }
      for (const sc of action.scriptChanges){
        const src = dir===-1 ? sc.before : sc.after;
        if (!src) removeScriptAt(sc.x, sc.y, false);
        else upsertScriptAt(sc.x, sc.y, src.kind, src.props, false);
      }
    }
    render();
  }
  function undo(){
    const a = state.history.undo.pop(); if (!a) return;
    state.history.redo.push(a);
    applyAction(a, -1);
    updateUndoRedoButtons();
  }
  function redo(){
    const a = state.history.redo.pop(); if (!a) return;
    state.history.undo.push(a);
    applyAction(a, 1);
    updateUndoRedoButtons();
  }
  function updateUndoRedoButtons(){
    undoBtn.disabled = state.history.undo.length===0;
    redoBtn.disabled = state.history.redo.length===0;
  }

  // ==========/ Canvas interaction ==========
  function onCanvasDown(e){
    const btn = e.button; // 0=LB,2=RB
    state.mouseDown = true; state.mouseButton = btn;
    const altPick = e.altKey;
    const {tx,ty} = tileFromEvent(e);

    if (state.activeLayer==='scripts'){
      // ALT = pipeta + zaznacz
      if (altPick){
        const s = findScriptAt(tx,ty);
        if (s){
          state.scriptBrush.kind = 'script';
          scriptProps && (scriptProps.value = JSON.stringify(s.props||{}));
          state.scriptBrush.props = s.props||{};
          state.selectedScript = {x:s.x, y:s.y};
          render();
        }
        return;
      }
      // PPM: tylko zaznacz
      if (btn===2){
        const s = findScriptAt(tx,ty);
        if (s){ state.selectedScript = {x:s.x, y:s.y}; render(); }
        return;
      }
      // LPM: jeśli istnieje -> zaznacz, jeśli pusto -> dodaj
      const ex = findScriptAt(tx,ty);
      if (ex){
        state.selectedScript = {x:ex.x, y:ex.y};
        // start drag
        state.dragScript.active = true;
        state.dragScript.origX = ex.x;
        state.dragScript.origY = ex.y;
        beginAction({ kind:'script-move', layer:'scripts' });
        render();
      } else {
        const parsed = tryParseJSON(scriptProps?.value);
        if (parsed!==undefined) state.scriptBrush.props = parsed;
        const after = { kind:'script', x:tx, y:ty, props: deepClone(state.scriptBrush.props) };
        beginAction({ kind:'script-add', layer:'scripts' });
        recordScriptChange(tx,ty, null, after);
        upsertScriptAt(tx,ty, 'script', state.scriptBrush.props, false);
        endAction();
        state.selectedScript = {x:tx, y:ty};
        render();
      }
      return;
    }

    // Warstwy wizualne
    if (altPick){ const t = getTile(state.activeLayer, tx, ty); if (t){ setBrushFromTile(t); } return; }

    if (state.tool==='pencil'){
      beginAction({ kind: btn===2?'erase':'paint', layer: state.activeLayer });
      paintOne(tx,ty, btn===2);
    } else {
      state.shapeDrag.active = true;
      state.shapeDrag.startX = tx; state.shapeDrag.startY = ty;
      state.shapeDrag.endX = tx; state.shapeDrag.endY = ty;
      updatePreviewCells();
    }
  }
  function onCanvasMove(e){
    updateStatusFromEvent(e);
    const {tx,ty} = tileFromEvent(e);

    // Drag na warstwie Scripts
    if (state.activeLayer==='scripts' && state.dragScript.active){
      const sel = state.selectedScript && findScriptAt(state.selectedScript.x, state.selectedScript.y);
      if (!sel) return;

      // nie wchodź, jeśli kratka zajęta innym obiektem
      const other = findScriptAt(tx,ty);
      if (other && !(other.x===sel.x && other.y===sel.y)) return;

      sel.x = tx; sel.y = ty;
      state.selectedScript = {x:tx, y:ty};
      render();
      return;
    }

    if (!state.mouseDown) return;

    if (state.activeLayer==='scripts'){
      // bez drag – nic
      return;
    }

    if (state.tool==='pencil'){
      paintOne(tx,ty, state.mouseButton===2);
    } else if (state.shapeDrag.active){
      state.shapeDrag.endX = tx; state.shapeDrag.endY = ty; updatePreviewCells();
    }
  }
  function onCanvasDblClick(e){
    if (state.activeLayer!=='scripts') return;
    const {tx,ty} = tileFromEvent(e);
    let s = findScriptAt(tx,ty);
    if (!s){
      const parsed = tryParseJSON(scriptProps?.value);
      if (parsed!==undefined) state.scriptBrush.props = parsed;
      s = { kind:'script', x:tx, y:ty, props: deepClone(state.scriptBrush.props) };
      beginAction({ kind:'script-add', layer:'scripts' });
      recordScriptChange(tx,ty, null, s);
      upsertScriptAt(tx,ty,'script', state.scriptBrush.props, false);
      endAction();
    }
    state.selectedScript = {x:tx, y:ty};
    render();
    openOverlayFor(tx,ty);
  }
  function onCanvasUp(){
    const wasDraggingScript = state.dragScript.active;
    if (wasDraggingScript){
      state.dragScript.active = false;
      const s = state.selectedScript && findScriptAt(state.selectedScript.x, state.selectedScript.y);
      if (s){
        const ox = state.dragScript.origX, oy = state.dragScript.origY;
        const nx = s.x, ny = s.y;
        if (ox!==nx || oy!==ny){
          const before = { kind: s.kind, x: ox, y: oy, props: deepClone(s.props||{}) };
          const after  = { kind: s.kind, x: nx, y: ny, props: deepClone(s.props||{}) };
          recordScriptChange(ox, oy, before, null); // remove ze starej kratki
          recordScriptChange(nx, ny, null, after);  // add na nowej kratce
        }
      }
      if (state.history.current){ endAction(); }
      render();
    }

    if (!state.mouseDown) return;
    state.mouseDown = false;

    if (state.activeLayer!=='scripts' && state.tool!=='pencil' && state.shapeDrag.active){
      const cells = state.preview.cells; const erase = state.preview.erase;
      state.preview.active=false; state.shapeDrag.active=false;
      beginAction({ kind: erase?'shape-erase':'shape-paint', layer: state.activeLayer, tool: state.tool, filled: state.fillShape });
      for (const {x,y} of cells){ applyPaintAt(state.activeLayer, x, y, erase ? null : makeCurrentTile()); }
      endAction(); render();
    } else if (state.history.current){
      endAction(); render();
    }
  }
  function updateStatusFromEvent(e){
    const p = pointerInCanvas(e, mapCanvas);
    posLabel.textContent = `${Math.floor(p.x)},${Math.floor(p.y)}`;
    const {tx,ty} = tileFromEvent(e);
    tileLabel.textContent = `${tx},${ty}`;
  }
  function paintOne(tx,ty, erase){
    applyPaintAt(state.activeLayer, tx, ty, erase ? null : makeCurrentTile());
    render();
  }
  function applyPaintAt(layer, x, y, newTile){
    if (x<0||y<0||x>=state.mapW||y>=state.mapH) return;
    const before = getTile(layer, x, y);
    const equal = tilesEqual(before, newTile);
    if (equal) return;
    setTile(layer, x, y, cloneTile(newTile));
    if (!state.history.current) beginAction({ kind:'paint', layer });
    recordChange(layer, x, y, before, newTile);
  }
  function makeCurrentTile(){
    const r = state.brush.tileX & 255; const g = state.brush.tileY & 255;
    const b = isCeilingLayer(state.activeLayer) ? 0 : (state.brush.typeB & 255);
    const a = state.brush.flagsA & 255;
    return { r,g,b,a };
  }
  function setBrushFromTile(t){
    state.brush.tileX=t.r; state.brush.tileY=t.g; state.brush.typeB=t.b; state.brush.flagsA=t.a;
    typeSelect.value = String(state.brush.typeB);
    flagFlipX.checked = !!(t.a & FLAG.FLIP_X);
    flagFlipY.checked = !!(t.a & FLAG.FLIP_Y);
    flagRot90.checked = !!(t.a & FLAG.ROT_90);
    drawPicker(); renderPickedPreview(); updatePickedLabels();
  }
  function recordScriptChange(x,y,before,after){
    const entry = { x,y, before: before? deepClone(before): null, after: after? deepClone(after): null };
    state.history.current.scriptChanges.push(entry);
  }
  function findScriptAt(x,y){ return state.scripts.find(s => s.x===x && s.y===y); }
  function removeScriptAt(x,y){ state.scripts = state.scripts.filter(s => !(s.x===x && s.y===y)); }
  function upsertScriptAt(x,y, kind, props){
    const ex = findScriptAt(x,y);
    if (ex){ ex.kind = kind; ex.props = deepClone(props||{}); }
    else state.scripts.push({ kind, x, y, props: deepClone(props||{}) });
  }

  // ==========/ Pointer helpers ==========
  function pointerInCanvas(evt, canvas){
    const rect = canvas.getBoundingClientRect();
    // współrzędne w pikselach canvasu (po uwzględnieniu zoomu, bo width/height są już przeskalowane)
    return { x: (evt.clientX - rect.left), y: (evt.clientY - rect.top) };
  }
  function tileFromEvent(evt){
    const p = pointerInCanvas(evt, mapCanvas);
    // rozmiar widocznego tile’a = tileSize * zoom (canvas ma width/height już przeskalowane)
    const tsz = state.tileSize * state.zoom;
    const tx = clamp(Math.floor(p.x / tsz), 0, state.mapW - 1);
    const ty = clamp(Math.floor(p.y / tsz), 0, state.mapH - 1);
    return { tx, ty };
  }

  // ==========/ Shapes ==========
  function updatePreviewCells(){
    const {startX,startY,endX,endY} = state.shapeDrag;
    let cells = [];
    if (state.tool==='line') cells = lineCells(startX,startY,endX,endY);
    else if (state.tool==='rect') cells = rectCells(startX,startY,endX,endY, state.fillShape);
    else if (state.tool==='circle') cells = ellipseCellsBBox(startX,startY,endX,endY, state.fillShape);
    state.preview.active = true; state.preview.cells = cells; state.preview.erase = (state.mouseButton===2);
    render();
  }
  function rectCells(x0,y0,x1,y1, filled){
    const minx = Math.min(x0,x1), maxx=Math.max(x0,x1);
    const miny = Math.min(y0,y1), maxy=Math.max(y0,y1);
    const out=[];
    if (filled){
      for (let y=miny;y<=maxy;y++) for (let x=minx;x<=maxx;x++) out.push({x,y});
    } else {
      for (let x=minx;x<=maxx;x++){ out.push({x,y:miny}); out.push({x,y:maxy}); }
      for (let y=miny+1;y<=maxy-1;y++){ out.push({x:minx,y}); out.push({x:maxx,y}); }
    }
    return clampCells(out);
  }
  function lineCells(x0,y0,x1,y1){
    const out=[]; let dx=Math.abs(x1-x0), dy=Math.abs(y1-y0);
    let sx = x0<x1?1:-1, sy = y0<y1?1:-1; let err = dx-dy; let x=x0,y=y0;
    while(true){
      out.push({x,y});
      if (x===x1 && y===y1) break;
      const e2 = 2*err;
      if (e2> -dy){ err-=dy; x+=sx; }
      if (e2 < dx){ err+=dx; y+=sy; }
    }
    return clampCells(out);
  }
  function ellipseCellsBBox(x0,y0,x1,y1, filled){
    const minx=Math.min(x0,x1), maxx=Math.max(x0,x1);
    const miny=Math.min(y0,y1), maxy=Math.max(y0,y1);
    const cx = (minx+maxx)/2, cy=(miny+maxy)/2;
    const rx = Math.max(0,(maxx-minx)/2), ry=Math.max(0,(maxy-miny)/2);
    const out=[];
    if (rx===0 && ry===0) return [{x:Math.round(cx), y:Math.round(cy)}];
    const th = 1/Math.max(1, Math.max(rx,ry)); // outline thickness factor
    for (let y=miny; y<=maxy; y++){
      for (let x=minx; x<=maxx; x++){
        const nx = (x+0.5 - cx) / (rx || 1);
        const ny = (y+0.5 - cy) / (ry || 1);
        const d = nx*nx + ny*ny;
        if (filled){ if (d <= 1.0) out.push({x,y}); }
        else { if (d <= 1.0 && d >= (1.0 - th*2)) out.push({x,y}); }
      }
    }
    return clampCells(out);
  }
  function clampCells(cells){
    const out=[]; for (const c of cells){ if (c.x>=0 && c.y>=0 && c.x<state.mapW && c.y<state.mapH) out.push(c); }
    // dedupe
    const seen=new Set(); const unique=[]; for(const c of out){ const k=c.x+','+c.y; if(!seen.has(k)){ seen.add(k); unique.push(c);} }
    return unique;
  }

  function notify(msg){
    if (!toast) return alert(msg);
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(notify._t);
    notify._t = setTimeout(() => toast.classList.add('hidden'), 1800);
  }
  const g = (typeof window!=='undefined'?window:globalThis);

  g.__mapEditor__ = g.__mapEditor__ || {};
  const api = g.__mapEditor__;

  if (!api.register){
    api.register = function register(payload){
      Object.assign(api, payload||{});
    };
  }

  // ---------- Utils dostępne globalnie ----------
  function tryParseJSON(txt){
    if (typeof txt !== 'string') return undefined;
    try{ return JSON.parse(txt); } catch { return undefined; }
  }
  function downloadText(filename, text){
    const blob = new Blob([text], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  }
  function deepClone(o){ return JSON.parse(JSON.stringify(o)); }
  function clamp(v,min,max){ return Math.max(min, Math.min(max,v)); }

  // Zapis/odczyt pojedynczej mapy w lekkim formacie
  function captureSingleMap(){
    const { state } = api;
    const data = {
      id: state && state.project && state.project.maps ? (state.project.maps[state.project.current]?.id || 'map') : (document.getElementById('mapName')?.value || 'map'),
      name: document.getElementById('mapName')?.value || 'map',
      tileset: state?.tileset?.url || './assets/sprites/tileset.png',
      tileSize: state?.tileSize || 32,
      width: state?.mapW || 0,
      height: state?.mapH || 0,
      layers: {},
      scripts: deepClone(state?.scripts || [])
    };
    const V = ['ground','details','details2','ceiling','ceiling2'];
    for (const L of V) data.layers[L] = deepClone(state?.layers?.[L] || []);
    return data;
  }

  function applySingleMap(mapObj){
    const { state, helpers } = api; if (!state || !helpers) return;
    const { resizeMap, allocateLayerGrid, render } = helpers;

    document.getElementById('mapName') && (document.getElementById('mapName').value = mapObj.name || mapObj.id || 'map');
    state.tileSize = mapObj.tileSize || state.tileSize || 32;
    const tileSizeInput = document.getElementById('tileSize');
    if (tileSizeInput) tileSizeInput.value = state.tileSize;

    // tileset zostawiamy – 1/2 już ma loader; tylko ustawiamy url
    state.tileset = state.tileset || {};
    state.tileset.url = mapObj.tileset || state.tileset.url;

    resizeMap(mapObj.width|0, mapObj.height|0, false);
    const V = ['ground','details','details2','ceiling','ceiling2'];
    for (const L of V){
      if (mapObj.layers && mapObj.layers[L]) state.layers[L] = deepClone(mapObj.layers[L]);
      else state.layers[L] = allocateLayerGrid(state.mapW, state.mapH);
    }
    state.scripts = Array.isArray(mapObj.scripts) ? mapObj.scripts.map(s=>({ kind: s.kind||'script', x:s.x|0, y:s.y|0, props: s.props||{} })) : [];
    render && render();
  }

  // Snapshot/restore (używane przy resize w 1/2)
  function snapshotAll(){
    const { state } = api;
    if (!state) return null;
    const V = ['ground','details','details2','ceiling','ceiling2'];
    const layers = {};
    for (const L of V) layers[L] = deepClone(state.layers[L] || []);
    return { W: state.mapW, H: state.mapH, tileSize: state.tileSize, layers, scripts: deepClone(state.scripts||[]) };
  }

  function restoreSnapshot(snap){
    const { state, helpers } = api; if (!state || !helpers || !snap) return;
    const { render, resizeMap } = helpers;
    resizeMap(snap.W|0, snap.H|0, false);
    state.tileSize = snap.tileSize || state.tileSize;
    const V = ['ground','details','details2','ceiling','ceiling2'];
    for (const L of V) state.layers[L] = deepClone(snap.layers[L] || []);
    state.scripts = deepClone(snap.scripts||[]);
    const tileSizeInput = document.getElementById('tileSize');
    tileSizeInput && (tileSizeInput.value = state.tileSize);
    render && render();
  }

  // Podstawowa obsługa SAVE/LOAD dla aktualnej mapy
  function saveJSON(){
    const m = captureSingleMap();
    downloadText((m.name||'map') + '.json', JSON.stringify(m, null, 2));
  }
  async function loadJSON(file){
    if (!file) return;
    try{
      const txt = await file.text();
      const obj = JSON.parse(txt);
      // Obsłuż zarówno single-map, jak i "project.json"
      if (obj && Array.isArray(obj.maps)){
        // uproszczone – bierzemy pierwszą mapę
        applySingleMap(obj.maps[0]);
      } else {
        applySingleMap(obj);
      }
    } catch {
      alert('Błędny plik JSON.');
    } finally {
      const input = document.getElementById('loadJsonInput');
      if (input) input.value = '';
    }
  }

  // ---------- Overlay dla obiektów „Scripts” (prosty JSON) ----------
  function initOverlayUI(){
    const ov = document.getElementById('scriptOverlay') || document.getElementById('overlay');
    const ovClose = document.getElementById('scriptOvClose') || document.getElementById('overlayClose');
    const ovSave  = document.getElementById('scriptOvSave') || document.getElementById('overlaySave');
    const txt = document.getElementById('scriptOvJson') || document.getElementById('overlayJson');
    if (!ov || !ovClose || !ovSave || !txt) return; // brak overlayu – pomiń

    ovClose.addEventListener('click', ()=>{ ov.style.display='none'; });
    ovSave.addEventListener('click', ()=>{
      const sel = api.state?.selectedScript;
      if (!sel) { ov.style.display='none'; return; }
      const s = (api.state.scripts||[]).find(e => e.x===sel.x && e.y===sel.y);
      const parsed = tryParseJSON(txt.value);
      if (s && parsed!==undefined){ s.props = parsed; api.helpers?.render?.(); }
      ov.style.display='none';
    });

    // zapamiętaj w api do użycia w openOverlayFor
    api._overlay = { el: ov, jsonEl: txt };
  }

  function openOverlayFor(x,y){
    const { state } = api;
    const overlay = api._overlay;
    if (!overlay) return; // brak overlayu
    const s = (state.scripts||[]).find(e => e.x===x && e.y===y);
    overlay.jsonEl.value = JSON.stringify(s?.props || {}, null, 2);
    overlay.el.style.display = 'flex';
  }

  // ---------- Panel zmiennych (opcjonalny) ----------
  function initVarsUI(){
    const q = document.getElementById('varsSearch');
    const t = document.getElementById('varsTypeFilter');
    const r = document.getElementById('varsResetFilter');
    const add = document.getElementById('varsAddBtn');
    const exp = document.getElementById('varsExportBtn');
    const imp = document.getElementById('varsImportInput');
    const tbody = document.getElementById('varsTableBody');
    if (!tbody) return;

    const state = (api.state.varsLoaded ? api.state : Object.assign(api.state, { varsLoaded:true, vars: [] }));

    function renderTable(){
      const query = (q?.value||'').toLowerCase();
      const typeF = t?.value||'';
      tbody.innerHTML = '';
      for (const [idx,v] of state.vars.entries()){
        if (query && !(`${v.name}`.toLowerCase().includes(query))) continue;
        if (typeF && v.type!==typeF) continue;

        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        const iName = document.createElement('input'); iName.value=v.name||''; iName.addEventListener('change',()=>{ v.name = iName.value; });
        tdName.appendChild(iName);

        const tdType = document.createElement('td');
        const sel = document.createElement('select');
        ['int','float','bool','enum','enum_flags','string'].forEach(tt=>{
          const o=document.createElement('option'); o.value=tt; o.textContent=tt; if (tt===v.type) o.selected=true; sel.appendChild(o);
        });
        sel.addEventListener('change', ()=>{ v.type = sel.value; bumpDefault(v); renderTable(); });
        tdType.appendChild(sel);

        const tdOpts = document.createElement('td');
        const opt = document.createElement('input'); opt.placeholder='opcja1,opcja2 (dla enum/flags)'; opt.value = (v.options||[]).join(',');
        opt.addEventListener('change', ()=>{ v.options = opt.value.split(',').map(s=>s.trim()).filter(Boolean); bumpDefault(v); renderTable(); });
        tdOpts.appendChild(opt);

        const tdDef = document.createElement('td');
        const idef = document.createElement('input'); idef.value = String(v.default ?? '');
        idef.addEventListener('change', ()=>{
          const pv = parseValueByType(idef.value, v.type, v.options);
          if (pv!==undefined) v.default = pv; else alert('Nieprawidłowa wartość dla typu');
        });
        tdDef.appendChild(idef);

        const tdDel = document.createElement('td');
        const del = document.createElement('button'); del.textContent='Usuń'; del.className='danger';
        del.addEventListener('click', ()=>{ state.vars.splice(idx,1); renderTable(); });
        tdDel.appendChild(del);

        tr.appendChild(tdName); tr.appendChild(tdType); tr.appendChild(tdOpts); tr.appendChild(tdDef); tr.appendChild(tdDel);
        tbody.appendChild(tr);
      }
    }
    function bumpDefault(v){
      if (v.type==='int') v.default = Number.isInteger(v.default)?v.default:0;
      else if (v.type==='float') v.default = (typeof v.default==='number')?v.default:0.0;
      else if (v.type==='bool') v.default = !!v.default;
      else if (v.type==='enum') v.default = (v.options||[])[0] ?? '';
      else if (v.type==='enum_flags') v.default = 0;
      else if (v.type==='string') v.default = String(v.default ?? '');
    }
    function parseValueByType(val, type, options){
      if (type==='int'){
        const n = parseInt(val,10); if (Number.isNaN(n)) return undefined; return n;
      } else if (type==='float'){
        const n = parseFloat(val); if (Number.isNaN(n)) return undefined; return n;
      } else if (type==='bool'){
        const s = String(val).toLowerCase(); return (s==='true'||s==='1'||s==='yes');
      } else if (type==='enum'){
        return (options||[]).includes(val) ? val : (options?.[0] ?? '');
      } else if (type==='enum_flags'){
        const n = parseInt(val,10); if (Number.isNaN(n)) return 0; return n;
      } else if (type==='string'){
        return String(val);
      }
      return val;
    }

    q && q.addEventListener('input', renderTable);
    t && t.addEventListener('change', renderTable);
    r && r.addEventListener('click', ()=>{ if(q) q.value=''; if(t) t.value=''; renderTable(); });

    add && add.addEventListener('click', ()=>{
      state.vars.push({ id: `var_${Date.now()}`, name:'var_name', type:'int', default:0, options:[] });
      renderTable();
    });

    exp && exp.addEventListener('click', ()=>{
      downloadText('variables.json', JSON.stringify({ variables: state.vars }, null, 2));
    });

    imp && imp.addEventListener('change', async (e)=>{
      const f = e.target.files?.[0]; if (!f) return;
      try{
        const txt = await f.text();
        const obj = JSON.parse(txt);
        if (Array.isArray(obj)) state.vars = obj;
        else if (Array.isArray(obj.variables)) state.vars = obj.variables;
        else throw new Error('format');
        renderTable();
      } catch {
        alert('Błędny plik variables.json');
      } finally {
        e.target.value='';
      }
    });

    renderTable();
  }

  g.saveJSON = saveJSON;
  g.loadJSON = loadJSON;
  g.snapshotAll = snapshotAll;
  g.restoreSnapshot = restoreSnapshot;
  g.openOverlayFor = openOverlayFor;
  g.tryParseJSON = tryParseJSON; // na wypadek gdy 1/2 wywołuje

  // Uruchomienia zależne od DOM (po załadowaniu)
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=>{
      initOverlayUI();
      initVarsUI();
    });
  } else {
    initOverlayUI();
    initVarsUI();
  }
})();