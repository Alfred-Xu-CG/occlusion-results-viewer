import * as THREE from 'three';
import { OrbitControls } from './assets/OrbitControls.js';
import { STLLoader } from './assets/STLLoader.js';
import {identity4,validateCatalog,worldToChart,chartPoint,viewDefinition,clippingPlaneForView,downloadDescriptors,visiblePoses,reconcilePoseSelection} from './review_math.mjs';

const $=id=>document.getElementById(id),loader=new STLLoader(),rawCache=new Map();
let catalog,current,geometries=[],generation=0,synchronizing=false,focusPoints=null;
const status=(text,error=false)=>{$('status').textContent=text;$('status').classList.toggle('error',error);};
const matrix=m=>new THREE.Matrix4().set(...m.flat());
function makePanel(side){
  const element=$(side),scene=new THREE.Scene();scene.background=new THREE.Color('#202a38');
  const camera=new THREE.OrthographicCamera(-50,50,50,-50,.1,2000);camera.up.set(0,0,1);
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer: true});renderer.localClippingEnabled=true;renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;element.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff,0x53647a,2.1));
  const light=new THREE.DirectionalLight(0xffffff,2.6);camera.add(light);light.position.set(-50,60,100);scene.add(camera);
  const fill=new THREE.DirectionalLight(0xaacfff,1.0);fill.position.set(80,-60,30);scene.add(fill);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.minZoom=.25;controls.maxZoom=20;controls.screenSpacePanning=true;
  const root=new THREE.Group();root.matrixAutoUpdate=false;scene.add(root);
  return {side,element,scene,camera,renderer,controls,root,upper:null,lower:null};
}
const panels=[makePanel('left'),makePanel('right')];
function sync(source,target){if(synchronizing)return;synchronizing=true;target.camera.position.copy(source.camera.position);target.camera.quaternion.copy(source.camera.quaternion);target.camera.up.copy(source.camera.up);target.camera.zoom=source.camera.zoom;target.controls.target.copy(source.controls.target);target.camera.updateProjectionMatrix();target.controls.update();synchronizing=false;render();}
for(let i=0;i<2;i++)panels[i].controls.addEventListener('change',()=>sync(panels[i],panels[1-i]));
function render(){for(const p of panels)p.renderer.render(p.scene,p.camera);}
function resize(){for(const p of panels){const width=p.element.clientWidth,height=p.element.clientHeight;if(!width||!height)continue;const half=p.halfHeight||45;p.renderer.setSize(width,height,false);p.camera.left=-half*width/height;p.camera.right=half*width/height;p.camera.top=half;p.camera.bottom=-half;p.camera.updateProjectionMatrix();}render();}
new ResizeObserver(resize).observe(document.querySelector('.panels'));
async function fetchMesh(path){
  if(!rawCache.has(path))rawCache.set(path,fetch(path).then(async r=>{if(!r.ok)throw Error(`牙模读取失败 ${r.status}：${path}`);return await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();}).catch(e=>{rawCache.delete(path);throw e;}));
  return await rawCache.get(path);
}
function clearCase(){for(const p of panels){for(const mesh of [...p.root.children]){p.root.remove(mesh);mesh.material.dispose();}p.upper=null;p.lower=null;}for(const geometry of geometries)geometry.dispose();geometries=[];}
function calculateFocus(geometry){
  const position=geometry.getAttribute('position'),box=new THREE.Box3(),v=new THREE.Vector3(),points=[];
  for(let i=0;i<position.count;i++){v.fromBufferAttribute(position,i);const q=chartPoint([v.x,v.y,v.z],current.frame_axes_world,current.frame_origin_world_mm);box.expandByPoint(new THREE.Vector3(...q));points.push(q);}
  const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),z=points.map(p=>p[2]).sort((a,b)=>a-b),top=z[Math.floor(z.length*.8)];
  const out={center,size,posterior:{}};
  for(const sign of [-1,1]){const selected=points.filter(p=>sign*(p[0]-center.x)>size.x*.16&&p[1]<center.y&&p[2]>=top),sum=selected.reduce((a,p)=>a.map((v,j)=>v+p[j]),[0,0,0]);out.posterior[sign]=selected.length?new THREE.Vector3(...sum.map(v=>v/selected.length)):new THREE.Vector3(center.x+sign*size.x*.3,center.y-size.y*.25,box.max.z);}
  return out;
}
function setView(){if(!focusPoints)return;const view=viewDefinition($('view').value),clip=clippingPlaneForView($('view').value),target=view.focusSide?focusPoints.posterior[view.focusSide]:focusPoints.center,span=view.focusSide?14:Math.max(focusPoints.size.x,focusPoints.size.y,focusPoints.size.z)*.60;for(const p of panels){for(const mesh of [p.upper,p.lower])if(mesh){mesh.material.clippingPlanes=clip?[new THREE.Plane(new THREE.Vector3(...clip.normal),clip.constant)]:[];mesh.material.needsUpdate=true;}p.halfHeight=span;p.controls.target.copy(target);p.camera.up.set(0,0,1);if($('view').value==='occlusal')p.camera.up.set(0,1,0);p.camera.position.copy(target).add(new THREE.Vector3(...view.direction).normalize().multiplyScalar(250));p.camera.zoom=1;p.camera.lookAt(target);p.controls.update();}$('clipping-notice').hidden=!clip;resize();}
function selectedPose(side){const id=$(`pose-${side}`).value;return id==='__input'?{id,label:'异常输入（未优化）',matrix:identity4()}:visiblePoses(current,$('show-candidates').checked).find(p=>p.id===id);}
function details(p){const lines=[p.label||p.id];if(typeof p['D0.5']==='number')lines.push(`D₁⁄₂ = ${p['D0.5'].toFixed(6)} √mm（仅目标值，非临床评分）`);if(typeof p.D1==='number')lines.push(`D₁ = ${p.D1.toFixed(6)} mm（仅目标值，非临床评分）`);if(typeof p.D2==='number')lines.push(`D₂ = ${p.D2.toFixed(6)} mm²（仅目标值，非临床评分）`);if(typeof p.LP==='number')lines.push(`L_P = ${p.LP.toFixed(6)}（越低越好；非临床评分）`);if(typeof p.full_clearance_mm==='number')lines.push(`完整网格间距 ${p.full_clearance_mm.toFixed(6)} mm`);if(typeof p.reload_clearance_mm==='number')lines.push(`独立重载间距 ${p.reload_clearance_mm.toFixed(6)} mm`);if(p.summary_sha256)lines.push(`记录 SHA256：${p.summary_sha256}`);return lines.join('\n');}
function updateDownloadLinks(){if(!current)return;$('download-links').replaceChildren();for(const link of downloadDescriptors(current,$('pose-right').value)){const a=document.createElement('a');a.href=link.path;a.download=`${current.id}-${link.path.split('/').at(-1).replace(/\.gz$/,'')}`;a.addEventListener('click',async e=>{e.preventDefault();const old=a.textContent;a.textContent='正在准备下载…';try{const data=await fetchMesh(link.path),url=URL.createObjectURL(new Blob([data],{type:'model/stl'})),download=document.createElement('a');download.href=url;download.download=a.download;download.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(error){status('下载失败：'+error.message,true);}finally{a.textContent=old;}});a.textContent=link.label;$('download-links').appendChild(a);}}
function applyPose(side){updateDownloadLinks();const panel=panels.find(p=>p.side===side),pose=selectedPose(side);if(!panel.upper||!pose)return;panel.upper.matrix.copy(matrix(pose.matrix));panel.upper.matrixWorldNeedsUpdate=true;$(`details-${side}`).textContent=details(pose);render();}
function opacity(){const amount=Number($('opacity').value);$('opacity-value').textContent=`${Math.round(amount*100)}%`;for(const p of panels)if(p.upper){p.upper.material.opacity=amount;p.upper.material.transparent=amount<1;p.upper.material.depthWrite=amount===1;p.upper.renderOrder=amount<1?2:0;}render();}
function setOptions(select,poses,selected){select.replaceChildren();const add=(parent,p)=>{const option=document.createElement('option');option.value=p.id;option.textContent=p.label||p.id;parent.appendChild(option);};add(select,{id:'__input',label:'异常输入（未优化）'});for(const [label,list] of [['最终结果及对照',poses],['中间候选（非最终结果）',$('show-candidates').checked?(current.candidate_poses||[]):[]]])if(list.length){const group=document.createElement('optgroup');group.label=label;for(const p of list)add(group,p);select.appendChild(group);}select.value=selected;}
async function loadCase(id){
  const token=++generation;current=catalog.cases.find(c=>c.id===id);clearCase();focusPoints=null;render();status(`正在读取 ${current.subject||current.id} · ${current.family||''} 的完整原始牙模…`);
  for(const side of ['left','right'])setOptions($(`pose-${side}`),current.poses,side==='left'?'__input':current.poses.at(-1).id);
  updateDownloadLinks();
  $('static-links').replaceChildren();for(const [key,path] of Object.entries(current.static||{})){const a=document.createElement('a');a.href=path;a.target='_blank';a.rel='noopener';a.textContent=key==='standard'?'旧版固定视角对照':key==='posterior'?'旧版双侧后牙':key==='palatal'?'旧版腭侧近景':key;$('static-links').appendChild(a);}
  try{
    const buffers=await Promise.all([fetchMesh(current.upper),fetchMesh(current.lower)]);if(token !== generation)return;
    const parsed=[];try{for(const buffer of buffers){const g=loader.parse(buffer);if(!g.getAttribute('position')?.count)throw Error('STL 没有可显示的三角形');parsed.push(g);}}catch(e){for(const geometry of parsed)geometry.dispose();throw e;}geometries=parsed;
    focusPoints=calculateFocus(parsed[1]);
    for(const p of panels){p.root.matrix.copy(matrix(worldToChart(current.frame_axes_world,current.frame_origin_world_mm)));p.root.matrixWorldNeedsUpdate=true;p.upper=new THREE.Mesh(parsed[0],new THREE.MeshStandardMaterial({color:0xf5e9cf,roughness:.73,metalness:0,side:THREE.DoubleSide}));p.upper.matrixAutoUpdate=false;p.lower=new THREE.Mesh(parsed[1],new THREE.MeshStandardMaterial({color:0x809bb2,roughness:.78,metalness:0,side:THREE.DoubleSide}));p.root.add(p.upper,p.lower);applyPose(p.side);}
    opacity();setView();status(`${current.subject||current.id} · ${current.family||''}：完整原始牙模已加载；两侧相机同步。请比较双侧内侧牙尖与牙沟的嵌合。`);
  }catch(e){if(token !== generation)return;clearCase();status(`无法显示此病例：${e.message}。没有替代或合成模型。`,true);}
}
$('case').addEventListener('change',()=>loadCase($('case').value));for(const side of ['left','right'])$(`pose-${side}`).addEventListener('change',()=>applyPose(side));$('view').addEventListener('change',setView);$('reset').addEventListener('click',setView);$('opacity').addEventListener('input',opacity);
$('show-candidates').addEventListener('change',()=>{if(!current)return;for(const side of ['left','right']){const select=$(`pose-${side}`),id=reconcilePoseSelection(current,select.value,$('show-candidates').checked,side);setOptions(select,current.poses,id);applyPose(side);}});
try{const response=await fetch('./catalog.json',{cache:'no-store'});if(!response.ok)throw Error(`清单读取失败 ${response.status}`);catalog=validateCatalog(await response.json());for(const c of catalog.cases){const option=document.createElement('option');option.value=c.id;option.textContent=`${c.subject||c.id} · ${c.family||'原始异常'}`;$('case').appendChild(option);}await loadCase(catalog.cases[0].id);}catch(e){status(`初始化失败：${e.message}`,true);}
