export type CurvePoint = [number, number];
export type ParsedStyle = { name: string; format: 'xmp' | 'costyle'; params: Record<string,string>; curves: Record<string,CurvePoint[]>; hsl: Record<string,{h:number;s:number;l:number}>; colorBalance: Record<string,number[]>; };
const channels = ['Red','Orange','Yellow','Green','Aqua','Blue','Purple','Magenta'];
function curve(value?:string):CurvePoint[] { if(!value)return []; return value.split(/[;,]/).length<4?[]:(value.split(';').map(p=>p.split(',').map(Number) as CurvePoint).filter(p=>p.length===2&&p.every(Number.isFinite))); }
export function parseStyle(source:string,filename:string):ParsedStyle {
 const format=filename.toLowerCase().endsWith('.costyle')?'costyle':'xmp';
 const params:Record<string,string>={};
 if(format==='costyle') for(const m of source.matchAll(/<E\s+K="([^"]+)"\s+V="([^"]*)"\s*\/>/g))params[m[1]]=m[2];
 else for(const m of source.matchAll(/crs:([A-Za-z0-9]+)="([^"]*)"/g))params[m[1]]=m[2];
 const curves:Record<string,CurvePoint[]>={};
 for(const [key,val] of Object.entries(params)) if(/^(GradationCurve|ToneCurve|.*Curve)/i.test(key)) { const pts=curve(val); if(pts.length>1)curves[key]=pts; }
 const hsl:ParsedStyle['hsl']={};
 for(const channel of channels) { const h=Number(params['HueAdjustment'+channel]??0),s=Number(params['SaturationAdjustment'+channel]??0),l=Number(params['LuminanceAdjustment'+channel]??0); if(h||s||l)hsl[channel.toLowerCase()]={h,s,l}; }
 const colorBalance:ParsedStyle['colorBalance']={};
 for(const key of ['ColorBalanceShadow','ColorBalanceMidtone','ColorBalanceHighlight']) if(params[key]) colorBalance[key]=params[key].split(/[;,]/).map(Number);
 return {name:params.Name||params.PresetName||filename.replace(/\.(xmp|costyle)$/i,''),format,params,curves,hsl,colorBalance};
}
const clamp=(v:number,min=0,max=1)=>Math.max(min,Math.min(max,v));
function sample(points:CurvePoint[],x:number):number { if(!points.length)return x; const p=points.map(([a,b])=>[clamp(a),clamp(b)] as CurvePoint).sort((a,b)=>a[0]-b[0]); if(x<=p[0][0])return p[0][1]; for(let i=1;i<p.length;i++){if(x<=p[i][0]){const [x0,y0]=p[i-1],[x1,y1]=p[i];return x1===x0?y1:y0+(y1-y0)*(x-x0)/(x1-x0)}}return p[p.length-1][1]; }
export function applyCurveChannel(data:Uint8ClampedArray,points:CurvePoint[],channel:'r'|'g'|'b'|'rgb'):void { if(points.length<2)return; const idx=channel==='r'?0:channel==='g'?1:channel==='b'?2:-1; for(let i=0;i<data.length;i+=4){if(idx>=0)data[i+idx]=Math.round(sample(points,data[i+idx]/255)*255);else for(let c=0;c<3;c++)data[i+c]=Math.round(sample(points,data[i+c]/255)*255)} }
