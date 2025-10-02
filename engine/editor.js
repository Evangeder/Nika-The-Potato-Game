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

    layers: { ground: null, details: null, details2: null, ceiling: null, ceiling2: null },
    scripts: [],             // [{kind, x, y, props}]
    selectedScript: null,    // {x,y} (ostatnio kliknięty/pipetowany)
    scriptBrush: { kind: 'teleport', props: {} },

    mouseDown: false, mouseButton: 0,
    shapeDrag: { active:false, startX:0, startY:0, endX:0, endY:0 },
    preview: { active:false, cells:[], erase:false },

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
  const scriptKind = $('#scriptKind');
  const scriptProps = $('#scriptProps');
  const openScriptEditorBtn = $('#openScriptEditorBtn');

  // Overlay (RPGMaker-like)
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

  // Toast / modal (optional)
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
    zoomLabel.textContent = `x${state.zoom}`;
    scriptKind.value = state.scriptBrush.kind;
    updateUndoRedoButtons();
    initOverlayUI();
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
        scriptTools.style.display = scriptsMode ? '' : 'none';
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
    scriptKind.addEventListener('change', () => { state.scriptBrush.kind = scriptKind.value; });
    scriptProps.addEventListener('change', () => {
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

    // Save / Load / Clear
    saveJsonBtn.addEventListener('click', saveJSON);
    loadJsonInput.addEventListener('change', (e)=> loadJSON(e.target.files[0]));
    clearLayerBtn.addEventListener('click', () => {
      beginAction({ kind:'clear', layer: state.activeLayer });
      if (state.activeLayer==='scripts') {
        const before = deepClone(state.scripts);
        state.scripts = [];
        state.history.current.scriptChanges.push({x:-1,y:-1,before:before, after: []});
        state.selectedScript = null;
      } else {
        const L = state.activeLayer;
        for (let y=0;y<state.mapH;y++) for (let x=0;x<state.mapW;x++){
          const before=getTile(L,x,y);
          if(before){ setTile(L,x,y,null); recordChange(L,x,y,before,null); }
        }
      }
      endAction(); render();
    });

    // Undo/Redo
    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);
    window.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key.toLowerCase()==='z' && !e.shiftKey){ e.preventDefault(); undo(); }
      else if ((e.key.toLowerCase()==='y') || (e.key.toLowerCase()==='z' && e.shiftKey)){ e.preventDefault(); redo(); }
    });

    // Canvas events
    mapCanvas.addEventListener('contextmenu', e => e.preventDefault());
    mapCanvas.addEventListener('mousedown', onCanvasDown);
    mapCanvas.addEventListener('mousemove', onCanvasMove);
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

      // selection ring
      if (state.selectedScript && state.selectedScript.x===s.x && state.selectedScript.y===s.y){
        mapCtx.strokeStyle = 'rgba(80,180,255,0.9)'; mapCtx.lineWidth = 2;
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
      if (altPick){
        const s = findScriptAt(tx,ty);
        if (s){
          scriptKind.value = s.kind; state.scriptBrush.kind=s.kind;
          scriptProps.value = JSON.stringify(s.props||{}); state.scriptBrush.props = s.props||{};
          state.selectedScript = {x:s.x, y:s.y};
          render();
        }
        return;
      }
      beginAction({ kind: btn===2?'script-remove':'script-upsert', layer:'scripts' });
      if (btn===2){
        recordScriptChange(tx,ty, findScriptAt(tx,ty), null);
        removeScriptAt(tx,ty,false);
        if (state.selectedScript && state.selectedScript.x===tx && state.selectedScript.y===ty) state.selectedScript=null;
      } else {
        const props = tryParseJSON(scriptProps.value);
        if (props!==undefined) state.scriptBrush.props=props;
        const before = findScriptAt(tx,ty);
        const after = {kind:state.scriptBrush.kind, x:tx, y:ty, props:deepClone(state.scriptBrush.props)};
        recordScriptChange(tx,ty, before, after);
        upsertScriptAt(tx,ty,state.scriptBrush.kind,state.scriptBrush.props,false);
        state.selectedScript = {x:tx, y:ty};
      }
      endAction(); render(); return;
    }

    // Visual layers
    if (altPick){
      const t = getTile(state.activeLayer, tx, ty);
      if (t){ setBrushFromTile(t); }
      return;
    }

    if (state.tool==='pencil'){
      beginAction({ kind: btn===2?'erase':'paint', layer: state.activeLayer });
      paintOne(tx,ty, btn===2);
    } else {
      state.shapeDrag.active = true; state.shapeDrag.startX = tx; state.shapeDrag.startY = ty; state.shapeDrag.endX = tx; state.shapeDrag.endY = ty;
      updatePreviewCells();
    }
  }
  function onCanvasMove(e){
    updateStatusFromEvent(e);
    if (!state.mouseDown) return;
    const {tx,ty} = tileFromEvent(e);

    if (state.activeLayer==='scripts') return; // no drag painting for scripts

    if (state.tool==='pencil'){
      paintOne(tx,ty, state.mouseButton===2);
    } else if (state.shapeDrag.active){
      state.shapeDrag.endX = tx; state.shapeDrag.endY = ty; updatePreviewCells();
    }
  }
  function onCanvasUp(){
    if (!state.mouseDown) return; state.mouseDown = false;

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
    // współrzędne w pikselach canvasu (po uwzględnieniu scrolla/pozycji w dokumencie)
    return {
      x: (evt.clientX - rect.left),
      y: (evt.clientY - rect.top)
    };
  }

  function tileFromEvent(evt){
    // pozycja kursora względem canvasu
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
    while(true){ out.push({x,y}); if (x===x1 && y===y1) break; const e2 = 2*err; if (e2> -dy){ err-=dy; x+=sx; } if (e2 < dx){ err+=dx; y+=sy; } }
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

  // ==========/ Save / Load JSON ==========
  function saveJSON(){
    const data = {
      name: (mapNameInput.value||'mapa').replace(/\s+/g,'_'),
      tileset: state.tileset.url,
      tileSize: state.tileSize,
      width: state.mapW, height: state.mapH,
      layers: {},
      scripts: state.scripts
    };
    for (const L of VISUAL_LAYERS){ data.layers[L] = state.layers[L]; }
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${data.name}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  }
  async function loadJSON(file){
    if (!file) return;
    const text = await file.text();
    let obj; try { obj = JSON.parse(text); } catch(e){ alert('Błędny JSON'); return; }
    const W = obj.width|0, H = obj.height|0; if (!W||!H){ alert('Brak width/height w JSON'); return; }
    state.tileSize = obj.tileSize|0 || state.tileSize; tileSizeInput.value = state.tileSize;
    if (obj.tileset){ await loadTileset(obj.tileset); tilesetSelect.value = obj.tileset; }
    resizeMap(W,H,false);
    for (const L of VISUAL_LAYERS){
      if (obj.layers && obj.layers[L]){
        for (let y=0;y<Math.min(H, obj.layers[L].length);y++){
          for (let x=0;x<Math.min(W, obj.layers[L][y].length);x++){
            const t = obj.layers[L][y][x];
            state.layers[L][y][x] = t && typeof t.r==='number' ? {r:t.r|0, g:t.g|0, b:t.b|0, a:t.a|0} : null;
          }
        }
      }
    }
    state.scripts = Array.isArray(obj.scripts) ? obj.scripts.map(s=>({kind:String(s.kind||'note'), x:s.x|0, y:s.y|0, props: s.props||{}})) : [];
    mapNameInput.value = (obj.name||'mapa');
    // clear history after load
    state.history.undo = []; state.history.redo = []; state.history.current=null; updateUndoRedoButtons();
    render();
  }

  // ==========/ Overlay (Script Editor) ==========
  function initOverlayUI(){
    // Sprite UI
    spriteUseToggle?.addEventListener('click', () => {
      const on = spriteUseToggle.classList.toggle('is-on');
      spriteUseToggle.setAttribute('aria-checked', String(on));
      renderSpritePreview();
    });
    spriteUseToggle?.addEventListener('keydown', (e) => {
      if (e.key===' ' || e.key==='Enter'){ e.preventDefault(); spriteUseToggle.click(); }
    });

    // Sprite sheets = use TILESETS for now
    spriteSheetSelect.innerHTML = '';
    TILESETS.forEach((url, i) => {
      const opt = document.createElement('option');
      opt.value = url; opt.textContent = url.split('/').pop() || url;
      if (i===0) opt.selected = true;
      spriteSheetSelect.appendChild(opt);
    });
    spriteSheetSelect.addEventListener('change', () => {
      renderSpritePreview();
      buildSpriteThumbs();
    });
    [spriteFrameX, spriteFrameY, spriteAnimSpeed, spriteDir, spriteLoop].forEach(el => {
      el?.addEventListener('change', renderSpritePreview);
    });

    // Actions UI
    actionAddBtn?.addEventListener('click', () => {
      const t = actionAddSel.value;
      addActionToCurrent(makeAction(t));
      rebuildFlow();
    });
    actionCollapseAll?.addEventListener('click', () => toggleAllItems(true));
    actionExpandAll?.addEventListener('click', () => toggleAllItems(false));
    actionClear?.addEventListener('click', () => {
      const s = getOverlayTarget(); if (!s) return;
      s.props = s.props || {};
      s.props.actions = [];
      rebuildFlow();
    });

    // Variables UI
    varsSearch?.addEventListener('input', () => { state.varsFilter.q = varsSearch.value.trim().toLowerCase(); renderVarsTable(); });
    varsTypeFilter?.addEventListener('change', () => { state.varsFilter.type = varsTypeFilter.value; renderVarsTable(); });
    varsResetFilter?.addEventListener('click', () => { state.varsFilter.q=''; state.varsFilter.type=''; varsSearch.value=''; varsTypeFilter.value=''; renderVarsTable(); });
    varsAddBtn?.addEventListener('click', () => { appendVariable(); renderVarsTable(); });
    varsExportBtn?.addEventListener('click', exportVariablesJSON);
    varsImportInput?.addEventListener('change', importVariablesJSON);

    ovSave?.addEventListener('click', saveOverlayBackToScript);
    ovClose?.addEventListener('click', closeOverlay);
  }

  function openOverlayFor(x,y){
    const s = findScriptAt(x,y);
    if (!s){ notify('Brak obiektu scripts na tej kratce.'); return; }
    state.selectedScript = {x,y};
    ensureDefaultScriptProps(s);
    // load variables once
    if (!state.varsLoaded) loadVariables();

    // Load sprite settings
    const sp = s.props.sprite || { use:false, sheet: TILESETS[0], fx:0, fy:0, speed:8, dir:'down', loop:true };
    spriteUseToggle.classList.toggle('is-on', !!sp.use);
    spriteUseToggle.setAttribute('aria-checked', String(!!sp.use));
    spriteSheetSelect.value = sp.sheet || TILESETS[0];
    spriteFrameX.value = sp.fx|0; spriteFrameY.value = sp.fy|0;
    spriteAnimSpeed.value = sp.speed|0 || 8;
    spriteDir.value = sp.dir || 'down';
    spriteLoop.checked = !!sp.loop;

    buildSpriteThumbs();
    renderSpritePreview();

    // Build actions list
    rebuildFlow();

    ov.style.display = 'flex';
    state.ovOpen = true;
  }
  function closeOverlay(){
    ov.style.display = 'none';
    state.ovOpen = false;
  }
  function saveOverlayBackToScript(){
    const s = getOverlayTarget(); if (!s) return;
    s.props = s.props || {};
    // sprite
    s.props.sprite = {
      use: spriteUseToggle.classList.contains('is-on'),
      sheet: spriteSheetSelect.value,
      fx: parseInt(spriteFrameX.value,10) || 0,
      fy: parseInt(spriteFrameY.value,10) || 0,
      speed: parseInt(spriteAnimSpeed.value,10) || 0,
      dir: spriteDir.value,
      loop: !!spriteLoop.checked
    };
    // actions -> already mutated while editing
    notify('Zapisano ustawienia skryptu');
    closeOverlay();
  }
  function getOverlayTarget(){
    if (!state.selectedScript) return null;
    return findScriptAt(state.selectedScript.x, state.selectedScript.y);
  }
  function ensureDefaultScriptProps(s){
    s.props = s.props || {};
    if (!Array.isArray(s.props.actions)) s.props.actions = [];
    if (!s.props.sprite) s.props.sprite = { use:false, sheet: TILESETS[0], fx:0, fy:0, speed:8, dir:'down', loop:true };
  }

  // --- Sprite preview / thumbs ---
  async function renderSpritePreview(){
    const ctx = spritePreview.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0,0,spritePreview.width, spritePreview.height);

    const use = spriteUseToggle.classList.contains('is-on');
    if (!use) return;

    const url = spriteSheetSelect.value || TILESETS[0];
    const img = await loadImageCached(url);
    const ts = state.tileSize;
    const fx = clamp(parseInt(spriteFrameX.value,10)||0, 0, Math.floor(img.width/ts)-1);
    const fy = clamp(parseInt(spriteFrameY.value,10)||0, 0, Math.floor(img.height/ts)-1);
    spriteFrameX.value = fx; spriteFrameY.value = fy;

    const sx = fx*ts, sy = fy*ts;
    const scale = Math.floor(Math.min(spritePreview.width, spritePreview.height) / (ts*1.25));
    const dw = ts*scale, dh = ts*scale;

    ctx.save();
    ctx.translate((spritePreview.width - dw)/2, (spritePreview.height - dh)/2);
    ctx.drawImage(img, sx, sy, ts, ts, 0, 0, dw, dh);
    ctx.restore();
  }
  async function buildSpriteThumbs(){
    spriteGrid.innerHTML = '';
    const url = spriteSheetSelect.value || TILESETS[0];
    const img = await loadImageCached(url);
    const ts = state.tileSize;
    const cols = Math.floor(img.width/ts);
    const rows = Math.floor(img.height/ts);
    // pokaż max 6x5 miniaturek od (0,0)
    const maxCols = Math.min(cols, 6);
    const maxRows = Math.min(rows, 5);

    for (let y=0;y<maxRows;y++){
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '6px';
      for (let x=0;x<maxCols;x++){
        const c = document.createElement('canvas');
        c.width = 48; c.height = 48; c.className = 'thumb';
        const cctx = c.getContext('2d'); cctx.imageSmoothingEnabled = false;
        cctx.drawImage(img, x*ts, y*ts, ts, ts, 0, 0, 48, 48);
        c.title = `(${x},${y})`;
        c.addEventListener('click', () => {
          spriteFrameX.value = x; spriteFrameY.value = y; renderSpritePreview();
          $$('.thumb', spriteGrid).forEach(el => el.classList.remove('is-active'));
          c.classList.add('is-active');
        });
        if ((parseInt(spriteFrameX.value,10)===x) && (parseInt(spriteFrameY.value,10)===y)) c.classList.add('is-active');
        row.appendChild(c);
      }
      spriteGrid.appendChild(row);
    }
  }
  async function loadImageCached(url){
    if (state.ovSpriteImgCache.has(url)) return state.ovSpriteImgCache.get(url);
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url; await img.decode();
    state.ovSpriteImgCache.set(url, img); return img;
  }

  // --- Actions flow ---
  function rebuildFlow(){
    flowList.innerHTML = '';
    const s = getOverlayTarget(); if (!s) return;
    const actions = s.props.actions || [];
    actions.forEach((act, i) => {
      flowList.appendChild(renderActionItem(act, i, actions));
    });
  }
 
    // ========== Actions rendering ==========

  function renderActionItem(act, i, list){
    const tpl = document.getElementById('tplActionItem');
    const root = tpl.content.firstElementChild.cloneNode(true);

    const head = root.querySelector('.flow__head');
    const body = root.querySelector('.flow__body');
    const badge = root.querySelector('[data-step]');
    const labelEl = root.querySelector('.label');

    root.dataset.index = String(i);
    badge.textContent = String(i+1);

    // Style by type
    const typeClass = {
      move: 'is-move',
      dialog: 'is-dialog',
      sleep: 'is-sleep',
      battle: 'is-battle',
      jump: 'is-jump',
      inventory: 'is-inventory'
    }[act.type] || '';
    if (typeClass) root.classList.add(typeClass);

    // Title/label
    labelEl.textContent = actionTitle(act);

    // Controls
    const btnCollapse = root.querySelector('.btn-collapse');
    const btnDup = root.querySelector('.btn-dup');
    const btnDel = root.querySelector('.btn-del');

    btnCollapse.addEventListener('click', () => {
      root.classList.toggle('is-collapsed');
    });
    btnDup.addEventListener('click', () => {
      duplicateActionAt(i);
    });
    btnDel.addEventListener('click', () => {
      removeActionAt(i);
    });

    // Drag & drop reordering
    const dragHandle = root.querySelector('.dragHandle');
    root.draggable = true;
    dragHandle.addEventListener('mousedown', () => { root.classList.add('is-dragging'); });
    root.addEventListener('dragstart', (e) => {
      root.classList.add('is-dragging');
      e.dataTransfer.setData('text/plain', String(i));
      e.dataTransfer.effectAllowed = 'move';
    });
    root.addEventListener('dragend', () => root.classList.remove('is-dragging'));
    root.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    root.addEventListener('drop', (e) => {
      e.preventDefault();
      const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const to = i;
      if (!Number.isNaN(from) && from !== to){
        moveAction(from, to);
      }
    });

    // Body editor
    buildActionEditor(body, act, i);

    return root;
  }

  function actionTitle(act){
    switch(act.type){
      case 'move': return 'Ruch obiektu';
      case 'dialog': return 'Dialogue box';
      case 'sleep': return 'Sleep (oczekiwanie)';
      case 'battle': return 'Wejście w walkę';
      case 'jump': return 'Animacja podskoku';
      case 'inventory': return 'Ekwipunek: add/remove';
      default: return 'Action';
    }
  }

  function buildActionEditor(container, act, idx){
    container.innerHTML = '';
    const appendRow = (label, inputEl, note) => {
      const row = document.createElement('div');
      row.className = 'row';
      const l = document.createElement('label');
      l.textContent = label;
      row.appendChild(l);
      const cell = document.createElement('div');
      cell.appendChild(inputEl);
      if (note){
        const n = document.createElement('div');
        n.className = 'note';
        n.textContent = note;
        cell.appendChild(n);
      }
      row.appendChild(cell);
      container.appendChild(row);
      return {row, cell};
    };

    // Small helpers
    const num = (v, step='1') => {
      const i = document.createElement('input');
      i.type = 'number';
      i.step = step;
      i.value = String(v|0);
      return i;
    };
    const numf = (v) => {
      const i = document.createElement('input');
      i.type = 'number';
      i.step = '0.01';
      i.value = String(Number(v || 0));
      return i;
    };
    const txt = (v, placeholder='') => {
      const i = document.createElement('input');
      i.type = 'text';
      i.value = v ?? '';
      if (placeholder) i.placeholder = placeholder;
      return i;
    };
    const area = (v, placeholder='') => {
      const t = document.createElement('textarea');
      t.value = v ?? '';
      if (placeholder) t.placeholder = placeholder;
      t.rows = 3;
      return t;
    };
    const chk = (v) => {
      const i = document.createElement('input');
      i.type = 'checkbox';
      i.checked = !!v;
      return i;
    };
    const sel = (options, v) => {
      const s = document.createElement('select');
      options.forEach(o => {
        const opt = document.createElement('option');
        if (typeof o === 'string'){ opt.value = o; opt.textContent = o; }
        else { opt.value = o.value; opt.textContent = o.label; }
        if (String(opt.value) === String(v)) opt.selected = true;
        s.appendChild(opt);
      });
      return s;
    };

    // Per-action editors
    switch(act.type){
      case 'move': {
        act.dx ??= 0; act.dy ??= 0; act.speed ??= 4;
        const inDx = num(act.dx);  appendRow('dx', inDx);
        const inDy = num(act.dy);  appendRow('dy', inDy);
        const inSp = num(act.speed); appendRow('speed', inSp, 'kafli / sekundę (orientacyjnie)');
        inDx.addEventListener('change', () => act.dx = parseInt(inDx.value,10) || 0);
        inDy.addEventListener('change', () => act.dy = parseInt(inDy.value,10) || 0);
        inSp.addEventListener('change', () => act.speed = parseInt(inSp.value,10) || 0);
        break;
      }
      case 'dialog': {
        act.text ??= '';
        act.speaker ??= '';
        const inSp = txt(act.speaker, 'nazwa mówiącego (opcjonalnie)');
        const inTx = area(act.text, 'Treść dialogu…');
        appendRow('speaker', inSp);
        appendRow('text', inTx);
        inSp.addEventListener('input', () => act.speaker = inSp.value);
        inTx.addEventListener('input', () => act.text = inTx.value);
        break;
      }
      case 'sleep': {
        act.ms ??= 500;
        const inMs = num(act.ms);
        const sk = chk(!!act.skippable);
        appendRow('ms', inMs);
        appendRow('skippable', sk);
        inMs.addEventListener('change', () => act.ms = parseInt(inMs.value,10) || 0);
        sk.addEventListener('change', () => act.skippable = !!sk.checked);
        break;
      }
      case 'battle': {
        // TODO: parametryzacja walki
        act.encounter ??= '';
        const inId = txt(act.encounter, 'encounterId //todo');
        appendRow('encounterId', inId, '//todo: parametryzacja walki');
        inId.addEventListener('input', () => act.encounter = inId.value);
        break;
      }
      case 'jump': {
        act.height ??= 1;
        act.dx ??= 0; act.dy ??= 0;
        act.duration ??= 300;
        const inH = numf(act.height);
        const inDx = num(act.dx);
        const inDy = num(act.dy);
        const inDur = num(act.duration);
        appendRow('height', inH);
        appendRow('dx', inDx);
        appendRow('dy', inDy);
        appendRow('duration', inDur, 'ms');
        inH.addEventListener('change', () => act.height = Number(inH.value) || 0);
        inDx.addEventListener('change', () => act.dx = parseInt(inDx.value,10) || 0);
        inDy.addEventListener('change', () => act.dy = parseInt(inDy.value,10) || 0);
        inDur.addEventListener('change', () => act.duration = parseInt(inDur.value,10) || 0);
        break;
      }
      case 'inventory': {
        // TODO: parametryzacja ekwipunku
        act.op ??= 'add';
        act.itemId ??= '';
        act.qty ??= 1;
        const inOp = sel([{value:'add',label:'add'}, {value:'remove',label:'remove'}], act.op);
        const inId = txt(act.itemId, 'itemId //todo');
        const inQty = num(act.qty);
        appendRow('op', inOp);
        appendRow('itemId', inId, '//todo: parametryzacja itemów');
        appendRow('qty', inQty);
        inOp.addEventListener('change', () => act.op = inOp.value);
        inId.addEventListener('input', () => act.itemId = inId.value);
        inQty.addEventListener('change', () => act.qty = parseInt(inQty.value,10) || 0);
        break;
      }
      default: {
        const p = document.createElement('div');
        p.textContent = 'Brak edytora dla tej akcji.';
        container.appendChild(p);
      }
    }
  }

  function addActionToCurrent(action){
    const s = getOverlayTarget(); if (!s) return;
    s.props.actions.push(action);
  }
  function removeActionAt(idx){
    const s = getOverlayTarget(); if (!s) return;
    s.props.actions.splice(idx, 1);
    rebuildFlow();
  }
  function duplicateActionAt(idx){
    const s = getOverlayTarget(); if (!s) return;
    const copy = deepClone(s.props.actions[idx]);
    s.props.actions.splice(idx+1, 0, copy);
    rebuildFlow();
  }
  function moveAction(from, to){
    const s = getOverlayTarget(); if (!s) return;
    const arr = s.props.actions;
    if (from<0 || to<0 || from>=arr.length || to>=arr.length) return;
    const [row] = arr.splice(from,1);
    arr.splice(to,0,row);
    rebuildFlow();
  }
  function toggleAllItems(collapsed){
    $$('.flow__item', flowList).forEach(el => {
      el.classList.toggle('is-collapsed', !!collapsed);
    });
  }

  function makeAction(type){
    switch(type){
      case 'move': return { type:'move', dx:0, dy:0, speed:4 };
      case 'dialog': return { type:'dialog', text:'', speaker:'' };
      case 'sleep': return { type:'sleep', ms:500, skippable:false };
      case 'battle': return { type:'battle', encounter:'' /* //todo */ };
      case 'jump': return { type:'jump', height:1, dx:0, dy:0, duration:300 };
      case 'inventory': return { type:'inventory', op:'add', itemId:'', qty:1 /* //todo */ };
      default: return { type:'unknown' };
    }
  }

  // ========== Variables ==========
  async function loadVariables(){
    try {
      const res = await fetch('./assets/variables.json', { cache: 'no-store' });
      if (res.ok){
        const data = await res.json();
        state.vars = normalizeVars(data);
      } else {
        state.vars = makeDefaultVars();
      }
    } catch {
      state.vars = makeDefaultVars();
    }
    state.varsLoaded = true;
    renderVarsTable();
  }

  function normalizeVars(data){
    // Accept either array of objects or object map {id:{...}}
    let arr = [];
    if (Array.isArray(data)) arr = data;
    else if (data && typeof data === 'object'){
      arr = Object.keys(data).map(k => ({ id: Number(k), ...data[k]}));
    }
    // Coerce fields and set defaults
    return arr.map((v,i) => ({
      id: v.id ?? (i+1),
      name: v.name ?? `Variable ${i+1}`,
      type: v.type ?? 'int',
      options: Array.isArray(v.options) ? v.options.slice() : [],
      default: v.default ?? defaultForType(v.type ?? 'int')
    }));
  }

  function makeDefaultVars(){
    const N = 1000;
    return Array.from({length:N}, (_,i)=> ({
      id: i+1,
      name: `Variable ${i+1}`,
      type: 'int',
      options: [],
      default: 0
    }));
  }

  function defaultForType(t){
    switch(t){
      case 'bool': return false;
      case 'float': return 0;
      case 'enum': return '';
      case 'enum_flags': return [];
      case 'int':
      default: return 0;
    }
  }

  function renderVarsTable(){
    varsTableBody.innerHTML = '';
    if (!state.varsLoaded) return;
    const q = (state.varsFilter.q || '').toLowerCase();
    const t = state.varsFilter.type || '';

    const rows = state.vars.filter(v => {
      const matchesQ = !q || (String(v.id).includes(q) || (v.name||'').toLowerCase().includes(q));
      const matchesT = !t || v.type===t;
      return matchesQ && matchesT;
    });

    rows.forEach(v => varsTableBody.appendChild(buildVarRow(v)));
  }

  function buildVarRow(v){
    const tr = document.createElement('tr');

    // id
    const cId = document.createElement('td'); cId.textContent = String(v.id); tr.appendChild(cId);

    // name
    const cName = document.createElement('td');
    cName.className = 'vars__name';
    const inName = document.createElement('input');
    inName.type = 'text'; inName.value = v.name || '';
    inName.addEventListener('input', () => v.name = inName.value);
    cName.appendChild(inName);
    tr.appendChild(cName);

    // type
    const cType = document.createElement('td');
    cType.className = 'vars__type';
    const inType = document.createElement('select');
    ['int','bool','float','enum','enum_flags'].forEach(t => {
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = t;
      if (v.type === t) opt.selected = true;
      inType.appendChild(opt);
    });
    inType.addEventListener('change', () => {
      v.type = inType.value;
      // reset default/options sensibly
      if (v.type==='enum' || v.type==='enum_flags'){
        v.options = v.options && v.options.length ? v.options : ['A','B','C'];
        v.default = v.type==='enum' ? (v.options[0] || '') : [];
      } else {
        v.options = [];
        v.default = defaultForType(v.type);
      }
      // rebuild the row UI since cells differ per type
      tr.replaceWith(buildVarRow(v));
    });
    cType.appendChild(inType);
    tr.appendChild(cType);

    // options / flags
    const cOpts = document.createElement('td');
    if (v.type==='enum' || v.type==='enum_flags'){
      const inOpts = document.createElement('input');
      inOpts.type = 'text';
      inOpts.placeholder = 'opcje, rozdzielone przecinkami';
      inOpts.value = (v.options || []).join(', ');
      inOpts.addEventListener('change', () => {
        v.options = inOpts.value.split(',').map(s => s.trim()).filter(Boolean);
        // keep default valid
        if (v.type==='enum'){
          if (!v.options.includes(v.default)) v.default = v.options[0] || '';
        } else if (v.type==='enum_flags'){
          v.default = Array.isArray(v.default) ? v.default.filter(x => v.options.includes(x)) : [];
        }
        tr.replaceWith(buildVarRow(v));
      });
      cOpts.appendChild(inOpts);

      // inline tags for flags
      if (v.type==='enum_flags'){
        const tagsWrap = document.createElement('div');
        tagsWrap.className = 'tags';
        (v.options || []).forEach(opt => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'tag' + (Array.isArray(v.default) && v.default.includes(opt) ? ' is-on' : '');
          b.textContent = opt;
          b.addEventListener('click', () => {
            const arr = Array.isArray(v.default) ? v.default : [];
            const on = arr.includes(opt);
            if (on) v.default = arr.filter(x => x!==opt);
            else v.default = [...arr, opt];
            b.classList.toggle('is-on', !on);
          });
          tagsWrap.appendChild(b);
        });
        cOpts.appendChild(tagsWrap);
      }
    } else {
      cOpts.innerHTML = '<span class="pill">—</span>';
    }
    tr.appendChild(cOpts);

    // default
    const cDef = document.createElement('td');
    if (v.type==='int'){
      const inp = document.createElement('input'); inp.type='number'; inp.step='1'; inp.value = String(v.default|0);
      inp.addEventListener('change', () => v.default = parseInt(inp.value,10) || 0);
      cDef.appendChild(inp);
    } else if (v.type==='float'){
      const inp = document.createElement('input'); inp.type='number'; inp.step='0.01'; inp.value = String(Number(v.default||0));
      inp.addEventListener('change', () => v.default = Number(inp.value) || 0);
      cDef.appendChild(inp);
    } else if (v.type==='bool'){
      const inp = document.createElement('input'); inp.type='checkbox'; inp.checked = !!v.default;
      inp.addEventListener('change', () => v.default = !!inp.checked);
      cDef.appendChild(inp);
    } else if (v.type==='enum'){
      const sel = document.createElement('select');
      (v.options||[]).forEach(o => {
        const opt = document.createElement('option'); opt.value=o; opt.textContent=o; if (o===v.default) opt.selected = true; sel.appendChild(opt);
      });
      sel.addEventListener('change', () => v.default = sel.value);
      cDef.appendChild(sel);
    } else if (v.type==='enum_flags'){
      // summary pill
      const pill = document.createElement('span'); pill.className='pill';
      const sync = () => pill.textContent = (Array.isArray(v.default)&&v.default.length) ? v.default.join(' | ') : '(none)';
      sync();
      cDef.appendChild(pill);
    }
    tr.appendChild(cDef);

    return tr;
  }

  function appendVariable(){
    const maxId = state.vars.reduce((m,v)=> Math.max(m, Number(v.id)||0), 0);
    state.vars.push({
      id: maxId + 1,
      name: `Variable ${maxId+1}`,
      type: 'int',
      options: [],
      default: 0
    });
  }

  function exportVariablesJSON(){
    const blob = new Blob([JSON.stringify(state.vars, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'variables.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importVariablesJSON(e){
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try{
      const text = await file.text();
      const data = JSON.parse(text);
      state.vars = normalizeVars(data);
      state.varsLoaded = true;
      renderVarsTable();
      notify('Zaimportowano variables.json');
    } catch(err){
      alert('Niepoprawny JSON variables');
    } finally {
      e.target.value = '';
    }
  }

  // ========== Misc helpers ==========
  function snapshotAll(){
    const snap = { W: state.mapW, H: state.mapH, layers: {}, scripts: deepClone(state.scripts) };
    for (const L of VISUAL_LAYERS){ snap.layers[L] = deepClone(state.layers[L]); }
    return snap;
  }
  function restoreSnapshot(snap){
    state.mapW = snap.W; state.mapH = snap.H; mapWInput.value = snap.W; mapHInput.value = snap.H;
    for (const L of VISUAL_LAYERS){ state.layers[L] = deepClone(snap.layers[L]); }
    state.scripts = deepClone(snap.scripts);
    resizeMapCanvas();
  }

  function clamp(v,min,max){ return Math.max(min, Math.min(max,v)); }
  function deepClone(o){ return JSON.parse(JSON.stringify(o)); }
  function cloneTile(t){ return t? {r:t.r|0, g:t.g|0, b:t.b|0, a:t.a|0} : null; }
  function tilesEqual(a,b){ if (!a && !b) return true; if (!a || !b) return false; return a.r===b.r && a.g===b.g && a.b===b.b && a.a===b.a; }
  function tryParseJSON(s){ if (!s || !s.trim()) return {}; try { return JSON.parse(s); } catch(e){ alert('Props: błędny JSON'); return undefined; } }

  function notify(msg){
    if (!toast) return alert(msg);
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(notify._t);
    notify._t = setTimeout(() => toast.classList.add('hidden'), 1800);
  }

  // Boot overlay variables if overlay already opened (e.g., hot reload)
  if (state.ovOpen && !state.varsLoaded) loadVariables();

})();
