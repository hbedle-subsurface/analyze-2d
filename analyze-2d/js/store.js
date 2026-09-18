/* ============================ stage store ============================
   State carried from one step page to the next, in IndexedDB.

   Two object stores:
     stages  one record per processing step that has run, holding the section
             that step produced: {data, nx, ns, dt, j0} plus a meta object
     kv      small records by name: the line description, the measured band,
             the attribute settings, and the SOM runs

   A Float32Array survives the structured clone IndexedDB uses, so samples go
   in and come out as themselves.

   Skipping a step is recorded by the absence of its stage. A page works on the
   latest stage before it that exists, so a student can go from the crop
   straight to the attributes. Rerunning a step drops everything after it, so
   nothing downstream is left describing a section that no longer exists.

   Nothing in this file draws or reads the document. Every call returns a
   promise. */

const A2_DB = "analyze-2d";
const A2_VERSION = 1;

/* The order the steps run in. `raw` is the line as read; `crop` is always
   written by step 1, even when the crop is the whole line. */
const STAGES = ["raw", "crop", "fk", "sos", "balance"];

const STAGE_NAMES = {
  raw: "the line as read",
  crop: "the cropped line",
  fk: "the f-k filter output",
  sos: "the structure-oriented smoothing output",
  balance: "the spectrally balanced line"
};

function a2Open(){
  return new Promise((ok, fail) => {
    const rq = indexedDB.open(A2_DB, A2_VERSION);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains("stages"))
        db.createObjectStore("stages", {keyPath: "stage"});
      if (!db.objectStoreNames.contains("kv"))
        db.createObjectStore("kv", {keyPath: "key"});
    };
    rq.onsuccess = () => ok(rq.result);
    rq.onerror = () => fail(rq.error);
  });
}

function a2Tx(store, mode, run){
  return a2Open().then(db => new Promise((ok, fail) => {
    const tx = db.transaction(store, mode);
    const st = tx.objectStore(store);
    let rq;
    try { rq = run(st); } catch (e){ db.close(); fail(e); return; }
    tx.oncomplete = () => { db.close(); ok(rq && rq.result !== undefined ? rq.result : undefined); };
    tx.onerror = () => { db.close(); fail(tx.error); };
    tx.onabort = () => { db.close(); fail(tx.error || new Error("Storage transaction aborted")); };
  }));
}

/* ---------- stages ---------- */
function stageSave(name, section, meta){
  return a2Tx("stages", "readwrite", st => st.put({
    stage: name, data: section.data, nx: section.nx, ns: section.ns,
    dt: section.dt, j0: section.j0 || 0, meta: meta || {}, ts: Date.now()
  }));
}

function stageLoad(name){
  return a2Tx("stages", "readonly", st => st.get(name)).then(r => r || null);
}

function stageDrop(name){
  return a2Tx("stages", "readwrite", st => st.delete(name));
}

function stageDropAfter(name){
  const i = STAGES.indexOf(name);
  if (i < 0) return Promise.resolve();
  const kill = STAGES.slice(i + 1);
  return a2Tx("stages", "readwrite", st => { kill.forEach(k => st.delete(k)); });
}

/* Which stages exist, without their samples. */
function stageList(){
  return a2Tx("stages", "readonly", st => st.getAllKeys()).then(keys => keys || []);
}

/* The latest stage strictly before `name` that exists, with its samples. For
   the attribute and SOM pages, pass null to get the latest of all. */
async function stageInput(name){
  const have = await stageList();
  const i = name ? STAGES.indexOf(name) : STAGES.length;
  for (let k = i - 1; k >= 0; k--)
    if (have.includes(STAGES[k])) return stageLoad(STAGES[k]);
  return null;
}

/* ---------- small records ---------- */
function kvGet(key){
  return a2Tx("kv", "readonly", st => st.get(key)).then(r => r ? r.value : null);
}
function kvSet(key, value){
  return a2Tx("kv", "readwrite", st => st.put({key, value}));
}
function kvDelete(key){
  return a2Tx("kv", "readwrite", st => st.delete(key));
}

/* A new line clears everything: stages, measurements, attribute settings and
   SOM runs all describe the line they were made from. */
function a2ClearAll(){
  return Promise.all([
    a2Tx("stages", "readwrite", st => st.clear()),
    a2Tx("kv", "readwrite", st => st.clear())
  ]);
}
