import { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { parseStyle, applyCurveChannel, applyHsl, applyColorBalance } from './presetEngine';
import { Aperture, Upload, Image as ImageIcon, SlidersHorizontal, ScanFace, WandSparkles, Download, RotateCcw, X, ChevronLeft, ChevronRight } from 'lucide-react';

type Photo = { id: string; name: string; url: string; file: File };
type Adjustments = { exposure: number; contrast: number; saturation: number; warmth: number };
type Preset = { id:string; name:string; family:string; source:string; params:Record<string,string>; adjustments:Adjustments; curves:Record<string,[number,number][]>; hsl:Record<string,{h:number;s:number;l:number}>; colorBalance:Record<string,number[]>; unsupportedParams:string[]; colorCorrections:string[][]; format:'xmp'|'costyle' };
const initial: Adjustments = { exposure: 0, contrast: 0, saturation: 0, warmth: 0 };
const bundledPresets: Preset[] = [{"id":"bundled-b-w","name":"B&W","family":"Lightroom / Camera Raw","source":"B&W.xmp","params":{"Temperature":"5500","Exposure2012":"0.15","Contrast2012":"-27","Saturation":"-100"},"adjustments":{"exposure":15,"contrast":-27,"saturation":-50,"warmth":0},"curves":{},"hsl":{},"colorBalance":{},"unsupportedParams":[],"colorCorrections":[],"format":"xmp"},{"id":"bundled-basic","name":"Basic","family":"Lightroom / Camera Raw","source":"Basic.xmp","params":{"Temperature":5500,"Exposure2012":"-0.20","Contrast2012":"-24","Saturation":"-29"},"adjustments":{"exposure":-20,"contrast":-24,"saturation":-29,"warmth":0},"curves":{},"hsl":{},"colorBalance":{},"unsupportedParams":[],"colorCorrections":[],"format":"xmp"},{"id":"bundled-basic-2","name":"Basic 2","family":"Lightroom / Camera Raw","source":"Basic 2.xmp","params":{"Temperature":"5850","Exposure2012":"0.00","Contrast2012":"-22","Saturation":"-24"},"adjustments":{"exposure":0,"contrast":-22,"saturation":-24,"warmth":14},"curves":{},"hsl":{},"colorBalance":{},"unsupportedParams":[],"colorCorrections":[],"format":"xmp"},{"id":"bundled-frappe","name":"Frappe","family":"Lightroom / Camera Raw","source":"Frappe.xmp","params":{"Temperature":"6793","Exposure2012":"-0.10","Contrast2012":"-31","Saturation":"-20"},"adjustments":{"exposure":-10,"contrast":-31,"saturation":-20,"warmth":51.72},"curves":{},"hsl":{},"colorBalance":{},"unsupportedParams":[],"colorCorrections":[],"format":"xmp"},{"id":"bundled-mocco","name":"Mocco","family":"Lightroom / Camera Raw","source":"Mocco.xmp","params":{"Temperature":"5450","Exposure2012":"-0.15","Contrast2012":"-61","Saturation":"0"},"adjustments":{"exposure":-15,"contrast":-50,"saturation":0,"warmth":-2},"curves":{},"hsl":{},"colorBalance":{},"unsupportedParams":[],"colorCorrections":[],"format":"xmp"}];

export default function App() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [presets, setPresets] = useState<Preset[]>(bundledPresets);
  const [appliedStyles,setAppliedStyles] = useState<Record<string,Preset>>({});
  const presetInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(0);
  const [adjustments, setAdjustments] = useState<Record<string, Adjustments>>({});
  const [analysis, setAnalysis] = useState<Record<string, {brightness:number; contrast:number; clipped:number; recommendation:string}>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = photos[active];
  const adjust = current ? adjustments[current.id] || initial : initial;
  const filter = useMemo(() => current ? `brightness(${Math.pow(2, adjust.exposure / 100)}) contrast(${100 + adjust.contrast}%) saturate(${100 + adjust.saturation}%) sepia(${Math.max(0, adjust.warmth) / 250}) hue-rotate(${Math.min(0, adjust.warmth) / 2}deg)` : 'none', [current, adjust]);
  useEffect(() => {
    const canvas=previewCanvasRef.current;
    if(!canvas||!current)return;
    const image=new Image(); image.onload=()=>{
      canvas.width=image.naturalWidth; canvas.height=image.naturalHeight;
      const ctx=canvas.getContext('2d',{willReadFrequently:true}); if(!ctx)return;
      ctx.filter=filter;ctx.drawImage(image,0,0);ctx.filter='none';
      const style=appliedStyles[current.id];
      if(style){const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);const map=[['GradationCurve','rgb'],['GradationCurveY','rgb'],['ToneCurvePV2012','rgb'],['ToneCurvePV2012Red','r'],['ToneCurvePV2012Green','g'],['ToneCurvePV2012Blue','b'],['GradationCurveY','rgb'],['GradationCurveRed','r'],['GradationCurveGreen','g'],['GradationCurveBlue','b']] as const;for(const [key,ch] of map){const points=style.curves[key];if(points?.length)applyCurveChannel(pixels.data,points,ch);}applyHsl(pixels.data,style.hsl);applyColorBalance(pixels.data,style.colorBalance);ctx.putImageData(pixels,0,0);}
    };image.src=current.url;
  },[current,filter,appliedStyles]);
  async function importPresets(files: FileList | null) {
    if (!files) return;
    const parsed: Preset[] = [];
    const candidates: File[] = [];
    for (const file of Array.from(files)) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        const archive = await JSZip.loadAsync(file);
        for (const [path, entry] of Object.entries(archive.files)) {
          if (entry.dir || path.includes('__MACOSX/') || path.split('/').some(part=>part.startsWith('._'))) continue;
          if (!/\.(xmp|costyle)$/i.test(path)) continue;
          candidates.push(new File([await entry.async('blob')], path.split('/').pop() || 'preset.xmp'));
        }
      } else if (/\.(xmp|costyle)$/i.test(file.name)) candidates.push(file);
    }
    for (const file of candidates) {
      const ext = file.name.toLowerCase().split('.').pop();
      if (ext !== 'xmp' && ext !== 'costyle') continue;
      const source = await file.text();
      const params: Record<string,string> = {};
      let name = file.name.replace(/\.(xmp|costyle)$/i, '');
      if (ext === 'costyle') {
        for (const match of source.matchAll(/<E\s+K="([^"]+)"\s+V="([^"]*)"\s*\/>/g)) params[match[1]] = match[2];
        name = params.Name || name;
      } else {
        for (const match of source.matchAll(/crs:([A-Za-z0-9]+)="([^"]*)"/g)) params[match[1]] = match[2];
        name = params.Name || params.PresetName || name;
      }
      const structured = parseStyle(source,file.name);
      Object.assign(params, structured.params);
      name = structured.name || name;
      const num = (key:string, fallback=0) => { const value=Number(params[key]); return Number.isFinite(value)?value:fallback; };
      const isC1=ext==='costyle';
      const exposure=isC1?num('Exposure')*100:num('Exposure2012')*100;
      const contrast=isC1?num('Contrast'):num('Contrast2012');
      const saturation=isC1?num('Saturation'):num('Saturation');
      const warmth=isC1?num('Temperature')===0?0:(num('Temperature')-5500)/25:(num('Temperature')===0?0:(num('Temperature')-5500)/25);
      const supported=new Set(['Exposure','Exposure2012','Contrast','Contrast2012','Saturation','Temperature','Name','PresetName','GradationCurve','GradationCurveY','GradationCurveRed','GradationCurveGreen','GradationCurveBlue','ToneCurvePV2012','ToneCurvePV2012Red','ToneCurvePV2012Green','ToneCurvePV2012Blue','ColorBalanceShadow','ColorBalanceMidtone','ColorBalanceHighlight']); for(const channel of ['Red','Orange','Yellow','Green','Aqua','Blue','Purple','Magenta'])for(const kind of ['Hue','Saturation','Luminance'])supported.add(kind+'Adjustment'+channel); const unsupportedParams=Object.keys(params).filter(key=>!supported.has(key)&&!Object.keys(structured.curves).includes(key));
      parsed.push({id:file.name+'-'+file.size+'-'+file.lastModified,name,family:isC1?'Capture One':'Lightroom / Camera Raw',source:file.name,params,curves:structured.curves,hsl:structured.hsl,colorBalance:structured.colorBalance,colorCorrections:structured.colorCorrections,unsupportedParams,format:structured.format,adjustments:{exposure:Math.max(-100,Math.min(100,exposure)),contrast:Math.max(-50,Math.min(50,contrast)),saturation:Math.max(-50,Math.min(50,saturation)),warmth:Math.max(-100,Math.min(100,warmth))}});
    }
    setPresets(prev=>[...prev,...parsed.filter(p=>!prev.some(old=>old.id===p.id))]);
  }
  function applyPreset(preset:Preset) {
    if (!current) return;
    setAdjustments(prev=>({...prev,[current.id]:preset.adjustments})); setAppliedStyles(prev=>({...prev,[current.id]:preset}));
  }
  function addFiles(files: FileList | null) {
    if (!files) return;
    const accepted = Array.from(files).filter(f => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name));
    const next = accepted.map(file => ({ id: crypto.randomUUID(), name: file.name, url: URL.createObjectURL(file), file }));
    setPhotos(prev => [...prev, ...next]);
    if (!current && next.length) setActive(0);
  }
  function remove(id: string) {
    setPhotos(prev => { const index = prev.findIndex(p => p.id === id); const item = prev[index]; if (item) URL.revokeObjectURL(item.url); const next = prev.filter(p => p.id !== id); setActive(Math.max(0, Math.min(index <= active ? active - 1 : active, next.length - 1))); return next; });
  }
  function setValue(key: keyof Adjustments, value: number) { if (!current) return; setAdjustments(prev => ({ ...prev, [current.id]: { ...(prev[current.id] || initial), [key]: value } })); }
  function resetCurrent() { if (current) { setAdjustments(prev => ({ ...prev, [current.id]: initial })); setAppliedStyles(prev=>{const next={...prev};delete next[current.id];return next;}); } }
  async function analyzeSeries() {
    if (!photos.length || analyzing) return;
    setAnalyzing(true);
    try {
      const results: Record<string, {brightness:number; contrast:number; clipped:number; recommendation:string}> = {};
      for (const photo of photos) {
        const image = new Image(); image.src = photo.url;
        await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Не удалось прочитать ' + photo.name)); });
        const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d', {willReadFrequently:true}); if (!ctx) throw new Error('Canvas недоступен');
        ctx.drawImage(image,0,0,64,64); const data=ctx.getImageData(0,0,64,64).data;
        let sum=0,sum2=0,clipped=0,n=0;
        for(let i=0;i<data.length;i+=4){const y=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];sum+=y;sum2+=y*y;if(y<5||y>250)clipped++;n++;}
        const mean=sum/n; const brightness=Math.round(mean/255*100); const contrast=Math.round(Math.sqrt(Math.max(0,sum2/n-mean*mean))/255*100); const clip=Math.round(clipped/n*100);
        results[photo.id]={brightness,contrast,clipped:clip,recommendation:brightness<38?'Кадр тёмный: проверьте экспозицию':brightness>72?'Кадр светлый: проверьте экспозицию':clip>8?'Проверьте клиппинг светов и теней':'Явных проблем по яркости не выявлено'};
      }
      setAnalysis(results);
    } catch(error) { alert(error instanceof Error ? error.message : 'Ошибка анализа'); }
    finally { setAnalyzing(false); }
  }

  async function exportBatch() {
    if (!photos.length || exporting) return;
    setExporting(true);
    try {
      for (const photo of photos) {
        const image = new Image(); image.src = photo.url;
        await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Не удалось открыть ' + photo.name)); });
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas недоступен');
        const a = adjustments[photo.id] || initial; ctx.filter = `brightness(${Math.pow(2,a.exposure/100)}) contrast(${100+a.contrast}%) saturate(${100+a.saturation}%) sepia(${Math.max(0,a.warmth)/250}) hue-rotate(${Math.min(0,a.warmth)/2}deg)`; ctx.drawImage(image, 0, 0);
        const style=appliedStyles[photo.id]; if(style){const pixels=ctx.getImageData(0,0,canvas.width,canvas.height); const map=[['GradationCurve','rgb'],['GradationCurveY','rgb'],['ToneCurvePV2012','rgb'],['ToneCurvePV2012Red','r'],['ToneCurvePV2012Green','g'],['ToneCurvePV2012Blue','b'],['GradationCurveRed','r'],['GradationCurveGreen','g'],['GradationCurveBlue','b']] as const; for(const [key,ch] of map){const points=style.curves[key]; if(points?.length)applyCurveChannel(pixels.data,points,ch);} applyHsl(pixels.data,style.hsl); applyColorBalance(pixels.data,style.colorBalance); ctx.putImageData(pixels,0,0);}
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Не удалось обработать ' + photo.name)), 'image/png'));
        const url = URL.createObjectURL(blob); const link = document.createElement('a');
        link.href = url; link.download = photo.name.replace(/\.[^.]+$/, '') + '-edited.png';
        document.body.appendChild(link); link.click(); link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        await new Promise(resolve => window.setTimeout(resolve, 250));
      }
    } catch (error) { alert(error instanceof Error ? error.message : 'Ошибка экспорта'); }
    finally { setExporting(false); }
  }
  return <main className="app">
    <header className="topbar"><div className="brand"><span className="brand-icon"><Aperture size={20}/></span><span>PHOTO<span className="muted"> / AI EDITOR</span></span><span className="version">BROWSER PROTOTYPE</span></div><div className="top-actions"><span className="status"><i/> LOCAL WORKSPACE</span><button className="export" disabled={!photos.length || exporting} onClick={exportBatch}><Download size={15}/> {exporting ? 'Exporting…' : 'Export batch'}</button></div></header>
    <section className="workspace">
      <aside className="library"><div className="section-head"><span>PROJECT LIBRARY</span><span className="count">{photos.length.toString().padStart(2,'0')}</span></div><div className="project-name"><div className="folder">▦</div><div><strong>Untitled project</strong><small>Session · Unsaved</small></div></div><div className="library-label">IMAGES <span>{photos.length}</span></div>
      {photos.length === 0 ? <button className="dropzone" onClick={() => inputRef.current?.click()}><Upload size={22}/><b>Import photos</b><small>JPEG, PNG, WebP</small></button> : <div className="thumb-list">{photos.map((p,i)=><button key={p.id} className={`thumb ${i===active?'selected':''}`} onClick={()=>setActive(i)}><img src={p.url}/><span className="thumb-index">{String(i+1).padStart(2,'0')}</span><span className="thumb-name">{p.name}</span><span className="remove" onClick={e=>{e.stopPropagation();remove(p.id);}}><X size={13}/></span></button>)}</div>}
      <button className="add-more" onClick={()=>inputRef.current?.click()}><Upload size={14}/> Add images</button><input ref={inputRef} type="file" accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif" multiple hidden onChange={e=>addFiles(e.target.files)}/><div className="library-foot"><span>SUPPORTED FORMATS</span><p>JPG · PNG · WEBP</p><p className="subtle">RAW support planned</p></div></aside>
      <section className="canvas-area"><div className="canvas-toolbar"><div className="crumb">PROJECT <span>/</span> {current ? current.name.toUpperCase() : 'NO IMAGE SELECTED'}</div><div className="view-controls"><span className="view-tag">FIT</span><span className="view-tag">100%</span></div></div><div className="canvas">{current ? <><div className="image-wrap"><canvas ref={previewCanvasRef} className="main-image" aria-label={current.name}/><div className="image-badge">PREVIEW · ADJUSTMENTS</div></div><div className="image-nav"><button disabled={active===0} onClick={()=>setActive(active-1)}><ChevronLeft size={16}/></button><span>{String(active+1).padStart(2,'0')} / {String(photos.length).padStart(2,'0')}</span><button disabled={active===photos.length-1} onClick={()=>setActive(active+1)}><ChevronRight size={16}/></button></div></> : <div className="empty"><div className="empty-icon"><ImageIcon size={28}/></div><h2>Your workspace is ready</h2><p>Import a set of images to start reviewing and adjusting your photo series.</p><button className="primary" onClick={()=>inputRef.current?.click()}><Upload size={15}/> Import photos</button><small>Start with JPEG, PNG or WebP files</small></div>}</div><div className="filmstrip">{photos.map((p,i)=><button key={p.id} className={i===active?'film-active':''} onClick={()=>setActive(i)}><img src={p.url}/></button>)}{photos.length>0&&<button className="film-add" onClick={()=>inputRef.current?.click()}><Upload size={15}/></button>}</div></section>
      <aside className="inspector"><div className="section-head"><span>IMAGE WORKFLOW</span><span className="live">● LIVE</span></div><div className="workflow"><div className="step active"><span className="step-num">01</span><div><b>Image review</b><small>Import & select frames</small></div><span className="step-state">ACTIVE</span></div><div className={`step ${Object.keys(analysis).length?'active':''}`}><span className="step-num">02</span><div><b>Image Analysis</b><small>Brightness, contrast, clipping</small></div><span className="soon">{Object.keys(analysis).length?'DONE':'LOCAL'}</span></div><div className="step disabled"><span className="step-num">03</span><div><b>Neutralization</b><small>Technical base correction</small></div><span className="soon">SOON</span></div><div className="step disabled"><span className="step-num">04</span><div><b>Creative grade</b><small>Series-aware color profile</small></div><span className="soon">SOON</span></div><div className="step disabled"><span className="step-num">05</span><div><b>AI Retouch</b><small>Skin & detail refinement</small></div><span className="soon">SOON</span></div></div><div className="panel-title"><SlidersHorizontal size={15}/> MANUAL PREVIEW <button onClick={()=>resetCurrent()} title="Reset"><RotateCcw size={13}/></button></div>{([['exposure','Exposure',-100,100],['contrast','Contrast',-50,50],['saturation','Saturation',-50,50],['warmth','Warmth',-100,100]] as const).map(([key,label,min,max])=><div className="slider-row" key={key}><div className="slider-label"><span>{label}</span><span className="slider-value">{adjust[key]>0?'+':''}{adjust[key]}</span></div><input type="range" min={min} max={max} value={adjust[key]} disabled={!current} onChange={e=>setValue(key,Number(e.target.value))}/><div className="slider-scale"><span>{key==='exposure'?'−1 EV':key==='warmth'?'Cool':'−'}</span><span>{key==='exposure'?'+1 EV':key==='warmth'?'Warm':'+'}</span></div></div>)}<div className="panel-title"><WandSparkles size={15}/> PRESET LIBRARY <button onClick={()=>presetInputRef.current?.click()} title="Import XMP or Capture One styles"><Upload size={13}/></button></div>
      <input ref={presetInputRef} type="file" accept=".xmp,.costyle,.zip" multiple hidden onChange={e=>{void importPresets(e.target.files).finally(()=>{if(presetInputRef.current)presetInputRef.current.value='';});}}/>
      <div className="preset-library"><button className="auto-button" onClick={()=>presetInputRef.current?.click()}>Import presets or ZIP archive (.xmp, .costyle, .zip)</button>{presets.length===0?<small>Import preset files to build a local library. Source parameters are retained. Recognized curves, Adobe HSL ranges and supported color-balance triples are rendered in preview and export; other vendor controls remain unrendered.</small>:presets.map(p=><button className="auto-button" key={p.id} disabled={!current} onClick={()=>applyPreset(p)}><span>{p.name}</span><small>{p.family} · {p.source} · {Object.keys(p.params).length} source parameters · {Object.keys(p.curves).length+Object.keys(p.hsl).length+Object.keys(p.colorBalance).length} recognized groups · {p.unsupportedParams.length} not rendered{p.colorCorrections.length?` · ${p.colorCorrections.length} C1 correction rows preserved, not rendered`:''}</small></button>)}</div><div className="notice"><WandSparkles size={15}/><span>Adjustments are applied to exported PNG files in the browser. AI processing is not connected yet.</span></div><div className="inspector-bottom"><button className="ai-button" disabled={!photos.length || analyzing} onClick={analyzeSeries}><ScanFace size={15}/> {analyzing?'Analyzing…':'Analyze series'} <span>{Object.keys(analysis).length?'RE-RUN':'LOCAL'}</span></button>{current && analysis[current.id] && <div className="analysis-card"><b>LOCAL IMAGE ANALYSIS</b><p>Brightness <strong>{analysis[current.id].brightness}%</strong> · Contrast <strong>{analysis[current.id].contrast}%</strong> · Clipped <strong>{analysis[current.id].clipped}%</strong></p><small>{analysis[current.id].recommendation}</small><button className="auto-button" onClick={()=>setValue('exposure',Math.max(-100,Math.min(100,Math.round((50-analysis[current.id].brightness)*1.5))))}>Apply exposure suggestion</button></div>}<small>Heuristic pixel metrics; AI model is not connected.</small></div></aside>
    </section>
  </main>;
}
