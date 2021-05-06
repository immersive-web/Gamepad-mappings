import copy from 'rollup-plugin-copy-glob';

const DIST_FOLDER = 'dist';

export default [
  {
    input: ['src/modelViewer.js'],
    output: [
      {
        format: 'es',
        file: `${DIST_FOLDER}/modelViewer.js`
      }
    ],
    external: [
      './three/build/three.module.js',
      './three/examples/jsm/loaders/RGBELoader.js',
      './three/examples/jsm/loaders/GLTFLoader.js',
      './three/examples/jsm/loaders/FBXLoader.js',
      './three/examples/jsm/controls/OrbitControls.js',
      './three/examples/jsm/webxr/VRButton.js',
      './ajv/ajv.min.js',
      './motion-controllers.module.js',
      '../motion-controllers.module.js',
      './registryTools/validateRegistryProfile.js',
      './assetTools/expandRegistryProfile.js',
      './assetTools/buildAssetProfile.js'
    ],
    plugins: [
      copy(
        [
          { files: 'src/*.{html,css}', dest: `${DIST_FOLDER}` }
        ],
        { verbose: true, watch: process.env.ROLLUP_WATCH }
      ),
      copy(
        [
          { files: 'backgrounds/*.{hdr,json}', dest: `${DIST_FOLDER}/backgrounds` }
        ],
        { verbose: true, watch: process.env.ROLLUP_WATCH }
      ),
      copy(
        [
          { files: '../../node_modules/three/**', dest: `${DIST_FOLDER}/three` }
        ],
        { verbose: false, watch: process.env.ROLLUP_WATCH }
      ),
      copy(
        [
          { files: '../assets/dist/profiles/**', dest: `${DIST_FOLDER}/profiles` }
        ],
        { verbose: true, watch: process.env.ROLLUP_WATCH }
      ),
      copy(
        [
          { files: '../registry/dist/profilesTools/**', dest: `${DIST_FOLDER}/registryTools` }
        ],
        { verbose: true, watch: process.env.ROLLUP_WATCH }
      ),
      copy(
        [
          { files: '../assets/dist/profilesTools/**', dest: `${DIST_FOLDER}/assetTools` }
        ],
        { verbose: true, watch: process.env.ROLLUP_WATCH }
      ),
      copy(
        [
          { files: '../../node_modules/ajv/dist/ajv.min.js*', dest: `${DIST_FOLDER}/ajv` }
        ],
        { verbose: true, watch: process.env.ROLLUP_WATCH }
      ),
      copy(
        [
          { files: '../motion-controllers/dist/*.js', dest: `${DIST_FOLDER}` }
        ],
        { verbose: true, watch: process.env.ROLLUP_WATCH }
      )
    ]
  }
];
