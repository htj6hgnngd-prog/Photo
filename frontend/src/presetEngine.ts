export type CurvePoint = [number, number];
export type ParsedStyle = { name: string; format: 'xmp' | 'costyle'; params: Record<string,string>; curves: Record<string,CurvePoint[]>; hsl: Record<string,{h:number;s:number;l:number}>; colorBalance: Record<string,number[]>; colorCorrections: string[][]; };
const channels = ['Red','Orange','Yellow','Green','Aqua','Blue','Purple','Magenta'];
function curve(value?:string):CurvePoint[] { if(!value)return []; return value.split(/[;,]/).length<4?[]:(value.split(';').map(p=>p.split(',').map(Number) as CurvePoint).filter(p=>p.length===2&&p.every(Number.isFinite))); }
export function parseStyle(source:string,filename:string):ParsedStyle {
 const format=filename.toLowerCase().endsWith('.costyle')?'costyle':'xmp';
 const params:Record<string,string>={};
 if(format==='costyle') for(const m of source.matchAll(/<E\s+K="([^"]+)"\s+V="([^"]*)"\s*\/>/g))params[m[1]]=m[2];
 else for(const m of source.matchAll(/crs:([A-Za-z0-9]+)="([^"]*)"/g))params[m[1]]=m[2];
 const curves:Record<string,CurvePoint[]>={};
 for(const [key,val] of Object.entries(params)) if(/^(GradationCurve|ToneCurve|.*Curve)/i.test(key)) { const pts=curve(val); if(pts.length>1)curves[key]=pts; }
 // Adobe stores tone curves as RDF sequences rather than attributes; retain the original
 // parameter text and additionally decode the point sequence for pixel rendering.
 if(format==='xmp' && typeof DOMParser!=='undefined'){
   const doc=new DOMParser().parseFromString(source,'application/xml');
   for(const node of Array.from(doc.getElementsByTagName('*'))){
     const local=node.localName||node.nodeName.split(':').pop()||'';
     if(!/^ToneCurve(PV2012|PV2012Red|PV2012Green|PV2012Blue|Name2012)$/.test(local))continue;
     const key=local==='ToneCurvePV2012'?'ToneCurvePV2012':local;
     const pts=Array.from(node.getElementsByTagName('*')).filter(n=>n.localName==='li').map(n=>n.textContent||'').map(v=>v.split(',').map(x=>Number(x.trim()))).filter(v=>v.length===2&&v.every(Number.isFinite)).map(([x,y])=>[x/255,y/255] as CurvePoint);
     if(pts.length>1)curves[key]=pts;
   }
 }
 const hsl:ParsedStyle['hsl']={};
 for(const channel of channels) { const h=Number(params['HueAdjustment'+channel]??0),s=Number(params['SaturationAdjustment'+channel]??0),l=Number(params['LuminanceAdjustment'+channel]??0); if(h||s||l)hsl[channel.toLowerCase()]={h,s,l}; }
 const colorCorrections=format==='costyle'&&params.ColorCorrections?params.ColorCorrections.split(';').filter(Boolean).map(row=>row.split(',')):[];\n const colorBalance:ParsedStyle['colorBalance']={};
 for(const key of ['ColorBalanceShadow','ColorBalanceMidtone','ColorBalanceHighlight']) if(params[key]) colorBalance[key]=params[key].split(/[;,]/).map(Number);
 const xmlName=(()=>{if(format!=='xmp'||typeof DOMParser==='undefined')return undefined;const doc=new DOMParser().parseFromString(source,'application/xml');const nameNode=Array.from(doc.getElementsByTagName('*')).find(n=>(n.localName||n.nodeName.split(':').pop())==='Name');return nameNode?.textContent?.trim()||nameNode?.getElementsByTagName('*')[0]?.textContent?.trim()||undefined;})();
 return {name:params.Name||params.PresetName||xmlName||filename.replace(/\.(xmp|costyle)$/i,''),format,params,curves,hsl,colorBalance};
}
const clamp=(v:number,min=0,max=1)=>Math.max(min,Math.min(max,v));
function sample(points:CurvePoint[],x:number):number { if(!points.length)return x; const p=points.map(([a,b])=>[clamp(a),clamp(b)] as CurvePoint).sort((a,b)=>a[0]-b[0]); if(x<=p[0][0])return p[0][1]; for(let i=1;i<p.length;i++){if(x<=p[i][0]){const [x0,y0]=p[i-1],[x1,y1]=p[i];return x1===x0?y1:y0+(y1-y0)*(x-x0)/(x1-x0)}}return p[p.length-1][1]; }
export function applyCurveChannel(data:Uint8ClampedArray,points:CurvePoint[],channel:'r'|'g'|'b'|'rgb'):void { if(points.length<2)return; const idx=channel==='r'?0:channel==='g'?1:channel==='b'?2:-1; for(let i=0;i<data.length;i+=4){if(idx>=0)data[i+idx]=Math.round(sample(points,data[i+idx]/255)*255);else for(let c=0;c<3;c++)data[i+c]=Math.round(sample(points,data[i+c]/255)*255)} }

const hueCenters:Record<string,number>={red:0,orange:30,yellow:60,green:120,aqua:180,blue:240,purple:275,magenta:315};
function rgbToHsl(r:number,g:number,b:number):[number,number,number]{r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;let h=0,s=0;if(d){s=d/(1-Math.abs(2*l-1));switch(max){case r:h=((g-b)/d)%6;break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}h*=60;if(h<0)h+=360;}return[h,s,l]}
function hslToRgb(h:number,s:number,l:number):[number,number,number]{h=((h%360)+360)%360;const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;const q=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return q.map(v=>Math.round((v+m)*255)) as [number,number,number]}
export function applyHsl(data:Uint8ClampedArray,hsl:ParsedStyle['hsl']):void{const entries=Object.entries(hsl);if(!entries.length)return;for(let i=0;i<data.length;i+=4){const [h,s,l]=rgbToHsl(data[i],data[i+1],data[i+2]);let dh=0,ds=0,dl=0,total=0;for(const [name,a] of entries){const center=hueCenters[name];if(center===undefined)continue;const delta=Math.abs(((h-center+540)%360)-180),w=Math.exp(-0.5*(delta/28)**2);dh+=a.h*w;ds+=a.s*w;dl+=a.l*w;total=Math.max(total,w)}if(total>0){const rgb=hslToRgb(h+dh,clamp(s+ds/100),clamp(l+dl/100));data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2]}}}
export function applyColorBalance(data:Uint8ClampedArray,balance:ParsedStyle['colorBalance']):void{const zones=[['ColorBalanceShadow',0],['ColorBalanceMidtone',1],['ColorBalanceHighlight',2]] as const;for(let i=0;i<data.length;i+=4){const y=(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2])/255;const weights=[Math.max(0,1-y*2),Math.max(0,1-Math.abs(y-.5)*2),Math.max(0,(y-.5)*2)];let sums=[0,0,0],ws=0;for(let z=0;z<3;z++){const vals=balance[zones[z][0]];if(!vals||vals.length<3)continue;for(let c=0;c<3;c++)sums[c]+=(vals[c]-1)*weights[z];ws+=weights[z]}if(ws)for(let c=0;c<3;c++)data[i+c]=Math.round(clamp(data[i+c]/255*(1+sums[c]/ws))*255)}}
