import { Color, ShaderMaterial, Vector4 } from 'three';
import type { Texture } from 'three';

const inks: Record<string, string[]> = {
  housing: ['101654', '1a278f', '2240ce', '3555f4', '647bff'],
  mechanism: ['0a102a', '101944', '14225a', '182861', '1b2964'],
  carriage: ['0c1545', '16288c', '1c38bf', '2545dc', '4462f2'],
  knob: ['0c1556', '112495', '142dc5', '1c3cdf', '3c55f1'],
  platen: ['091033', '101b49', '192967', '24357f', '374b9b'],
  bail: ['172058', '2c4085', '5f72a7', '9baac9', 'dbe4f4'],
  cap: ['162244', '28396b', '7890bd', 'dbe3f2', 'f9faff'],
  paper: ['a8b6d0', 'dce3ee', 'edf1f9', 'f4f6fc', 'fbfcff'],
};

export function castInk(style: string, atlas: Texture) {
  const cap = style === 'cap';

  return new ShaderMaterial({
    defines: cap ? { LEGEND: 1 } : {},
    uniforms: {
      tones: { value: (inks[style] ?? inks.mechanism).map(hex => new Color(`#${hex}`)) },
      stops: { value: cap ? new Vector4(.28, .46, .62, .77) : new Vector4(.29, .45, .65, .83) },
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
      varying vec3 face;
      varying vec2 mark;
      uniform vec3 tones[5];
      uniform vec4 stops;
      uniform sampler2D marks;
      void main() {
        vec3 n = normalize(face);
        float tone = dot(n, vec3(-.22, .79, .50)) * .5 + .5;
        vec3 ink = tones[0];
        if (tone >= stops.x) ink = tones[1];
        if (tone >= stops.y) ink = tones[2];
        if (tone >= stops.z) ink = tones[3];
        if (tone >= stops.w) ink = tones[4];
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
    uniforms: { pink: { value: new Color('#fb078e') } },
    vertexShader: `
      varying vec2 point;
      void main() {
        point = (uv - .5) * vec2(416.0, 384.0) - vec2(23.0, 0.0);
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 pink;
      varying vec2 point;
      void main() {
        vec2 p = point / vec2(163.0, 160.0);
        float sector = .5235987756; // Twelve flat sides, including the top and bottom.
        float angle = atan(p.y, p.x);
        float edge = length(p) * cos(floor(.5 + angle / sector) * sector - angle);
        if (edge > 1.0) discard;
        gl_FragColor = vec4(pink, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}
