import { Color, ShaderMaterial, Vector4 } from 'three';
import type { Texture } from 'three';

const inks: Record<string, string[]> = {
  housing: ['101654', '1223a0', '1832cd', '2144ed', '3e5cf4'],
  mechanism: ['0a102a', '101944', '14225a', '182861', '1b2964'],
  carriage: ['0c1545', '16288c', '1c38bf', '2545dc', '4462f2'],
  knob: ['0c1556', '112495', '142dc5', '1c3cdf', '3c55f1'],
  platen: ['091033', '101b49', '192967', '24357f', '374b9b'],
  bail: ['172058', '2c4085', '5f72a7', '9baac9', 'dbe4f4'],
  cap: ['162244', '28396b', '7890bd', 'dbe3f2', 'f9faff'],
  paper: ['a8b6d0', 'dce3ee', 'edf1f9', 'f4f6fc', 'fbfcff'],
};

const raster = `
  float hash(vec2 p) {
    return mod(dot(p, vec2(53.0, 193.0)) + mod(p.x * p.y, 31.0) * 137.0, 509.0) / 509.0;
  }
  float ordered(vec2 p) {
    vec2 a = mod(p, 2.0), b = mod(floor(p * .5), 2.0);
    return (4.0 * (2.0 * abs(a.x - a.y) + a.y) + 2.0 * abs(b.x - b.y) + b.y) / 16.0;
  }
`;

export function castInk(style: string, atlas: Texture) {
  const cap = style === 'cap';
  const housing = style === 'housing';
  const knob = style === 'knob';
  return new ShaderMaterial({
    defines: { ...(cap ? { LEGEND: 1 } : {}), ...(housing || knob ? { SCREEN: 1 } : {}) },
    uniforms: {
      tones: { value: (inks[style] ?? inks.mechanism).map(hex => new Color(`#${hex}`)) },
      stops: { value: cap ? new Vector4(.28, .46, .62, .77) : new Vector4(.29, .45, .65, .83) },
      castShade: { value: new Color(housing ? '#121d74' : '#10185e') },
      marks: { value: atlas },
    },
    vertexShader: `
      varying vec3 face;
      varying vec2 mark;
      void main() {
        face = mat3(modelMatrix) * normal;
        mark = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      ${raster}
      varying vec3 face;
      varying vec2 mark;
      uniform vec3 tones[5];
      uniform vec4 stops;
      uniform vec3 castShade;
      uniform sampler2D marks;
      void main() {
        vec3 n = normalize(face);
        float tone = dot(n, vec3(-.22, .79, .50)) * .5 + .5;
        vec3 ink = tones[0];
        if (tone >= stops.x) ink = tones[1];
        if (tone >= stops.y) ink = tones[2];
        if (tone >= stops.z) ink = tones[3];
        if (tone >= stops.w) ink = tones[4];
        vec2 p = floor(gl_FragCoord.xy);
        #ifdef SCREEN
          float d = ordered(p);
          if (abs(n.x) > .72 && d < .58) ink = castShade;
          else if (n.y > .2 && d < .20) ink *= .80;
          if (hash(p) > .990) ink = mix(ink, tones[4], .24);
        #endif
        #ifdef LEGEND
          vec4 legend = texture2D(marks, mark);
          if (legend.a > .5) ink = legend.rgb;
        #endif
        gl_FragColor = vec4(ink, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

export function plateInk() {
  return new ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: { pink: { value: new Color('#fb078e') }, screenPink: { value: new Color('#ec087e') } },
    vertexShader: `
      varying vec2 point;
      void main() {
        point = (uv - .5) * vec2(416.0, 384.0) - vec2(23.0, 0.0);
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      ${raster}
      uniform vec3 pink;
      uniform vec3 screenPink;
      varying vec2 point;
      void main() {
        vec2 p = point / vec2(163.0, 160.0);
        float sector = .34906585;
        float angle = atan(p.y, p.x);
        float edge = length(p) * cos(floor(.5 + angle / sector) * sector - angle);
        float grain = hash(floor(gl_FragCoord.xy));
        if (edge > 1.0 || grain > .998 || (edge > .96 && p.x * p.y < -.24 && grain > .91)) discard;
        vec3 ink = ordered(floor(gl_FragCoord.xy)) < .17 ? screenPink : pink;
        gl_FragColor = vec4(ink, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}
