// Run with Three.js 0.184.0 and esbuild 0.25.5 available to Node.
const {build} = require('esbuild');
const fs = require('node:fs/promises');

build({
  entryPoints: ['tools/three-atlas-entry.mjs'],
  alias: {three: require.resolve('three/src/Three.js')},
  bundle: true, minify: true, format: 'esm',
  outfile: 'site/assets/vendor/three-atlas.mjs',
  plugins: [{
    name: 'object-uuids',
    setup(builder) {
      builder.onLoad({filter: /[/\\]math[/\\]MathUtils\.js$/}, async args => {
        const source = await fs.readFile(args.path, 'utf8');
        const pattern = /function generateUUID\(\) \{[\s\S]*?\n\}/;
        if (!pattern.test(source)) throw new Error('Three.js UUID source changed');
        return {contents: source.replace(pattern,
          'function generateUUID() { return globalThis.crypto.randomUUID(); }'), loader: 'js'};
      });
    },
  }],
}).catch(error => { console.error(error); process.exitCode = 1; });
