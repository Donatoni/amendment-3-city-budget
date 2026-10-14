// Small server adapter for the drawing operations in paintPostcard. Keeping
// the painter shared prevents exports and crawler previews from drifting apart.
export const xml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export class SVGCanvas {
  constructor() {
    this.parts = []; this.defs = []; this.stack = []; this.path = '';
    this.state = { fillStyle:'#000', strokeStyle:'#000', lineWidth:1, globalAlpha:1, font:'400 16px Inter', textAlign:'left', transform:'', clip:'', dash:[] };
  }
  save() { this.stack.push({ ...this.state }); }
  restore() { this.state = this.stack.pop(); }
  translate(x,y) { this.state.transform += ` translate(${x} ${y})`; }
  rotate(angle) { this.state.transform += ` rotate(${angle * 180 / Math.PI})`; }
  setLineDash(value) { this.state.dash = value; }
  beginPath() { this.path = ''; }
  moveTo(x,y) { this.path += `M${x} ${y}`; }
  lineTo(x,y) { this.path += `L${x} ${y}`; }
  roundRect(x,y,w,h,r) {
    r = Math.min(r,w/2,h/2);
    this.path += `M${x+r} ${y}h${w-2*r}q${r} 0 ${r} ${r}v${h-2*r}q0 ${r} ${-r} ${r}h${2*r-w}q${-r} 0 ${-r} ${-r}v${2*r-h}q0 ${-r} ${r} ${-r}Z`;
  }
  arc(x,y,r) { this.path += `M${x-r} ${y}a${r} ${r} 0 1 0 ${2*r} 0a${r} ${r} 0 1 0 ${-2*r} 0`; }
  attrs() { return ` transform="${xml(this.state.transform)}" opacity="${this.globalAlpha}"${this.state.clip ? ` clip-path="url(#${this.state.clip})"` : ''}`; }
  fill() { this.parts.push(`<path d="${this.path}" fill="${this.fillStyle}"${this.attrs()}/>`); }
  stroke() { this.parts.push(`<path d="${this.path}" fill="none" stroke="${this.strokeStyle}" stroke-width="${this.lineWidth}" stroke-dasharray="${this.state.dash.join(' ')}"${this.attrs()}/>`); }
  clip() { const id=`clip${this.defs.length}`; this.defs.push(`<clipPath id="${id}"><path d="${this.path}"/></clipPath>`); this.state.clip=id; }
  fillRect(x,y,w,h) { this.parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${this.fillStyle}"${this.attrs()}/>`); }
  clearRect() {} // The painter fills the complete opaque background each time.
  fillText(value,x,y) {
    const [,weight,size] = /^(\d+) (\d+)px/.exec(this.font);
    const anchor = {left:'start',center:'middle',right:'end'}[this.textAlign];
    this.parts.push(`<text x="${x}" y="${y}" font-family="Inter" font-weight="${weight}" font-size="${size}" text-anchor="${anchor}" fill="${this.fillStyle}"${this.attrs()}>${xml(value)}</text>`);
  }
  drawImage(image,x,y,w,h) { this.parts.push(`<image href="${image.href}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none"${this.attrs()}/>`); }
  markup() { return `<defs>${this.defs.join('')}</defs>${this.parts.join('')}`; }
}
for (const key of ['fillStyle','strokeStyle','lineWidth','globalAlpha','font','textAlign']) {
  Object.defineProperty(SVGCanvas.prototype,key,{get(){return this.state[key]},set(value){this.state[key]=value}});
}
