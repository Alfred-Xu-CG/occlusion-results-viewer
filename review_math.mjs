export const identity4=()=>[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
const finite = v => typeof v==='number' && Number.isFinite(v);
function matrix(m,n) { if (!Array.isArray(m)||m.length!==n||m.some(r=>!Array.isArray(r)||r.length!==n||r.some(v=>!finite(v)))) throw Error(`需要有限的 ${n}×${n} 矩阵`); }
function dot(a,b) { return a.reduce((s,v,i)=>s+v*b[i],0); }
function rotation(r) {
  matrix(r,3);
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(Math.abs(dot(r[i],r[j])-(i===j?1:0))>1e-6)throw Error('坐标轴或旋转不正交');
  const d=r[0][0]*(r[1][1]*r[2][2]-r[1][2]*r[2][1])-r[0][1]*(r[1][0]*r[2][2]-r[1][2]*r[2][0])+r[0][2]*(r[1][0]*r[2][1]-r[1][1]*r[2][0]);
  if(Math.abs(d-1)>1e-6)throw Error('坐标轴或旋转必须为右手系');
}
export function validatePose(p) {
  matrix(p,4);rotation(p.slice(0,3).map(r=>r.slice(0,3)));
  if(p[3].some((v,i)=>Math.abs(v-(i===3?1:0))>1e-9))throw Error('位姿最后一行不正确');
  return p;
}
export function transformPoint(m,p) { return m.slice(0,3).map(r=>dot(r.slice(0,3),p)+r[3]); }
export function chartPoint(p,axes,origin) { const d=p.map((v,i)=>v-origin[i]);return [0,1,2].map(j=>dot(axes.map(r=>r[j]),d)); }
export function worldToChart(axes,origin) {
  const m=identity4();for(let i=0;i<3;i++){m[i]=[axes[0][i],axes[1][i],axes[2][i],0];m[i][3]=-dot(m[i].slice(0,3),origin);}return m;
}
function multiply(a,b) { return a.map(r=>b[0].map((_,j)=>r.reduce((s,v,k)=>s+v*b[k][j],0))); }
export function chartPose(p,axes,origin) {const inv=identity4();for(let i=0;i<3;i++)inv[i]=[...axes[i],origin[i]];return multiply(multiply(worldToChart(axes,origin),p),inv);}
function localPath(p) {return typeof p==='string' && p.length>0 && !p.includes('\\') && !p.includes(':') && !p.startsWith('/') && !p.split('/').some(s=>s==='..'||s==='.'||!s) && !/[?#\x00-\x1f]/.test(p);}
export function validateCatalog(c) {
  if(!c||!Array.isArray(c.cases)||!c.cases.length)throw Error('病例清单为空或缺失；不会使用模拟替代数据');
  const ids=new Set();for(const s of c.cases){
    if(typeof s.id!=='string'||!s.id||ids.has(s.id))throw Error('病例编号缺失或重复');ids.add(s.id);
    for(const key of ['upper','lower'])if(!localPath(s[key])||!s[key].toLowerCase().endsWith('.stl.gz'))throw Error('牙模必须使用本地相对 STL 路径');
    rotation(s.frame_axes_world);
    if(!Array.isArray(s.frame_origin_world_mm)||s.frame_origin_world_mm.length!==3||s.frame_origin_world_mm.some(v=>!finite(v)))throw Error('坐标系原点不正确');
    if(!Array.isArray(s.poses)||!s.poses.length)throw Error('病例没有结果位姿');const poses=new Set(['__input']);
    if('candidate_poses' in s&&!Array.isArray(s.candidate_poses))throw Error('中间候选必须为位姿数组');
    for(const p of [...s.poses,...(s.candidate_poses||[])]){if(typeof p.id!=='string'||!p.id||poses.has(p.id))throw Error('位姿编号缺失或重复');poses.add(p.id);validatePose(p.matrix);for(const key of ['LP','full_clearance_mm','reload_clearance_mm'])if(key in p&&!finite(p[key]))throw Error('数值证据必须为有限数');if('stl_pair' in p&&(!localPath(p.stl_pair)||!p.stl_pair.toLowerCase().endsWith('.stl.gz')))throw Error('结果上下颌 STL 必须使用本地相对 STL 路径');}
    if(s.static)for(const p of Object.values(s.static))if(!localPath(p))throw Error('静态图必须使用本地相对路径');
  }return c;
}
const VIEWS={
  front:{direction:[0,1,.04]},left:{direction:[-1,0,0]},right:{direction:[1,0,0]},occlusal:{direction:[0,0,1]},
  'posterior-left':{direction:[-1,-1.2,.15],focusSide:-1},'posterior-right':{direction:[1,-1.2,.15],focusSide:1},
  'posterior-left-medial':{direction:[1,-1,.12],focusSide:-1},'posterior-right-medial':{direction:[-1,-1,.12],focusSide:1}
};
export function viewDefinition(id) {if(!VIEWS[id])throw Error('未知视角');return structuredClone(VIEWS[id]);}
// THREE clipping retains the positive signed side of each scene-world plane.
// Scene-world is already the fixed dental chart, so this is exactly T=0.
export function clippingPlaneForView(id) {const view=viewDefinition(id);return id.endsWith('-medial')?{normal:[view.focusSide,0,0],constant:0}:null;}
export function downloadDescriptors(c,rightPoseId){
  const links=[{label:'下载异常输入上颌 STL',path:c.upper},{label:'下载固定下颌 STL',path:c.lower}];
  const pose=visiblePoses(c,true).find(p=>p.id===rightPoseId);
  if(pose?.stl_pair)links.push({label:`下载右侧当前结果上下颌 STL（${pose.label||pose.id}）`,path:pose.stl_pair});
  return links;
}
export function visiblePoses(c,includeCandidates=false){return includeCandidates?[...c.poses,...(c.candidate_poses||[])]:c.poses;}
export function reconcilePoseSelection(c,id,includeCandidates,side){return id==='__input'||visiblePoses(c,includeCandidates).some(p=>p.id===id)?id:side==='left'?'__input':c.poses.at(-1).id;}
