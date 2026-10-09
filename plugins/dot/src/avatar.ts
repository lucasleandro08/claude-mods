export type Mood = 'working' | 'waiting' | 'done' | 'idle' | 'paused'

// A chibi vampire drawn in the Dracula palette; each mood swaps the face and the effects around it
const PALETTE = {
  ink: '#282a36',
  hair: '#2b2540',
  hairShine: '#6a5a9c',
  skin: '#fdf0f5',
  skinShade: '#f1d9e6',
  blush: '#ff79c6',
  iris: '#ff5555',
  capeOut: '#6c4fb8',
  capeIn: '#ff5555',
  collar: '#4b3a86',
  gold: '#f1fa8c',
  green: '#50fa7b',
  orange: '#ffb86c',
  purple: '#bd93f9',
} as const

const STYLE = `
.bob{animation:bob 2.6s ease-in-out infinite;transform-origin:50% 60%}
.busy .bob{animation:busy .9s ease-in-out infinite}
.spin{animation:spin 2.4s linear infinite;transform-box:fill-box;transform-origin:center}
.glow{animation:glow 1.4s ease-in-out infinite}
.pop{animation:pop 1.6s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.tilt{animation:tilt 1.2s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}
.cape{animation:cape 3.2s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 0}
.eye{animation:blink 4.2s infinite;transform-box:fill-box;transform-origin:center}
.blush{animation:blush 2.6s ease-in-out infinite}
.ring{animation:ring 2.2s ease-out infinite;transform-box:fill-box;transform-origin:center}
.spark{animation:spark 1.8s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.s2{animation-delay:.6s}.s3{animation-delay:1.2s}
.bang{animation:bang 1s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}
.zz{animation:zz 3s ease-in-out infinite}.z2{animation-delay:1s}
.bat{animation:bat .35s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:center}
.fly{animation:fly 6s ease-in-out infinite}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes busy{0%,100%{transform:translateY(0) rotate(0)}25%{transform:translateY(-6px) rotate(-3deg)}75%{transform:translateY(-6px) rotate(3deg)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes glow{0%,100%{opacity:.35}50%{opacity:1}}
@keyframes pop{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}
@keyframes tilt{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
@keyframes cape{0%,100%{transform:skewX(0) scaleX(1)}50%{transform:skewX(-3deg) scaleX(1.03)}}
@keyframes blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.08)}}
@keyframes blush{0%,100%{opacity:.35}50%{opacity:.6}}
@keyframes ring{0%{transform:scale(.85);opacity:.55}100%{transform:scale(1.25);opacity:0}}
@keyframes spark{0%,100%{transform:scale(.4);opacity:0}50%{transform:scale(1);opacity:1}}
@keyframes bang{0%,100%{transform:rotate(-14deg) scale(1)}50%{transform:rotate(14deg) scale(1.2)}}
@keyframes zz{0%{opacity:0;transform:translate(0,0)}30%{opacity:1}100%{opacity:0;transform:translate(6px,-12px)}}
@keyframes bat{from{transform:scaleY(1)}to{transform:scaleY(.55)}}
@keyframes fly{0%,100%{transform:translate(0,0)}50%{transform:translate(-6px,-4px)}}
`

function eyes(mood: Mood, blink = false) {
  const p = PALETTE
  if (mood === 'paused' || blink) {
    return `<path d="M38 55 q5 4 10 0 M62 55 q5 4 10 0" stroke="${p.ink}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
  }
  const eye = (cx: number) => `<g class="eye">
    <ellipse cx="${cx}" cy="55" rx="5.6" ry="6.6" fill="${p.ink}"/>
    <ellipse cx="${cx}" cy="56.6" rx="3.6" ry="4.2" fill="${p.iris}"/>
    <circle cx="${cx - 1.8}" cy="52.6" r="1.9" fill="#fff"/>
    <circle cx="${cx + 1.9}" cy="58.2" r=".9" fill="#fff" opacity=".8"/>
  </g>`
  return eye(43) + eye(67)
}

function mouth(mood: Mood) {
  const p = PALETTE
  if (mood === 'waiting') return `<ellipse cx="55" cy="68.5" rx="2.6" ry="3" fill="${p.ink}"/>`
  if (mood === 'paused') return `<path d="M51 68 q4 2 8 0" stroke="${p.ink}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`
  return `<path d="M49 66.5 q6 5 12 0" stroke="${p.ink}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M51.2 67.6 l1.3 3.4 1.3-3 z" fill="#fff" stroke="${p.ink}" stroke-width=".5" stroke-linejoin="round"/>`
}

const GLOW: Record<Mood, string> = { working: PALETTE.green, waiting: PALETTE.orange, done: PALETTE.purple, idle: '', paused: '' }

// A pulsing border in the mood's colour, so the state reads at a glance even when the avatar is small
function frameGlow(mood: Mood) {
  const color = GLOW[mood]
  return color ? `<rect class="glow" x="2" y="2" width="106" height="106" rx="20" fill="none" stroke="${color}" stroke-width="4"/>` : ''
}

function effects(mood: Mood, frame: number) {
  const twinkle = (i: number) => ((frame + i) % 4 === 0 ? 0.25 : 1)
  const p = PALETTE
  if (mood === 'working') {
    return `<g class="spin"><circle cx="55" cy="58" r="44" fill="none" stroke="${p.green}" stroke-width="3" stroke-dasharray="10 14" stroke-linecap="round" opacity=".85"/></g>
      <path class="spark" opacity="${twinkle(0)}" d="M14 28 l2.2 6 6 2.2 -6 2.2 -2.2 6 -2.2-6 -6-2.2 6-2.2z" fill="${p.gold}"/>
      <path class="spark s2" opacity="${twinkle(1)}" d="M95 20 l1.8 4.6 4.6 1.8 -4.6 1.8 -1.8 4.6 -1.8-4.6 -4.6-1.8 4.6-1.8z" fill="${p.purple}"/>
      <path class="spark s3" opacity="${twinkle(2)}" d="M98 74 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6-4 -4-1.6 4-1.6z" fill="${p.green}"/>`
  }
  if (mood === 'waiting') {
    return `<g class="bang"><circle cx="90" cy="22" r="15" fill="${p.orange}"/>
      <rect x="88" y="12" width="4" height="12" rx="2" fill="${p.ink}"/><circle cx="90" cy="29" r="2.4" fill="${p.ink}"/></g>`
  }
  if (mood === 'done') {
    return `<g class="pop"><circle cx="90" cy="22" r="14" fill="${p.green}"/>
      <path d="M83 22 l5 5 9-10" stroke="${p.ink}" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`
  }
  if (mood === 'paused') {
    return `<text class="zz" x="84" y="30" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="${p.purple}">z</text>
      <text class="zz z2" x="92" y="20" font-family="system-ui,sans-serif" font-size="10" font-weight="700" fill="${p.purple}">z</text>`
  }
  return `<g class="fly"><g class="bat" transform="translate(90 26)">
    <path d="M0 0 q-6-6-12-2 q4 1 4 5 q3-3 8-3z M0 0 q6-6 12-2 q-4 1-4 5 q-3-3-8-3z" fill="#6272a4"/>
    <circle cx="0" cy="1" r="2.6" fill="#6272a4"/></g></g>`
}

export const FRAMES = 4

// frame drives a static pose (bob, blink, pulse) so a surface that draws SVG as a still image can animate by redrawing
export function avatarSvg(mood: Mood, size = 96, frame = 0) {
  const p = PALETTE
  const lift = [0, -1.5, -3, -1.5][frame % FRAMES] ?? 0
  const blink = mood !== 'paused' && frame % FRAMES === 3 && Math.floor(frame / FRAMES) % 3 === 0
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 110 110">
<style>${STYLE}</style>
<rect width="110" height="110" rx="22" fill="${p.ink}"/>
${frameGlow(mood)}
${effects(mood, frame)}
<g transform="translate(0 ${lift})" class="${mood === 'working' ? 'busy' : ''}"><g class="bob">
  <path class="cape" d="M22 76 Q55 64 88 76 L98 110 L12 110 Z" fill="${p.capeOut}"/>
  <path d="M27 52 Q22 70 34 80 L46 74 Z M83 52 Q88 70 76 80 L64 74 Z" fill="${p.collar}"/>
  <path d="M40 76 Q55 70 70 76 L74 110 L36 110 Z" fill="${p.ink}"/>
  <path d="M46 75 L55 92 L64 75 Q55 79 46 75 Z" fill="#fff"/>
  <path d="M49.5 82 L55 85 L60.5 82 L60.5 88 L55 85 L49.5 88 Z" fill="${p.capeIn}"/>
  <circle cx="55" cy="85" r="1.6" fill="${p.capeIn}"/>
  <path d="M30 54 L22 46 L32 50 Z M80 54 L88 46 L78 50 Z" fill="${p.skin}" stroke="${p.skinShade}" stroke-width="1" stroke-linejoin="round"/>
  <ellipse cx="55" cy="56" rx="25" ry="23" fill="${p.skin}"/>
  <ellipse cx="55" cy="66" rx="21" ry="10" fill="${p.skinShade}" opacity=".4"/>
  <path d="M30 52 Q29 29 55 28 Q81 29 80 52 Q78 42 70 39 Q63 40 55 46 Q47 40 40 39 Q32 42 30 52 Z" fill="${p.hair}"/>
  <path d="M41 33.5 Q52 29.5 63 32" stroke="${p.hairShine}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".85"/>
  <ellipse class="blush" cx="37" cy="63" rx="5" ry="3" fill="${p.blush}"/>
  <ellipse class="blush" cx="73" cy="63" rx="5" ry="3" fill="${p.blush}"/>
  ${eyes(mood, blink)}
  ${mouth(mood)}
</g></g>
</svg>`
}
