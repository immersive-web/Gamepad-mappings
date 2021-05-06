import { Object3D, Quaternion, SphereGeometry, MeshBasicMaterial, Mesh, PerspectiveCamera, Scene, Color, WebGLRenderer, PMREMGenerator, UnsignedByteType, BufferGeometry, Float32BufferAttribute, LineBasicMaterial, VertexColors, AdditiveBlending, Line } from './three/build/three.module.js';
import { OrbitControls } from './three/examples/jsm/controls/OrbitControls.js';
import { RGBELoader } from './three/examples/jsm/loaders/RGBELoader.js';
import { VRButton } from './three/examples/jsm/webxr/VRButton.js';
import { GLTFLoader } from './three/examples/jsm/loaders/GLTFLoader.js';
import { Constants, fetchProfilesList, fetchProfile, MotionController } from './motion-controllers.module.js';
import './ajv/ajv.min.js';
import validateRegistryProfile from './registryTools/validateRegistryProfile.js';
import expandRegistryProfile from './assetTools/expandRegistryProfile.js';
import buildAssetProfile from './assetTools/buildAssetProfile.js';

let motionController;
let mockGamepad;
let controlsListElement;

function updateText() {
  if (motionController) {
    Object.values(motionController.components).forEach((component) => {
      const dataElement = document.getElementById(`${component.id}_data`);
      dataElement.innerHTML = JSON.stringify(component.data, null, 2);
    });
  }
}

function onButtonValueChange(event) {
  const { index } = event.target.dataset;
  mockGamepad.buttons[index].value = Number(event.target.value);
}

function onAxisValueChange(event) {
  const { index } = event.target.dataset;
  mockGamepad.axes[index] = Number(event.target.value);
}

function clear() {
  motionController = undefined;
  mockGamepad = undefined;

  if (!controlsListElement) {
    controlsListElement = document.getElementById('controlsList');
  }
  controlsListElement.innerHTML = '';
}

function addButtonControls(componentControlsElement, buttonIndex) {
  const buttonControlsElement = document.createElement('div');
  buttonControlsElement.setAttribute('class', 'componentControls');

  buttonControlsElement.innerHTML += `
  <label>buttonValue</label>
  <input id="buttons[${buttonIndex}].value" data-index="${buttonIndex}" type="range" min="0" max="1" step="0.01" value="0">
  `;

  componentControlsElement.appendChild(buttonControlsElement);

  document.getElementById(`buttons[${buttonIndex}].value`).addEventListener('input', onButtonValueChange);
}

function addAxisControls(componentControlsElement, axisName, axisIndex) {
  const axisControlsElement = document.createElement('div');
  axisControlsElement.setAttribute('class', 'componentControls');

  axisControlsElement.innerHTML += `
  <label>${axisName}<label>
  <input id="axes[${axisIndex}]" data-index="${axisIndex}"
          type="range" min="-1" max="1" step="0.01" value="0">
  `;

  componentControlsElement.appendChild(axisControlsElement);

  document.getElementById(`axes[${axisIndex}]`).addEventListener('input', onAxisValueChange);
}

function build(sourceMotionController) {
  clear();

  motionController = sourceMotionController;
  mockGamepad = motionController.xrInputSource.gamepad;

  Object.values(motionController.components).forEach((component) => {
    const componentControlsElement = document.createElement('li');
    componentControlsElement.setAttribute('class', 'component');
    controlsListElement.appendChild(componentControlsElement);

    const headingElement = document.createElement('h4');
    headingElement.innerText = `${component.id}`;
    componentControlsElement.appendChild(headingElement);

    if (component.gamepadIndices.button !== undefined) {
      addButtonControls(componentControlsElement, component.gamepadIndices.button);
    }

    if (component.gamepadIndices.xAxis !== undefined) {
      addAxisControls(componentControlsElement, 'xAxis', component.gamepadIndices.xAxis);
    }

    if (component.gamepadIndices.yAxis !== undefined) {
      addAxisControls(componentControlsElement, 'yAxis', component.gamepadIndices.yAxis);
    }

    const dataElement = document.createElement('pre');
    dataElement.id = `${component.id}_data`;
    componentControlsElement.appendChild(dataElement);
  });
}

var ManualControls = { clear, build, updateText };

let errorsSectionElement;
let errorsListElement;
class AssetError extends Error {
  constructor(...params) {
    super(...params);
    AssetError.log(this.message);
  }

  static initialize() {
    errorsListElement = document.getElementById('errors');
    errorsSectionElement = document.getElementById('errors');
  }

  static log(errorMessage) {
    const itemElement = document.createElement('li');
    itemElement.innerText = errorMessage;
    errorsListElement.appendChild(itemElement);
    errorsSectionElement.hidden = false;
  }

  static clearAll() {
    errorsListElement.innerHTML = '';
    errorsSectionElement.hidden = true;
  }
}

/* eslint-disable import/no-unresolved */

const gltfLoader = new GLTFLoader();

class ControllerModel extends Object3D {
  constructor() {
    super();
    this.xrInputSource = null;
    this.motionController = null;
    this.asset = null;
    this.rootNode = null;
    this.nodes = {};
    this.loaded = false;
    this.envMap = null;
  }

  set environmentMap(value) {
    if (this.envMap === value) {
      return;
    }

    this.envMap = value;
    /* eslint-disable no-param-reassign */
    this.traverse((child) => {
      if (child.isMesh) {
        child.material.envMap = this.envMap;
        child.material.needsUpdate = true;
      }
    });
    /* eslint-enable */
  }

  get environmentMap() {
    return this.envMap;
  }

  async initialize(motionController) {
    this.motionController = motionController;
    this.xrInputSource = this.motionController.xrInputSource;

    // Fetch the assets and generate threejs objects for it
    this.asset = await new Promise(((resolve, reject) => {
      gltfLoader.load(
        motionController.assetUrl,
        (loadedAsset) => { resolve(loadedAsset); },
        null,
        () => { reject(new AssetError(`Asset ${motionController.assetUrl} missing or malformed.`)); }
      );
    }));

    if (this.envMap) {
      /* eslint-disable no-param-reassign */
      this.asset.scene.traverse((child) => {
        if (child.isMesh) {
          child.material.envMap = this.envMap;
        }
      });
      /* eslint-enable */
    }

    this.rootNode = this.asset.scene;
    this.addTouchDots();
    this.findNodes();
    this.add(this.rootNode);
    this.loaded = true;
  }

  /**
   * Polls data from the XRInputSource and updates the model's components to match
   * the real world data
   */
  updateMatrixWorld(force) {
    super.updateMatrixWorld(force);

    if (!this.loaded) {
      return;
    }

    // Cause the MotionController to poll the Gamepad for data
    this.motionController.updateFromGamepad();

    // Update the 3D model to reflect the button, thumbstick, and touchpad state
    Object.values(this.motionController.components).forEach((component) => {
      // Update node data based on the visual responses' current states
      Object.values(component.visualResponses).forEach((visualResponse) => {
        const {
          valueNodeName, minNodeName, maxNodeName, value, valueNodeProperty
        } = visualResponse;
        const valueNode = this.nodes[valueNodeName];

        // Skip if the visual response node is not found. No error is needed,
        // because it will have been reported at load time.
        if (!valueNode) return;

        // Calculate the new properties based on the weight supplied
        if (valueNodeProperty === Constants.VisualResponseProperty.VISIBILITY) {
          valueNode.visible = value;
        } else if (valueNodeProperty === Constants.VisualResponseProperty.TRANSFORM) {
          const minNode = this.nodes[minNodeName];
          const maxNode = this.nodes[maxNodeName];
          Quaternion.slerp(
            minNode.quaternion,
            maxNode.quaternion,
            valueNode.quaternion,
            value
          );

          valueNode.position.lerpVectors(
            minNode.position,
            maxNode.position,
            value
          );
        }
      });
    });
  }

  /**
   * Walks the model's tree to find the nodes needed to animate the components and
   * saves them for use in the frame loop
   */
  findNodes() {
    this.nodes = {};

    // Loop through the components and find the nodes needed for each components' visual responses
    Object.values(this.motionController.components).forEach((component) => {
      const { touchPointNodeName, visualResponses } = component;
      if (touchPointNodeName) {
        this.nodes[touchPointNodeName] = this.rootNode.getObjectByName(touchPointNodeName);
      }

      // Loop through all the visual responses to be applied to this component
      Object.values(visualResponses).forEach((visualResponse) => {
        const {
          valueNodeName, minNodeName, maxNodeName, valueNodeProperty
        } = visualResponse;
        // If animating a transform, find the two nodes to be interpolated between.
        if (valueNodeProperty === Constants.VisualResponseProperty.TRANSFORM) {
          this.nodes[minNodeName] = this.rootNode.getObjectByName(minNodeName);
          this.nodes[maxNodeName] = this.rootNode.getObjectByName(maxNodeName);

          // If the extents cannot be found, skip this animation
          if (!this.nodes[minNodeName]) {
            AssetError.log(`Could not find ${minNodeName} in the model`);
            return;
          }
          if (!this.nodes[maxNodeName]) {
            AssetError.log(`Could not find ${maxNodeName} in the model`);
            return;
          }
        }

        // If the target node cannot be found, skip this animation
        this.nodes[valueNodeName] = this.rootNode.getObjectByName(valueNodeName);
        if (!this.nodes[valueNodeName]) {
          AssetError.log(`Could not find ${valueNodeName} in the model`);
        }
      });
    });
  }

  /**
   * Add touch dots to all touchpad components so the finger can be seen
   */
  addTouchDots() {
    Object.keys(this.motionController.components).forEach((componentId) => {
      const component = this.motionController.components[componentId];
      // Find the touchpads
      if (component.type === Constants.ComponentType.TOUCHPAD) {
        // Find the node to attach the touch dot.
        const touchPointRoot = this.rootNode.getObjectByName(component.touchPointNodeName, true);
        if (!touchPointRoot) {
          AssetError.log(`Could not find touch dot, ${component.touchPointNodeName}, in touchpad component ${componentId}`);
        } else {
          const sphereGeometry = new SphereGeometry(0.001);
          const material = new MeshBasicMaterial({ color: 0x0000FF });
          const sphere = new Mesh(sphereGeometry, material);
          touchPointRoot.add(sphere);
        }
      }
    });
  }
}

/* eslint-disable import/no-unresolved */

/**
 * Loads a profile from a set of local files
 */
class LocalProfile extends EventTarget {
  constructor() {
    super();

    this.localFilesListElement = document.getElementById('localFilesList');
    this.filesSelector = document.getElementById('localFilesSelector');
    this.filesSelector.addEventListener('change', () => {
      this.onFilesSelected();
    });

    this.clear();

    LocalProfile.buildSchemaValidator('registryTools/registrySchemas.json').then((registrySchemaValidator) => {
      this.registrySchemaValidator = registrySchemaValidator;
      LocalProfile.buildSchemaValidator('assetTools/assetSchemas.json').then((assetSchemaValidator) => {
        this.assetSchemaValidator = assetSchemaValidator;
        const duringPageLoad = true;
        this.onFilesSelected(duringPageLoad);
      });
    });
  }

  /**
   * Clears all local profile information
   */
  clear() {
    if (this.profile) {
      this.profile = null;
      this.profileId = null;
      this.assets = [];
      this.localFilesListElement.innerHTML = '';

      const changeEvent = new Event('localProfileChange');
      this.dispatchEvent(changeEvent);
    }
  }

  /**
   * Processes selected files and generates an asset profile
   * @param {boolean} duringPageLoad
   */
  async onFilesSelected(duringPageLoad) {
    this.clear();

    // Skip if initialzation is incomplete
    if (!this.assetSchemaValidator) {
      return;
    }

    // Examine the files selected to find the registry profile, asset overrides, and asset files
    const assets = [];
    let assetJsonFile;
    let registryJsonFile;

    const filesList = Array.from(this.filesSelector.files);
    filesList.forEach((file) => {
      if (file.name.endsWith('.glb')) {
        assets[file.name] = window.URL.createObjectURL(file);
      } else if (file.name === 'profile.json') {
        assetJsonFile = file;
      } else if (file.name.endsWith('.json')) {
        registryJsonFile = file;
      }

      // List the files found
      this.localFilesListElement.innerHTML += `
        <li>${file.name}</li>
      `;
    });

    if (!registryJsonFile) {
      AssetError.log('No registry profile selected');
      return;
    }

    await this.buildProfile(registryJsonFile, assetJsonFile, assets);
    this.assets = assets;

    // Change the selected profile to the one just loaded.  Do not do this on initial page load
    // because the selected files persists in firefox across refreshes, but the user may have
    // selected a different item from the dropdown
    if (!duringPageLoad) {
      window.localStorage.setItem('profileId', this.profileId);
    }

    // Notify that the local profile is ready for use
    const changeEvent = new Event('localprofilechange');
    this.dispatchEvent(changeEvent);
  }

  /**
   * Build a merged profile file from the registry profile and asset overrides
   * @param {*} registryJsonFile
   * @param {*} assetJsonFile
   */
  async buildProfile(registryJsonFile, assetJsonFile) {
    // Load the registry JSON and validate it against the schema
    const registryJson = await LocalProfile.loadLocalJson(registryJsonFile);
    const isRegistryJsonValid = this.registrySchemaValidator(registryJson);
    if (!isRegistryJsonValid) {
      throw new AssetError(JSON.stringify(this.registrySchemaValidator.errors, null, 2));
    }

    // Load the asset JSON and validate it against the schema.
    // If no asset JSON present, use the default definiton
    let assetJson;
    if (!assetJsonFile) {
      assetJson = { profileId: registryJson.profileId, overrides: {} };
    } else {
      assetJson = await LocalProfile.loadLocalJson(assetJsonFile);
      const isAssetJsonValid = this.assetSchemaValidator(assetJson);
      if (!isAssetJsonValid) {
        throw new AssetError(JSON.stringify(this.assetSchemaValidator.errors, null, 2));
      }
    }

    // Validate non-schema requirements and build a combined profile
    validateRegistryProfile(registryJson);
    const expandedRegistryProfile = expandRegistryProfile(registryJson);
    this.profile = buildAssetProfile(assetJson, expandedRegistryProfile);
    this.profileId = this.profile.profileId;
  }

  /**
   * Helper to load JSON from a local file
   * @param {File} jsonFile
   */
  static loadLocalJson(jsonFile) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const json = JSON.parse(reader.result);
        resolve(json);
      };

      reader.onerror = () => {
        const errorMessage = `Unable to load JSON from ${jsonFile.name}`;
        AssetError.log(errorMessage);
        reject(errorMessage);
      };

      reader.readAsText(jsonFile);
    });
  }

  /**
   * Helper to load the combined schema file and compile an AJV validator
   * @param {string} schemasPath
   */
  static async buildSchemaValidator(schemasPath) {
    const response = await fetch(schemasPath);
    if (!response.ok) {
      throw new AssetError(response.statusText);
    }

    // eslint-disable-next-line no-undef
    const ajv = new Ajv();
    const schemas = await response.json();
    schemas.dependencies.forEach((schema) => {
      ajv.addSchema(schema);
    });

    return ajv.compile(schemas.mainSchema);
  }
}

/* eslint-disable import/no-unresolved */

const profilesBasePath = './profiles';

/**
 * Loads profiles from the distribution folder next to the viewer's location
 */
class ProfileSelector extends EventTarget {
  constructor() {
    super();

    // Get the profile id selector and listen for changes
    this.profileIdSelectorElement = document.getElementById('profileIdSelector');
    this.profileIdSelectorElement.addEventListener('change', () => { this.onProfileIdChange(); });

    // Get the handedness selector and listen for changes
    this.handednessSelectorElement = document.getElementById('handednessSelector');
    this.handednessSelectorElement.addEventListener('change', () => { this.onHandednessChange(); });

    this.forceVRProfileElement = document.getElementById('forceVRProfile');
    this.showTargetRayElement = document.getElementById('showTargetRay');

    this.localProfile = new LocalProfile();
    this.localProfile.addEventListener('localprofilechange', (event) => { this.onLocalProfileChange(event); });

    this.profilesList = null;
    this.populateProfileSelector();
  }

  /**
   * Resets all selected profile state
   */
  clearSelectedProfile() {
    AssetError.clearAll();
    this.profile = null;
    this.handedness = null;
  }

  /**
   * Retrieves the full list of available profiles and populates the dropdown
   */
  async populateProfileSelector() {
    this.clearSelectedProfile();
    this.handednessSelectorElement.innerHTML = '';

    // Load and clear local storage
    const storedProfileId = window.localStorage.getItem('profileId');
    window.localStorage.removeItem('profileId');

    // Load the list of profiles
    if (!this.profilesList) {
      try {
        this.profileIdSelectorElement.innerHTML = '<option value="loading">Loading...</option>';
        this.profilesList = await fetchProfilesList(profilesBasePath);
      } catch (error) {
        this.profileIdSelectorElement.innerHTML = 'Failed to load list';
        AssetError.log(error.message);
        throw error;
      }
    }

    // Add each profile to the dropdown
    this.profileIdSelectorElement.innerHTML = '';
    Object.keys(this.profilesList).forEach((profileId) => {
      const profile = this.profilesList[profileId];
      if (!profile.deprecated) {
        this.profileIdSelectorElement.innerHTML += `
        <option value='${profileId}'>${profileId}</option>
        `;
      }
    });

    // Add the local profile if it isn't already included
    if (this.localProfile.profileId
     && !Object.keys(this.profilesList).includes(this.localProfile.profileId)) {
      this.profileIdSelectorElement.innerHTML += `
      <option value='${this.localProfile.profileId}'>${this.localProfile.profileId}</option>
      `;
      this.profilesList[this.localProfile.profileId] = this.localProfile;
    }

    // Override the default selection if values were present in local storage
    if (storedProfileId) {
      this.profileIdSelectorElement.value = storedProfileId;
    }

    // Manually trigger selected profile to load
    this.onProfileIdChange();
  }

  /**
   * Handler for the profile id selection change
   */
  onProfileIdChange() {
    this.clearSelectedProfile();
    this.handednessSelectorElement.innerHTML = '';

    const profileId = this.profileIdSelectorElement.value;
    window.localStorage.setItem('profileId', profileId);

    if (profileId === this.localProfile.profileId) {
      this.profile = this.localProfile.profile;
      this.populateHandednessSelector();
    } else {
      // Attempt to load the profile
      this.profileIdSelectorElement.disabled = true;
      this.handednessSelectorElement.disabled = true;
      fetchProfile({ profiles: [profileId], handedness: 'any' }, profilesBasePath, null, false).then(({ profile }) => {
        this.profile = profile;
        this.populateHandednessSelector();
      })
        .catch((error) => {
          AssetError.log(error.message);
          throw error;
        })
        .finally(() => {
          this.profileIdSelectorElement.disabled = false;
          this.handednessSelectorElement.disabled = false;
        });
    }
  }

  /**
   * Populates the handedness dropdown with those supported by the selected profile
   */
  populateHandednessSelector() {
    // Load and clear the last selection for this profile id
    const storedHandedness = window.localStorage.getItem('handedness');
    window.localStorage.removeItem('handedness');

    // Populate handedness selector
    Object.keys(this.profile.layouts).forEach((handedness) => {
      this.handednessSelectorElement.innerHTML += `
        <option value='${handedness}'>${handedness}</option>
      `;
    });

    // Apply stored handedness if found
    if (storedHandedness && this.profile.layouts[storedHandedness]) {
      this.handednessSelectorElement.value = storedHandedness;
    }

    // Manually trigger selected handedness change
    this.onHandednessChange();
  }

  /**
   * Responds to changes in selected handedness.
   * Creates a new motion controller for the combination of profile and handedness, and fires an
   * event to signal the change
   */
  onHandednessChange() {
    AssetError.clearAll();
    this.handedness = this.handednessSelectorElement.value;
    window.localStorage.setItem('handedness', this.handedness);
    if (this.handedness) {
      this.dispatchEvent(new Event('selectionchange'));
    } else {
      this.dispatchEvent(new Event('selectionclear'));
    }
  }

  /**
   * Updates the profiles dropdown to ensure local profile is in the list
   */
  onLocalProfileChange() {
    this.populateProfileSelector();
  }

  /**
   * Indicates if the currently selected profile should be shown in VR instead
   * of the profiles advertised by the real XRInputSource.
   */
  get forceVRProfile() {
    return this.forceVRProfileElement.checked;
  }

  /**
   * Indicates if the targetRaySpace for an input source should be visualized in
   * VR.
   */
  get showTargetRay() {
    return this.showTargetRayElement.checked;
  }

  /**
   * Builds a MotionController either based on the supplied input source using the local profile
   * if it is the best match, otherwise uses the remote assets
   * @param {XRInputSource} xrInputSource
   */
  async createMotionController(xrInputSource) {
    let profile;
    let assetPath;

    // Check if local override should be used
    let useLocalProfile = false;
    if (this.localProfile.profileId) {
      xrInputSource.profiles.some((profileId) => {
        const matchFound = Object.keys(this.profilesList).includes(profileId);
        useLocalProfile = matchFound && (profileId === this.localProfile.profileId);
        return matchFound;
      });
    }

    // Get profile and asset path
    if (useLocalProfile) {
      ({ profile } = this.localProfile);
      const assetName = this.localProfile.profile.layouts[xrInputSource.handedness].assetPath;
      assetPath = this.localProfile.assets[assetName] || assetName;
    } else {
      ({ profile, assetPath } = await fetchProfile(xrInputSource, profilesBasePath));
    }

    // Build motion controller
    const motionController = new MotionController(
      xrInputSource,
      profile,
      assetPath
    );

    return motionController;
  }
}

const defaultBackground = 'georgentor';

class BackgroundSelector extends EventTarget {
  constructor() {
    super();

    this.backgroundSelectorElement = document.getElementById('backgroundSelector');
    this.backgroundSelectorElement.addEventListener('change', () => { this.onBackgroundChange(); });

    this.selectedBackground = window.localStorage.getItem('background') || defaultBackground;
    this.backgroundList = {};
    fetch('backgrounds/backgrounds.json')
      .then(response => response.json())
      .then((backgrounds) => {
        this.backgroundList = backgrounds;
        Object.keys(backgrounds).forEach((background) => {
          const option = document.createElement('option');
          option.value = background;
          option.innerText = background;
          if (this.selectedBackground === background) {
            option.selected = true;
          }
          this.backgroundSelectorElement.appendChild(option);
        });
        this.dispatchEvent(new Event('selectionchange'));
      });
  }

  onBackgroundChange() {
    this.selectedBackground = this.backgroundSelectorElement.value;
    window.localStorage.setItem('background', this.selectedBackground);
    this.dispatchEvent(new Event('selectionchange'));
  }

  get backgroundPath() {
    return this.backgroundList[this.selectedBackground];
  }
}

/* eslint-disable import/no-unresolved */
/* eslint-enable */

/**
 * A false gamepad to be used in tests
 */
class MockGamepad {
  /**
   * @param {Object} profileDescription - The profile description to parse to determine the length
   * of the button and axes arrays
   * @param {string} handedness - The gamepad's handedness
   */
  constructor(profileDescription, handedness) {
    if (!profileDescription) {
      throw new Error('No profileDescription supplied');
    }

    if (!handedness) {
      throw new Error('No handedness supplied');
    }

    this.id = profileDescription.profileId;

    // Loop through the profile description to determine how many elements to put in the buttons
    // and axes arrays
    let maxButtonIndex = 0;
    let maxAxisIndex = 0;
    const layout = profileDescription.layouts[handedness];
    this.mapping = layout.mapping;
    Object.values(layout.components).forEach(({ gamepadIndices }) => {
      const {
        [Constants.ComponentProperty.BUTTON]: buttonIndex,
        [Constants.ComponentProperty.X_AXIS]: xAxisIndex,
        [Constants.ComponentProperty.Y_AXIS]: yAxisIndex
      } = gamepadIndices;

      if (buttonIndex !== undefined && buttonIndex > maxButtonIndex) {
        maxButtonIndex = buttonIndex;
      }

      if (xAxisIndex !== undefined && (xAxisIndex > maxAxisIndex)) {
        maxAxisIndex = xAxisIndex;
      }

      if (yAxisIndex !== undefined && (yAxisIndex > maxAxisIndex)) {
        maxAxisIndex = yAxisIndex;
      }
    });

    // Fill the axes array
    this.axes = [];
    while (this.axes.length <= maxAxisIndex) {
      this.axes.push(0);
    }

    // Fill the buttons array
    this.buttons = [];
    while (this.buttons.length <= maxButtonIndex) {
      this.buttons.push({
        value: 0,
        touched: false,
        pressed: false
      });
    }
  }
}

/**
 * A fake XRInputSource that can be used to initialize a MotionController
 */
class MockXRInputSource {
  /**
   * @param {Object} gamepad - The Gamepad object that provides the button and axis data
   * @param {string} handedness - The handedness to report
   */
  constructor(profiles, gamepad, handedness) {
    this.gamepad = gamepad;

    if (!handedness) {
      throw new Error('No handedness supplied');
    }

    this.handedness = handedness;
    this.profiles = Object.freeze(profiles);
  }
}

/* eslint-disable import/no-unresolved */

const three = {};
let canvasParentElement;
let vrProfilesElement;
let vrProfilesListElement;

let profileSelector;
let backgroundSelector;
let mockControllerModel;
let isImmersive = false;

/**
 * Adds the event handlers for VR motion controllers to load the assets on connection
 * and remove them on disconnection
 * @param {number} index
 */
function initializeVRController(index) {
  const vrControllerGrip = three.renderer.xr.getControllerGrip(index);

  vrControllerGrip.addEventListener('connected', async (event) => {
    const controllerModel = new ControllerModel();
    vrControllerGrip.add(controllerModel);

    let xrInputSource = event.data;

    vrProfilesListElement.innerHTML += `<li><b>${xrInputSource.handedness}:</b> [${xrInputSource.profiles}]</li>`;

    if (profileSelector.forceVRProfile) {
      xrInputSource = new MockXRInputSource(
        [profileSelector.profile.profileId], event.data.gamepad, event.data.handedness
      );
    }

    const motionController = await profileSelector.createMotionController(xrInputSource);
    await controllerModel.initialize(motionController);

    if (three.environmentMap) {
      controllerModel.environmentMap = three.environmentMap;
    }
  });

  vrControllerGrip.addEventListener('disconnected', () => {
    vrControllerGrip.remove(vrControllerGrip.children[0]);
  });

  three.scene.add(vrControllerGrip);

  const vrControllerTarget = three.renderer.xr.getController(index);

  vrControllerTarget.addEventListener('connected', () => {
    if (profileSelector.showTargetRay) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3));
      geometry.setAttribute('color', new Float32BufferAttribute([0.5, 0.5, 0.5, 0, 0, 0], 3));

      const material = new LineBasicMaterial({
        vertexColors: VertexColors,
        blending: AdditiveBlending
      });

      vrControllerTarget.add(new Line(geometry, material));
    }
  });

  vrControllerTarget.addEventListener('disconnected', () => {
    if (vrControllerTarget.children.length) {
      vrControllerTarget.remove(vrControllerTarget.children[0]);
    }
  });

  three.scene.add(vrControllerTarget);
}

/**
 * The three.js render loop (used instead of requestAnimationFrame to support XR)
 */
function render() {
  if (mockControllerModel) {
    if (isImmersive) {
      three.scene.remove(mockControllerModel);
    } else {
      three.scene.add(mockControllerModel);
      ManualControls.updateText();
    }
  }

  three.cameraControls.update();

  three.renderer.render(three.scene, three.camera);
}

/**
 * @description Event handler for window resizing.
 */
function onResize() {
  const width = canvasParentElement.clientWidth;
  const height = canvasParentElement.clientHeight;
  three.camera.aspect = width / height;
  three.camera.updateProjectionMatrix();
  three.renderer.setSize(width, height);
  three.cameraControls.update();
}

/**
 * Initializes the three.js resources needed for this page
 */
function initializeThree() {
  canvasParentElement = document.getElementById('modelViewer');
  const width = canvasParentElement.clientWidth;
  const height = canvasParentElement.clientHeight;

  vrProfilesElement = document.getElementById('vrProfiles');
  vrProfilesListElement = document.getElementById('vrProfilesList');

  // Set up the THREE.js infrastructure
  three.camera = new PerspectiveCamera(75, width / height, 0.01, 1000);
  three.camera.position.y = 0.5;
  three.scene = new Scene();
  three.scene.background = new Color(0x00aa44);
  three.renderer = new WebGLRenderer({ antialias: true });
  three.renderer.setSize(width, height);
  three.renderer.gammaOutput = true;

  // Set up the controls for moving the scene around
  three.cameraControls = new OrbitControls(three.camera, three.renderer.domElement);
  three.cameraControls.enableDamping = true;
  three.cameraControls.minDistance = 0.05;
  three.cameraControls.maxDistance = 0.3;
  three.cameraControls.enablePan = false;
  three.cameraControls.update();

  // Add VR
  canvasParentElement.appendChild(VRButton.createButton(three.renderer));
  three.renderer.xr.enabled = true;
  three.renderer.xr.addEventListener('sessionstart', () => {
    vrProfilesElement.hidden = false;
    vrProfilesListElement.innerHTML = '';
    isImmersive = true;
  });
  three.renderer.xr.addEventListener('sessionend', () => { isImmersive = false; });
  initializeVRController(0);
  initializeVRController(1);

  // Add the THREE.js canvas to the page
  canvasParentElement.appendChild(three.renderer.domElement);
  window.addEventListener('resize', onResize, false);

  // Start pumping frames
  three.renderer.setAnimationLoop(render);
}

function onSelectionClear() {
  ManualControls.clear();
  if (mockControllerModel) {
    three.scene.remove(mockControllerModel);
    mockControllerModel = null;
  }
}

async function onSelectionChange() {
  onSelectionClear();
  const mockGamepad = new MockGamepad(profileSelector.profile, profileSelector.handedness);
  const mockXRInputSource = new MockXRInputSource(
    [profileSelector.profile.profileId], mockGamepad, profileSelector.handedness
  );
  mockControllerModel = new ControllerModel(mockXRInputSource);
  three.scene.add(mockControllerModel);

  const motionController = await profileSelector.createMotionController(mockXRInputSource);
  ManualControls.build(motionController);
  await mockControllerModel.initialize(motionController);

  if (three.environmentMap) {
    mockControllerModel.environmentMap = three.environmentMap;
  }
}

async function onBackgroundChange() {
  const pmremGenerator = new PMREMGenerator(three.renderer);
  pmremGenerator.compileEquirectangularShader();

  await new Promise((resolve) => {
    const rgbeLoader = new RGBELoader();
    rgbeLoader.setDataType(UnsignedByteType);
    rgbeLoader.setPath('backgrounds/');
    rgbeLoader.load(backgroundSelector.backgroundPath, (texture) => {
      three.environmentMap = pmremGenerator.fromEquirectangular(texture).texture;
      three.scene.background = three.environmentMap;

      if (mockControllerModel) {
        mockControllerModel.environmentMap = three.environmentMap;
      }

      pmremGenerator.dispose();
      resolve(three.environmentMap);
    });
  });
}

/**
 * Page load handler for initialzing things that depend on the DOM to be ready
 */
function onLoad() {
  AssetError.initialize();
  profileSelector = new ProfileSelector();
  initializeThree();

  profileSelector.addEventListener('selectionclear', onSelectionClear);
  profileSelector.addEventListener('selectionchange', onSelectionChange);

  backgroundSelector = new BackgroundSelector();
  backgroundSelector.addEventListener('selectionchange', onBackgroundChange);
}
window.addEventListener('load', onLoad);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWxWaWV3ZXIuanMiLCJzb3VyY2VzIjpbIi4uL3NyYy9tYW51YWxDb250cm9scy5qcyIsIi4uL3NyYy9hc3NldEVycm9yLmpzIiwiLi4vc3JjL2NvbnRyb2xsZXJNb2RlbC5qcyIsIi4uL3NyYy9sb2NhbFByb2ZpbGUuanMiLCIuLi9zcmMvcHJvZmlsZVNlbGVjdG9yLmpzIiwiLi4vc3JjL2JhY2tncm91bmRTZWxlY3Rvci5qcyIsIi4uL3NyYy9tb2Nrcy9tb2NrR2FtZXBhZC5qcyIsIi4uL3NyYy9tb2Nrcy9tb2NrWFJJbnB1dFNvdXJjZS5qcyIsIi4uL3NyYy9tb2RlbFZpZXdlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJsZXQgbW90aW9uQ29udHJvbGxlcjtcbmxldCBtb2NrR2FtZXBhZDtcbmxldCBjb250cm9sc0xpc3RFbGVtZW50O1xuXG5mdW5jdGlvbiB1cGRhdGVUZXh0KCkge1xuICBpZiAobW90aW9uQ29udHJvbGxlcikge1xuICAgIE9iamVjdC52YWx1ZXMobW90aW9uQ29udHJvbGxlci5jb21wb25lbnRzKS5mb3JFYWNoKChjb21wb25lbnQpID0+IHtcbiAgICAgIGNvbnN0IGRhdGFFbGVtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYCR7Y29tcG9uZW50LmlkfV9kYXRhYCk7XG4gICAgICBkYXRhRWxlbWVudC5pbm5lckhUTUwgPSBKU09OLnN0cmluZ2lmeShjb21wb25lbnQuZGF0YSwgbnVsbCwgMik7XG4gICAgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gb25CdXR0b25WYWx1ZUNoYW5nZShldmVudCkge1xuICBjb25zdCB7IGluZGV4IH0gPSBldmVudC50YXJnZXQuZGF0YXNldDtcbiAgbW9ja0dhbWVwYWQuYnV0dG9uc1tpbmRleF0udmFsdWUgPSBOdW1iZXIoZXZlbnQudGFyZ2V0LnZhbHVlKTtcbn1cblxuZnVuY3Rpb24gb25BeGlzVmFsdWVDaGFuZ2UoZXZlbnQpIHtcbiAgY29uc3QgeyBpbmRleCB9ID0gZXZlbnQudGFyZ2V0LmRhdGFzZXQ7XG4gIG1vY2tHYW1lcGFkLmF4ZXNbaW5kZXhdID0gTnVtYmVyKGV2ZW50LnRhcmdldC52YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIGNsZWFyKCkge1xuICBtb3Rpb25Db250cm9sbGVyID0gdW5kZWZpbmVkO1xuICBtb2NrR2FtZXBhZCA9IHVuZGVmaW5lZDtcblxuICBpZiAoIWNvbnRyb2xzTGlzdEVsZW1lbnQpIHtcbiAgICBjb250cm9sc0xpc3RFbGVtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvbnRyb2xzTGlzdCcpO1xuICB9XG4gIGNvbnRyb2xzTGlzdEVsZW1lbnQuaW5uZXJIVE1MID0gJyc7XG59XG5cbmZ1bmN0aW9uIGFkZEJ1dHRvbkNvbnRyb2xzKGNvbXBvbmVudENvbnRyb2xzRWxlbWVudCwgYnV0dG9uSW5kZXgpIHtcbiAgY29uc3QgYnV0dG9uQ29udHJvbHNFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gIGJ1dHRvbkNvbnRyb2xzRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2NsYXNzJywgJ2NvbXBvbmVudENvbnRyb2xzJyk7XG5cbiAgYnV0dG9uQ29udHJvbHNFbGVtZW50LmlubmVySFRNTCArPSBgXG4gIDxsYWJlbD5idXR0b25WYWx1ZTwvbGFiZWw+XG4gIDxpbnB1dCBpZD1cImJ1dHRvbnNbJHtidXR0b25JbmRleH1dLnZhbHVlXCIgZGF0YS1pbmRleD1cIiR7YnV0dG9uSW5kZXh9XCIgdHlwZT1cInJhbmdlXCIgbWluPVwiMFwiIG1heD1cIjFcIiBzdGVwPVwiMC4wMVwiIHZhbHVlPVwiMFwiPlxuICBgO1xuXG4gIGNvbXBvbmVudENvbnRyb2xzRWxlbWVudC5hcHBlbmRDaGlsZChidXR0b25Db250cm9sc0VsZW1lbnQpO1xuXG4gIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGBidXR0b25zWyR7YnV0dG9uSW5kZXh9XS52YWx1ZWApLmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0Jywgb25CdXR0b25WYWx1ZUNoYW5nZSk7XG59XG5cbmZ1bmN0aW9uIGFkZEF4aXNDb250cm9scyhjb21wb25lbnRDb250cm9sc0VsZW1lbnQsIGF4aXNOYW1lLCBheGlzSW5kZXgpIHtcbiAgY29uc3QgYXhpc0NvbnRyb2xzRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICBheGlzQ29udHJvbHNFbGVtZW50LnNldEF0dHJpYnV0ZSgnY2xhc3MnLCAnY29tcG9uZW50Q29udHJvbHMnKTtcblxuICBheGlzQ29udHJvbHNFbGVtZW50LmlubmVySFRNTCArPSBgXG4gIDxsYWJlbD4ke2F4aXNOYW1lfTxsYWJlbD5cbiAgPGlucHV0IGlkPVwiYXhlc1ske2F4aXNJbmRleH1dXCIgZGF0YS1pbmRleD1cIiR7YXhpc0luZGV4fVwiXG4gICAgICAgICAgdHlwZT1cInJhbmdlXCIgbWluPVwiLTFcIiBtYXg9XCIxXCIgc3RlcD1cIjAuMDFcIiB2YWx1ZT1cIjBcIj5cbiAgYDtcblxuICBjb21wb25lbnRDb250cm9sc0VsZW1lbnQuYXBwZW5kQ2hpbGQoYXhpc0NvbnRyb2xzRWxlbWVudCk7XG5cbiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYGF4ZXNbJHtheGlzSW5kZXh9XWApLmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0Jywgb25BeGlzVmFsdWVDaGFuZ2UpO1xufVxuXG5mdW5jdGlvbiBidWlsZChzb3VyY2VNb3Rpb25Db250cm9sbGVyKSB7XG4gIGNsZWFyKCk7XG5cbiAgbW90aW9uQ29udHJvbGxlciA9IHNvdXJjZU1vdGlvbkNvbnRyb2xsZXI7XG4gIG1vY2tHYW1lcGFkID0gbW90aW9uQ29udHJvbGxlci54cklucHV0U291cmNlLmdhbWVwYWQ7XG5cbiAgT2JqZWN0LnZhbHVlcyhtb3Rpb25Db250cm9sbGVyLmNvbXBvbmVudHMpLmZvckVhY2goKGNvbXBvbmVudCkgPT4ge1xuICAgIGNvbnN0IGNvbXBvbmVudENvbnRyb2xzRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2xpJyk7XG4gICAgY29tcG9uZW50Q29udHJvbHNFbGVtZW50LnNldEF0dHJpYnV0ZSgnY2xhc3MnLCAnY29tcG9uZW50Jyk7XG4gICAgY29udHJvbHNMaXN0RWxlbWVudC5hcHBlbmRDaGlsZChjb21wb25lbnRDb250cm9sc0VsZW1lbnQpO1xuXG4gICAgY29uc3QgaGVhZGluZ0VsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdoNCcpO1xuICAgIGhlYWRpbmdFbGVtZW50LmlubmVyVGV4dCA9IGAke2NvbXBvbmVudC5pZH1gO1xuICAgIGNvbXBvbmVudENvbnRyb2xzRWxlbWVudC5hcHBlbmRDaGlsZChoZWFkaW5nRWxlbWVudCk7XG5cbiAgICBpZiAoY29tcG9uZW50LmdhbWVwYWRJbmRpY2VzLmJ1dHRvbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBhZGRCdXR0b25Db250cm9scyhjb21wb25lbnRDb250cm9sc0VsZW1lbnQsIGNvbXBvbmVudC5nYW1lcGFkSW5kaWNlcy5idXR0b24pO1xuICAgIH1cblxuICAgIGlmIChjb21wb25lbnQuZ2FtZXBhZEluZGljZXMueEF4aXMgIT09IHVuZGVmaW5lZCkge1xuICAgICAgYWRkQXhpc0NvbnRyb2xzKGNvbXBvbmVudENvbnRyb2xzRWxlbWVudCwgJ3hBeGlzJywgY29tcG9uZW50LmdhbWVwYWRJbmRpY2VzLnhBeGlzKTtcbiAgICB9XG5cbiAgICBpZiAoY29tcG9uZW50LmdhbWVwYWRJbmRpY2VzLnlBeGlzICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGFkZEF4aXNDb250cm9scyhjb21wb25lbnRDb250cm9sc0VsZW1lbnQsICd5QXhpcycsIGNvbXBvbmVudC5nYW1lcGFkSW5kaWNlcy55QXhpcyk7XG4gICAgfVxuXG4gICAgY29uc3QgZGF0YUVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwcmUnKTtcbiAgICBkYXRhRWxlbWVudC5pZCA9IGAke2NvbXBvbmVudC5pZH1fZGF0YWA7XG4gICAgY29tcG9uZW50Q29udHJvbHNFbGVtZW50LmFwcGVuZENoaWxkKGRhdGFFbGVtZW50KTtcbiAgfSk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IHsgY2xlYXIsIGJ1aWxkLCB1cGRhdGVUZXh0IH07XG4iLCJsZXQgZXJyb3JzU2VjdGlvbkVsZW1lbnQ7XG5sZXQgZXJyb3JzTGlzdEVsZW1lbnQ7XG5jbGFzcyBBc3NldEVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICBjb25zdHJ1Y3RvciguLi5wYXJhbXMpIHtcbiAgICBzdXBlciguLi5wYXJhbXMpO1xuICAgIEFzc2V0RXJyb3IubG9nKHRoaXMubWVzc2FnZSk7XG4gIH1cblxuICBzdGF0aWMgaW5pdGlhbGl6ZSgpIHtcbiAgICBlcnJvcnNMaXN0RWxlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdlcnJvcnMnKTtcbiAgICBlcnJvcnNTZWN0aW9uRWxlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdlcnJvcnMnKTtcbiAgfVxuXG4gIHN0YXRpYyBsb2coZXJyb3JNZXNzYWdlKSB7XG4gICAgY29uc3QgaXRlbUVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaScpO1xuICAgIGl0ZW1FbGVtZW50LmlubmVyVGV4dCA9IGVycm9yTWVzc2FnZTtcbiAgICBlcnJvcnNMaXN0RWxlbWVudC5hcHBlbmRDaGlsZChpdGVtRWxlbWVudCk7XG4gICAgZXJyb3JzU2VjdGlvbkVsZW1lbnQuaGlkZGVuID0gZmFsc2U7XG4gIH1cblxuICBzdGF0aWMgY2xlYXJBbGwoKSB7XG4gICAgZXJyb3JzTGlzdEVsZW1lbnQuaW5uZXJIVE1MID0gJyc7XG4gICAgZXJyb3JzU2VjdGlvbkVsZW1lbnQuaGlkZGVuID0gdHJ1ZTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBBc3NldEVycm9yO1xuIiwiLyogZXNsaW50LWRpc2FibGUgaW1wb3J0L25vLXVucmVzb2x2ZWQgKi9cbmltcG9ydCAqIGFzIFRIUkVFIGZyb20gJy4vdGhyZWUvYnVpbGQvdGhyZWUubW9kdWxlLmpzJztcbmltcG9ydCB7IEdMVEZMb2FkZXIgfSBmcm9tICcuL3RocmVlL2V4YW1wbGVzL2pzbS9sb2FkZXJzL0dMVEZMb2FkZXIuanMnO1xuaW1wb3J0IHsgQ29uc3RhbnRzIH0gZnJvbSAnLi9tb3Rpb24tY29udHJvbGxlcnMubW9kdWxlLmpzJztcbi8qIGVzbGludC1lbmFibGUgKi9cblxuaW1wb3J0IEFzc2V0RXJyb3IgZnJvbSAnLi9hc3NldEVycm9yLmpzJztcblxuY29uc3QgZ2x0ZkxvYWRlciA9IG5ldyBHTFRGTG9hZGVyKCk7XG5cbmNsYXNzIENvbnRyb2xsZXJNb2RlbCBleHRlbmRzIFRIUkVFLk9iamVjdDNEIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoKTtcbiAgICB0aGlzLnhySW5wdXRTb3VyY2UgPSBudWxsO1xuICAgIHRoaXMubW90aW9uQ29udHJvbGxlciA9IG51bGw7XG4gICAgdGhpcy5hc3NldCA9IG51bGw7XG4gICAgdGhpcy5yb290Tm9kZSA9IG51bGw7XG4gICAgdGhpcy5ub2RlcyA9IHt9O1xuICAgIHRoaXMubG9hZGVkID0gZmFsc2U7XG4gICAgdGhpcy5lbnZNYXAgPSBudWxsO1xuICB9XG5cbiAgc2V0IGVudmlyb25tZW50TWFwKHZhbHVlKSB7XG4gICAgaWYgKHRoaXMuZW52TWFwID09PSB2YWx1ZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuZW52TWFwID0gdmFsdWU7XG4gICAgLyogZXNsaW50LWRpc2FibGUgbm8tcGFyYW0tcmVhc3NpZ24gKi9cbiAgICB0aGlzLnRyYXZlcnNlKChjaGlsZCkgPT4ge1xuICAgICAgaWYgKGNoaWxkLmlzTWVzaCkge1xuICAgICAgICBjaGlsZC5tYXRlcmlhbC5lbnZNYXAgPSB0aGlzLmVudk1hcDtcbiAgICAgICAgY2hpbGQubWF0ZXJpYWwubmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICAgIC8qIGVzbGludC1lbmFibGUgKi9cbiAgfVxuXG4gIGdldCBlbnZpcm9ubWVudE1hcCgpIHtcbiAgICByZXR1cm4gdGhpcy5lbnZNYXA7XG4gIH1cblxuICBhc3luYyBpbml0aWFsaXplKG1vdGlvbkNvbnRyb2xsZXIpIHtcbiAgICB0aGlzLm1vdGlvbkNvbnRyb2xsZXIgPSBtb3Rpb25Db250cm9sbGVyO1xuICAgIHRoaXMueHJJbnB1dFNvdXJjZSA9IHRoaXMubW90aW9uQ29udHJvbGxlci54cklucHV0U291cmNlO1xuXG4gICAgLy8gRmV0Y2ggdGhlIGFzc2V0cyBhbmQgZ2VuZXJhdGUgdGhyZWVqcyBvYmplY3RzIGZvciBpdFxuICAgIHRoaXMuYXNzZXQgPSBhd2FpdCBuZXcgUHJvbWlzZSgoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgZ2x0ZkxvYWRlci5sb2FkKFxuICAgICAgICBtb3Rpb25Db250cm9sbGVyLmFzc2V0VXJsLFxuICAgICAgICAobG9hZGVkQXNzZXQpID0+IHsgcmVzb2x2ZShsb2FkZWRBc3NldCk7IH0sXG4gICAgICAgIG51bGwsXG4gICAgICAgICgpID0+IHsgcmVqZWN0KG5ldyBBc3NldEVycm9yKGBBc3NldCAke21vdGlvbkNvbnRyb2xsZXIuYXNzZXRVcmx9IG1pc3Npbmcgb3IgbWFsZm9ybWVkLmApKTsgfVxuICAgICAgKTtcbiAgICB9KSk7XG5cbiAgICBpZiAodGhpcy5lbnZNYXApIHtcbiAgICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLXBhcmFtLXJlYXNzaWduICovXG4gICAgICB0aGlzLmFzc2V0LnNjZW5lLnRyYXZlcnNlKChjaGlsZCkgPT4ge1xuICAgICAgICBpZiAoY2hpbGQuaXNNZXNoKSB7XG4gICAgICAgICAgY2hpbGQubWF0ZXJpYWwuZW52TWFwID0gdGhpcy5lbnZNYXA7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgLyogZXNsaW50LWVuYWJsZSAqL1xuICAgIH1cblxuICAgIHRoaXMucm9vdE5vZGUgPSB0aGlzLmFzc2V0LnNjZW5lO1xuICAgIHRoaXMuYWRkVG91Y2hEb3RzKCk7XG4gICAgdGhpcy5maW5kTm9kZXMoKTtcbiAgICB0aGlzLmFkZCh0aGlzLnJvb3ROb2RlKTtcbiAgICB0aGlzLmxvYWRlZCA9IHRydWU7XG4gIH1cblxuICAvKipcbiAgICogUG9sbHMgZGF0YSBmcm9tIHRoZSBYUklucHV0U291cmNlIGFuZCB1cGRhdGVzIHRoZSBtb2RlbCdzIGNvbXBvbmVudHMgdG8gbWF0Y2hcbiAgICogdGhlIHJlYWwgd29ybGQgZGF0YVxuICAgKi9cbiAgdXBkYXRlTWF0cml4V29ybGQoZm9yY2UpIHtcbiAgICBzdXBlci51cGRhdGVNYXRyaXhXb3JsZChmb3JjZSk7XG5cbiAgICBpZiAoIXRoaXMubG9hZGVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gQ2F1c2UgdGhlIE1vdGlvbkNvbnRyb2xsZXIgdG8gcG9sbCB0aGUgR2FtZXBhZCBmb3IgZGF0YVxuICAgIHRoaXMubW90aW9uQ29udHJvbGxlci51cGRhdGVGcm9tR2FtZXBhZCgpO1xuXG4gICAgLy8gVXBkYXRlIHRoZSAzRCBtb2RlbCB0byByZWZsZWN0IHRoZSBidXR0b24sIHRodW1ic3RpY2ssIGFuZCB0b3VjaHBhZCBzdGF0ZVxuICAgIE9iamVjdC52YWx1ZXModGhpcy5tb3Rpb25Db250cm9sbGVyLmNvbXBvbmVudHMpLmZvckVhY2goKGNvbXBvbmVudCkgPT4ge1xuICAgICAgLy8gVXBkYXRlIG5vZGUgZGF0YSBiYXNlZCBvbiB0aGUgdmlzdWFsIHJlc3BvbnNlcycgY3VycmVudCBzdGF0ZXNcbiAgICAgIE9iamVjdC52YWx1ZXMoY29tcG9uZW50LnZpc3VhbFJlc3BvbnNlcykuZm9yRWFjaCgodmlzdWFsUmVzcG9uc2UpID0+IHtcbiAgICAgICAgY29uc3Qge1xuICAgICAgICAgIHZhbHVlTm9kZU5hbWUsIG1pbk5vZGVOYW1lLCBtYXhOb2RlTmFtZSwgdmFsdWUsIHZhbHVlTm9kZVByb3BlcnR5XG4gICAgICAgIH0gPSB2aXN1YWxSZXNwb25zZTtcbiAgICAgICAgY29uc3QgdmFsdWVOb2RlID0gdGhpcy5ub2Rlc1t2YWx1ZU5vZGVOYW1lXTtcblxuICAgICAgICAvLyBTa2lwIGlmIHRoZSB2aXN1YWwgcmVzcG9uc2Ugbm9kZSBpcyBub3QgZm91bmQuIE5vIGVycm9yIGlzIG5lZWRlZCxcbiAgICAgICAgLy8gYmVjYXVzZSBpdCB3aWxsIGhhdmUgYmVlbiByZXBvcnRlZCBhdCBsb2FkIHRpbWUuXG4gICAgICAgIGlmICghdmFsdWVOb2RlKSByZXR1cm47XG5cbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBuZXcgcHJvcGVydGllcyBiYXNlZCBvbiB0aGUgd2VpZ2h0IHN1cHBsaWVkXG4gICAgICAgIGlmICh2YWx1ZU5vZGVQcm9wZXJ0eSA9PT0gQ29uc3RhbnRzLlZpc3VhbFJlc3BvbnNlUHJvcGVydHkuVklTSUJJTElUWSkge1xuICAgICAgICAgIHZhbHVlTm9kZS52aXNpYmxlID0gdmFsdWU7XG4gICAgICAgIH0gZWxzZSBpZiAodmFsdWVOb2RlUHJvcGVydHkgPT09IENvbnN0YW50cy5WaXN1YWxSZXNwb25zZVByb3BlcnR5LlRSQU5TRk9STSkge1xuICAgICAgICAgIGNvbnN0IG1pbk5vZGUgPSB0aGlzLm5vZGVzW21pbk5vZGVOYW1lXTtcbiAgICAgICAgICBjb25zdCBtYXhOb2RlID0gdGhpcy5ub2Rlc1ttYXhOb2RlTmFtZV07XG4gICAgICAgICAgVEhSRUUuUXVhdGVybmlvbi5zbGVycChcbiAgICAgICAgICAgIG1pbk5vZGUucXVhdGVybmlvbixcbiAgICAgICAgICAgIG1heE5vZGUucXVhdGVybmlvbixcbiAgICAgICAgICAgIHZhbHVlTm9kZS5xdWF0ZXJuaW9uLFxuICAgICAgICAgICAgdmFsdWVcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgdmFsdWVOb2RlLnBvc2l0aW9uLmxlcnBWZWN0b3JzKFxuICAgICAgICAgICAgbWluTm9kZS5wb3NpdGlvbixcbiAgICAgICAgICAgIG1heE5vZGUucG9zaXRpb24sXG4gICAgICAgICAgICB2YWx1ZVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIFdhbGtzIHRoZSBtb2RlbCdzIHRyZWUgdG8gZmluZCB0aGUgbm9kZXMgbmVlZGVkIHRvIGFuaW1hdGUgdGhlIGNvbXBvbmVudHMgYW5kXG4gICAqIHNhdmVzIHRoZW0gZm9yIHVzZSBpbiB0aGUgZnJhbWUgbG9vcFxuICAgKi9cbiAgZmluZE5vZGVzKCkge1xuICAgIHRoaXMubm9kZXMgPSB7fTtcblxuICAgIC8vIExvb3AgdGhyb3VnaCB0aGUgY29tcG9uZW50cyBhbmQgZmluZCB0aGUgbm9kZXMgbmVlZGVkIGZvciBlYWNoIGNvbXBvbmVudHMnIHZpc3VhbCByZXNwb25zZXNcbiAgICBPYmplY3QudmFsdWVzKHRoaXMubW90aW9uQ29udHJvbGxlci5jb21wb25lbnRzKS5mb3JFYWNoKChjb21wb25lbnQpID0+IHtcbiAgICAgIGNvbnN0IHsgdG91Y2hQb2ludE5vZGVOYW1lLCB2aXN1YWxSZXNwb25zZXMgfSA9IGNvbXBvbmVudDtcbiAgICAgIGlmICh0b3VjaFBvaW50Tm9kZU5hbWUpIHtcbiAgICAgICAgdGhpcy5ub2Rlc1t0b3VjaFBvaW50Tm9kZU5hbWVdID0gdGhpcy5yb290Tm9kZS5nZXRPYmplY3RCeU5hbWUodG91Y2hQb2ludE5vZGVOYW1lKTtcbiAgICAgIH1cblxuICAgICAgLy8gTG9vcCB0aHJvdWdoIGFsbCB0aGUgdmlzdWFsIHJlc3BvbnNlcyB0byBiZSBhcHBsaWVkIHRvIHRoaXMgY29tcG9uZW50XG4gICAgICBPYmplY3QudmFsdWVzKHZpc3VhbFJlc3BvbnNlcykuZm9yRWFjaCgodmlzdWFsUmVzcG9uc2UpID0+IHtcbiAgICAgICAgY29uc3Qge1xuICAgICAgICAgIHZhbHVlTm9kZU5hbWUsIG1pbk5vZGVOYW1lLCBtYXhOb2RlTmFtZSwgdmFsdWVOb2RlUHJvcGVydHlcbiAgICAgICAgfSA9IHZpc3VhbFJlc3BvbnNlO1xuICAgICAgICAvLyBJZiBhbmltYXRpbmcgYSB0cmFuc2Zvcm0sIGZpbmQgdGhlIHR3byBub2RlcyB0byBiZSBpbnRlcnBvbGF0ZWQgYmV0d2Vlbi5cbiAgICAgICAgaWYgKHZhbHVlTm9kZVByb3BlcnR5ID09PSBDb25zdGFudHMuVmlzdWFsUmVzcG9uc2VQcm9wZXJ0eS5UUkFOU0ZPUk0pIHtcbiAgICAgICAgICB0aGlzLm5vZGVzW21pbk5vZGVOYW1lXSA9IHRoaXMucm9vdE5vZGUuZ2V0T2JqZWN0QnlOYW1lKG1pbk5vZGVOYW1lKTtcbiAgICAgICAgICB0aGlzLm5vZGVzW21heE5vZGVOYW1lXSA9IHRoaXMucm9vdE5vZGUuZ2V0T2JqZWN0QnlOYW1lKG1heE5vZGVOYW1lKTtcblxuICAgICAgICAgIC8vIElmIHRoZSBleHRlbnRzIGNhbm5vdCBiZSBmb3VuZCwgc2tpcCB0aGlzIGFuaW1hdGlvblxuICAgICAgICAgIGlmICghdGhpcy5ub2Rlc1ttaW5Ob2RlTmFtZV0pIHtcbiAgICAgICAgICAgIEFzc2V0RXJyb3IubG9nKGBDb3VsZCBub3QgZmluZCAke21pbk5vZGVOYW1lfSBpbiB0aGUgbW9kZWxgKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCF0aGlzLm5vZGVzW21heE5vZGVOYW1lXSkge1xuICAgICAgICAgICAgQXNzZXRFcnJvci5sb2coYENvdWxkIG5vdCBmaW5kICR7bWF4Tm9kZU5hbWV9IGluIHRoZSBtb2RlbGApO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHRoZSB0YXJnZXQgbm9kZSBjYW5ub3QgYmUgZm91bmQsIHNraXAgdGhpcyBhbmltYXRpb25cbiAgICAgICAgdGhpcy5ub2Rlc1t2YWx1ZU5vZGVOYW1lXSA9IHRoaXMucm9vdE5vZGUuZ2V0T2JqZWN0QnlOYW1lKHZhbHVlTm9kZU5hbWUpO1xuICAgICAgICBpZiAoIXRoaXMubm9kZXNbdmFsdWVOb2RlTmFtZV0pIHtcbiAgICAgICAgICBBc3NldEVycm9yLmxvZyhgQ291bGQgbm90IGZpbmQgJHt2YWx1ZU5vZGVOYW1lfSBpbiB0aGUgbW9kZWxgKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQWRkIHRvdWNoIGRvdHMgdG8gYWxsIHRvdWNocGFkIGNvbXBvbmVudHMgc28gdGhlIGZpbmdlciBjYW4gYmUgc2VlblxuICAgKi9cbiAgYWRkVG91Y2hEb3RzKCkge1xuICAgIE9iamVjdC5rZXlzKHRoaXMubW90aW9uQ29udHJvbGxlci5jb21wb25lbnRzKS5mb3JFYWNoKChjb21wb25lbnRJZCkgPT4ge1xuICAgICAgY29uc3QgY29tcG9uZW50ID0gdGhpcy5tb3Rpb25Db250cm9sbGVyLmNvbXBvbmVudHNbY29tcG9uZW50SWRdO1xuICAgICAgLy8gRmluZCB0aGUgdG91Y2hwYWRzXG4gICAgICBpZiAoY29tcG9uZW50LnR5cGUgPT09IENvbnN0YW50cy5Db21wb25lbnRUeXBlLlRPVUNIUEFEKSB7XG4gICAgICAgIC8vIEZpbmQgdGhlIG5vZGUgdG8gYXR0YWNoIHRoZSB0b3VjaCBkb3QuXG4gICAgICAgIGNvbnN0IHRvdWNoUG9pbnRSb290ID0gdGhpcy5yb290Tm9kZS5nZXRPYmplY3RCeU5hbWUoY29tcG9uZW50LnRvdWNoUG9pbnROb2RlTmFtZSwgdHJ1ZSk7XG4gICAgICAgIGlmICghdG91Y2hQb2ludFJvb3QpIHtcbiAgICAgICAgICBBc3NldEVycm9yLmxvZyhgQ291bGQgbm90IGZpbmQgdG91Y2ggZG90LCAke2NvbXBvbmVudC50b3VjaFBvaW50Tm9kZU5hbWV9LCBpbiB0b3VjaHBhZCBjb21wb25lbnQgJHtjb21wb25lbnRJZH1gKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdCBzcGhlcmVHZW9tZXRyeSA9IG5ldyBUSFJFRS5TcGhlcmVHZW9tZXRyeSgwLjAwMSk7XG4gICAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoeyBjb2xvcjogMHgwMDAwRkYgfSk7XG4gICAgICAgICAgY29uc3Qgc3BoZXJlID0gbmV3IFRIUkVFLk1lc2goc3BoZXJlR2VvbWV0cnksIG1hdGVyaWFsKTtcbiAgICAgICAgICB0b3VjaFBvaW50Um9vdC5hZGQoc3BoZXJlKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IENvbnRyb2xsZXJNb2RlbDtcbiIsIi8qIGVzbGludC1kaXNhYmxlIGltcG9ydC9uby11bnJlc29sdmVkICovXG5pbXBvcnQgJy4vYWp2L2Fqdi5taW4uanMnO1xuaW1wb3J0IHZhbGlkYXRlUmVnaXN0cnlQcm9maWxlIGZyb20gJy4vcmVnaXN0cnlUb29scy92YWxpZGF0ZVJlZ2lzdHJ5UHJvZmlsZS5qcyc7XG5pbXBvcnQgZXhwYW5kUmVnaXN0cnlQcm9maWxlIGZyb20gJy4vYXNzZXRUb29scy9leHBhbmRSZWdpc3RyeVByb2ZpbGUuanMnO1xuaW1wb3J0IGJ1aWxkQXNzZXRQcm9maWxlIGZyb20gJy4vYXNzZXRUb29scy9idWlsZEFzc2V0UHJvZmlsZS5qcyc7XG4vKiBlc2xpbnQtZW5hYmxlICovXG5cbmltcG9ydCBBc3NldEVycm9yIGZyb20gJy4vYXNzZXRFcnJvci5qcyc7XG5cbi8qKlxuICogTG9hZHMgYSBwcm9maWxlIGZyb20gYSBzZXQgb2YgbG9jYWwgZmlsZXNcbiAqL1xuY2xhc3MgTG9jYWxQcm9maWxlIGV4dGVuZHMgRXZlbnRUYXJnZXQge1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcigpO1xuXG4gICAgdGhpcy5sb2NhbEZpbGVzTGlzdEVsZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9jYWxGaWxlc0xpc3QnKTtcbiAgICB0aGlzLmZpbGVzU2VsZWN0b3IgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9jYWxGaWxlc1NlbGVjdG9yJyk7XG4gICAgdGhpcy5maWxlc1NlbGVjdG9yLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsICgpID0+IHtcbiAgICAgIHRoaXMub25GaWxlc1NlbGVjdGVkKCk7XG4gICAgfSk7XG5cbiAgICB0aGlzLmNsZWFyKCk7XG5cbiAgICBMb2NhbFByb2ZpbGUuYnVpbGRTY2hlbWFWYWxpZGF0b3IoJ3JlZ2lzdHJ5VG9vbHMvcmVnaXN0cnlTY2hlbWFzLmpzb24nKS50aGVuKChyZWdpc3RyeVNjaGVtYVZhbGlkYXRvcikgPT4ge1xuICAgICAgdGhpcy5yZWdpc3RyeVNjaGVtYVZhbGlkYXRvciA9IHJlZ2lzdHJ5U2NoZW1hVmFsaWRhdG9yO1xuICAgICAgTG9jYWxQcm9maWxlLmJ1aWxkU2NoZW1hVmFsaWRhdG9yKCdhc3NldFRvb2xzL2Fzc2V0U2NoZW1hcy5qc29uJykudGhlbigoYXNzZXRTY2hlbWFWYWxpZGF0b3IpID0+IHtcbiAgICAgICAgdGhpcy5hc3NldFNjaGVtYVZhbGlkYXRvciA9IGFzc2V0U2NoZW1hVmFsaWRhdG9yO1xuICAgICAgICBjb25zdCBkdXJpbmdQYWdlTG9hZCA9IHRydWU7XG4gICAgICAgIHRoaXMub25GaWxlc1NlbGVjdGVkKGR1cmluZ1BhZ2VMb2FkKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIENsZWFycyBhbGwgbG9jYWwgcHJvZmlsZSBpbmZvcm1hdGlvblxuICAgKi9cbiAgY2xlYXIoKSB7XG4gICAgaWYgKHRoaXMucHJvZmlsZSkge1xuICAgICAgdGhpcy5wcm9maWxlID0gbnVsbDtcbiAgICAgIHRoaXMucHJvZmlsZUlkID0gbnVsbDtcbiAgICAgIHRoaXMuYXNzZXRzID0gW107XG4gICAgICB0aGlzLmxvY2FsRmlsZXNMaXN0RWxlbWVudC5pbm5lckhUTUwgPSAnJztcblxuICAgICAgY29uc3QgY2hhbmdlRXZlbnQgPSBuZXcgRXZlbnQoJ2xvY2FsUHJvZmlsZUNoYW5nZScpO1xuICAgICAgdGhpcy5kaXNwYXRjaEV2ZW50KGNoYW5nZUV2ZW50KTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUHJvY2Vzc2VzIHNlbGVjdGVkIGZpbGVzIGFuZCBnZW5lcmF0ZXMgYW4gYXNzZXQgcHJvZmlsZVxuICAgKiBAcGFyYW0ge2Jvb2xlYW59IGR1cmluZ1BhZ2VMb2FkXG4gICAqL1xuICBhc3luYyBvbkZpbGVzU2VsZWN0ZWQoZHVyaW5nUGFnZUxvYWQpIHtcbiAgICB0aGlzLmNsZWFyKCk7XG5cbiAgICAvLyBTa2lwIGlmIGluaXRpYWx6YXRpb24gaXMgaW5jb21wbGV0ZVxuICAgIGlmICghdGhpcy5hc3NldFNjaGVtYVZhbGlkYXRvcikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIEV4YW1pbmUgdGhlIGZpbGVzIHNlbGVjdGVkIHRvIGZpbmQgdGhlIHJlZ2lzdHJ5IHByb2ZpbGUsIGFzc2V0IG92ZXJyaWRlcywgYW5kIGFzc2V0IGZpbGVzXG4gICAgY29uc3QgYXNzZXRzID0gW107XG4gICAgbGV0IGFzc2V0SnNvbkZpbGU7XG4gICAgbGV0IHJlZ2lzdHJ5SnNvbkZpbGU7XG5cbiAgICBjb25zdCBmaWxlc0xpc3QgPSBBcnJheS5mcm9tKHRoaXMuZmlsZXNTZWxlY3Rvci5maWxlcyk7XG4gICAgZmlsZXNMaXN0LmZvckVhY2goKGZpbGUpID0+IHtcbiAgICAgIGlmIChmaWxlLm5hbWUuZW5kc1dpdGgoJy5nbGInKSkge1xuICAgICAgICBhc3NldHNbZmlsZS5uYW1lXSA9IHdpbmRvdy5VUkwuY3JlYXRlT2JqZWN0VVJMKGZpbGUpO1xuICAgICAgfSBlbHNlIGlmIChmaWxlLm5hbWUgPT09ICdwcm9maWxlLmpzb24nKSB7XG4gICAgICAgIGFzc2V0SnNvbkZpbGUgPSBmaWxlO1xuICAgICAgfSBlbHNlIGlmIChmaWxlLm5hbWUuZW5kc1dpdGgoJy5qc29uJykpIHtcbiAgICAgICAgcmVnaXN0cnlKc29uRmlsZSA9IGZpbGU7XG4gICAgICB9XG5cbiAgICAgIC8vIExpc3QgdGhlIGZpbGVzIGZvdW5kXG4gICAgICB0aGlzLmxvY2FsRmlsZXNMaXN0RWxlbWVudC5pbm5lckhUTUwgKz0gYFxuICAgICAgICA8bGk+JHtmaWxlLm5hbWV9PC9saT5cbiAgICAgIGA7XG4gICAgfSk7XG5cbiAgICBpZiAoIXJlZ2lzdHJ5SnNvbkZpbGUpIHtcbiAgICAgIEFzc2V0RXJyb3IubG9nKCdObyByZWdpc3RyeSBwcm9maWxlIHNlbGVjdGVkJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5idWlsZFByb2ZpbGUocmVnaXN0cnlKc29uRmlsZSwgYXNzZXRKc29uRmlsZSwgYXNzZXRzKTtcbiAgICB0aGlzLmFzc2V0cyA9IGFzc2V0cztcblxuICAgIC8vIENoYW5nZSB0aGUgc2VsZWN0ZWQgcHJvZmlsZSB0byB0aGUgb25lIGp1c3QgbG9hZGVkLiAgRG8gbm90IGRvIHRoaXMgb24gaW5pdGlhbCBwYWdlIGxvYWRcbiAgICAvLyBiZWNhdXNlIHRoZSBzZWxlY3RlZCBmaWxlcyBwZXJzaXN0cyBpbiBmaXJlZm94IGFjcm9zcyByZWZyZXNoZXMsIGJ1dCB0aGUgdXNlciBtYXkgaGF2ZVxuICAgIC8vIHNlbGVjdGVkIGEgZGlmZmVyZW50IGl0ZW0gZnJvbSB0aGUgZHJvcGRvd25cbiAgICBpZiAoIWR1cmluZ1BhZ2VMb2FkKSB7XG4gICAgICB3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oJ3Byb2ZpbGVJZCcsIHRoaXMucHJvZmlsZUlkKTtcbiAgICB9XG5cbiAgICAvLyBOb3RpZnkgdGhhdCB0aGUgbG9jYWwgcHJvZmlsZSBpcyByZWFkeSBmb3IgdXNlXG4gICAgY29uc3QgY2hhbmdlRXZlbnQgPSBuZXcgRXZlbnQoJ2xvY2FscHJvZmlsZWNoYW5nZScpO1xuICAgIHRoaXMuZGlzcGF0Y2hFdmVudChjaGFuZ2VFdmVudCk7XG4gIH1cblxuICAvKipcbiAgICogQnVpbGQgYSBtZXJnZWQgcHJvZmlsZSBmaWxlIGZyb20gdGhlIHJlZ2lzdHJ5IHByb2ZpbGUgYW5kIGFzc2V0IG92ZXJyaWRlc1xuICAgKiBAcGFyYW0geyp9IHJlZ2lzdHJ5SnNvbkZpbGVcbiAgICogQHBhcmFtIHsqfSBhc3NldEpzb25GaWxlXG4gICAqL1xuICBhc3luYyBidWlsZFByb2ZpbGUocmVnaXN0cnlKc29uRmlsZSwgYXNzZXRKc29uRmlsZSkge1xuICAgIC8vIExvYWQgdGhlIHJlZ2lzdHJ5IEpTT04gYW5kIHZhbGlkYXRlIGl0IGFnYWluc3QgdGhlIHNjaGVtYVxuICAgIGNvbnN0IHJlZ2lzdHJ5SnNvbiA9IGF3YWl0IExvY2FsUHJvZmlsZS5sb2FkTG9jYWxKc29uKHJlZ2lzdHJ5SnNvbkZpbGUpO1xuICAgIGNvbnN0IGlzUmVnaXN0cnlKc29uVmFsaWQgPSB0aGlzLnJlZ2lzdHJ5U2NoZW1hVmFsaWRhdG9yKHJlZ2lzdHJ5SnNvbik7XG4gICAgaWYgKCFpc1JlZ2lzdHJ5SnNvblZhbGlkKSB7XG4gICAgICB0aHJvdyBuZXcgQXNzZXRFcnJvcihKU09OLnN0cmluZ2lmeSh0aGlzLnJlZ2lzdHJ5U2NoZW1hVmFsaWRhdG9yLmVycm9ycywgbnVsbCwgMikpO1xuICAgIH1cblxuICAgIC8vIExvYWQgdGhlIGFzc2V0IEpTT04gYW5kIHZhbGlkYXRlIGl0IGFnYWluc3QgdGhlIHNjaGVtYS5cbiAgICAvLyBJZiBubyBhc3NldCBKU09OIHByZXNlbnQsIHVzZSB0aGUgZGVmYXVsdCBkZWZpbml0b25cbiAgICBsZXQgYXNzZXRKc29uO1xuICAgIGlmICghYXNzZXRKc29uRmlsZSkge1xuICAgICAgYXNzZXRKc29uID0geyBwcm9maWxlSWQ6IHJlZ2lzdHJ5SnNvbi5wcm9maWxlSWQsIG92ZXJyaWRlczoge30gfTtcbiAgICB9IGVsc2Uge1xuICAgICAgYXNzZXRKc29uID0gYXdhaXQgTG9jYWxQcm9maWxlLmxvYWRMb2NhbEpzb24oYXNzZXRKc29uRmlsZSk7XG4gICAgICBjb25zdCBpc0Fzc2V0SnNvblZhbGlkID0gdGhpcy5hc3NldFNjaGVtYVZhbGlkYXRvcihhc3NldEpzb24pO1xuICAgICAgaWYgKCFpc0Fzc2V0SnNvblZhbGlkKSB7XG4gICAgICAgIHRocm93IG5ldyBBc3NldEVycm9yKEpTT04uc3RyaW5naWZ5KHRoaXMuYXNzZXRTY2hlbWFWYWxpZGF0b3IuZXJyb3JzLCBudWxsLCAyKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgbm9uLXNjaGVtYSByZXF1aXJlbWVudHMgYW5kIGJ1aWxkIGEgY29tYmluZWQgcHJvZmlsZVxuICAgIHZhbGlkYXRlUmVnaXN0cnlQcm9maWxlKHJlZ2lzdHJ5SnNvbik7XG4gICAgY29uc3QgZXhwYW5kZWRSZWdpc3RyeVByb2ZpbGUgPSBleHBhbmRSZWdpc3RyeVByb2ZpbGUocmVnaXN0cnlKc29uKTtcbiAgICB0aGlzLnByb2ZpbGUgPSBidWlsZEFzc2V0UHJvZmlsZShhc3NldEpzb24sIGV4cGFuZGVkUmVnaXN0cnlQcm9maWxlKTtcbiAgICB0aGlzLnByb2ZpbGVJZCA9IHRoaXMucHJvZmlsZS5wcm9maWxlSWQ7XG4gIH1cblxuICAvKipcbiAgICogSGVscGVyIHRvIGxvYWQgSlNPTiBmcm9tIGEgbG9jYWwgZmlsZVxuICAgKiBAcGFyYW0ge0ZpbGV9IGpzb25GaWxlXG4gICAqL1xuICBzdGF0aWMgbG9hZExvY2FsSnNvbihqc29uRmlsZSkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBjb25zdCByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuXG4gICAgICByZWFkZXIub25sb2FkID0gKCkgPT4ge1xuICAgICAgICBjb25zdCBqc29uID0gSlNPTi5wYXJzZShyZWFkZXIucmVzdWx0KTtcbiAgICAgICAgcmVzb2x2ZShqc29uKTtcbiAgICAgIH07XG5cbiAgICAgIHJlYWRlci5vbmVycm9yID0gKCkgPT4ge1xuICAgICAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSBgVW5hYmxlIHRvIGxvYWQgSlNPTiBmcm9tICR7anNvbkZpbGUubmFtZX1gO1xuICAgICAgICBBc3NldEVycm9yLmxvZyhlcnJvck1lc3NhZ2UpO1xuICAgICAgICByZWplY3QoZXJyb3JNZXNzYWdlKTtcbiAgICAgIH07XG5cbiAgICAgIHJlYWRlci5yZWFkQXNUZXh0KGpzb25GaWxlKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBIZWxwZXIgdG8gbG9hZCB0aGUgY29tYmluZWQgc2NoZW1hIGZpbGUgYW5kIGNvbXBpbGUgYW4gQUpWIHZhbGlkYXRvclxuICAgKiBAcGFyYW0ge3N0cmluZ30gc2NoZW1hc1BhdGhcbiAgICovXG4gIHN0YXRpYyBhc3luYyBidWlsZFNjaGVtYVZhbGlkYXRvcihzY2hlbWFzUGF0aCkge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goc2NoZW1hc1BhdGgpO1xuICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgIHRocm93IG5ldyBBc3NldEVycm9yKHJlc3BvbnNlLnN0YXR1c1RleHQpO1xuICAgIH1cblxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby11bmRlZlxuICAgIGNvbnN0IGFqdiA9IG5ldyBBanYoKTtcbiAgICBjb25zdCBzY2hlbWFzID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgIHNjaGVtYXMuZGVwZW5kZW5jaWVzLmZvckVhY2goKHNjaGVtYSkgPT4ge1xuICAgICAgYWp2LmFkZFNjaGVtYShzY2hlbWEpO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIGFqdi5jb21waWxlKHNjaGVtYXMubWFpblNjaGVtYSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTG9jYWxQcm9maWxlO1xuIiwiLyogZXNsaW50LWRpc2FibGUgaW1wb3J0L25vLXVucmVzb2x2ZWQgKi9cbmltcG9ydCB7IGZldGNoUHJvZmlsZSwgZmV0Y2hQcm9maWxlc0xpc3QsIE1vdGlvbkNvbnRyb2xsZXIgfSBmcm9tICcuL21vdGlvbi1jb250cm9sbGVycy5tb2R1bGUuanMnO1xuLyogZXNsaW50LWVuYWJsZSAqL1xuXG5pbXBvcnQgQXNzZXRFcnJvciBmcm9tICcuL2Fzc2V0RXJyb3IuanMnO1xuaW1wb3J0IExvY2FsUHJvZmlsZSBmcm9tICcuL2xvY2FsUHJvZmlsZS5qcyc7XG5cbmNvbnN0IHByb2ZpbGVzQmFzZVBhdGggPSAnLi9wcm9maWxlcyc7XG5cbi8qKlxuICogTG9hZHMgcHJvZmlsZXMgZnJvbSB0aGUgZGlzdHJpYnV0aW9uIGZvbGRlciBuZXh0IHRvIHRoZSB2aWV3ZXIncyBsb2NhdGlvblxuICovXG5jbGFzcyBQcm9maWxlU2VsZWN0b3IgZXh0ZW5kcyBFdmVudFRhcmdldCB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKCk7XG5cbiAgICAvLyBHZXQgdGhlIHByb2ZpbGUgaWQgc2VsZWN0b3IgYW5kIGxpc3RlbiBmb3IgY2hhbmdlc1xuICAgIHRoaXMucHJvZmlsZUlkU2VsZWN0b3JFbGVtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Byb2ZpbGVJZFNlbGVjdG9yJyk7XG4gICAgdGhpcy5wcm9maWxlSWRTZWxlY3RvckVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKCkgPT4geyB0aGlzLm9uUHJvZmlsZUlkQ2hhbmdlKCk7IH0pO1xuXG4gICAgLy8gR2V0IHRoZSBoYW5kZWRuZXNzIHNlbGVjdG9yIGFuZCBsaXN0ZW4gZm9yIGNoYW5nZXNcbiAgICB0aGlzLmhhbmRlZG5lc3NTZWxlY3RvckVsZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaGFuZGVkbmVzc1NlbGVjdG9yJyk7XG4gICAgdGhpcy5oYW5kZWRuZXNzU2VsZWN0b3JFbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsICgpID0+IHsgdGhpcy5vbkhhbmRlZG5lc3NDaGFuZ2UoKTsgfSk7XG5cbiAgICB0aGlzLmZvcmNlVlJQcm9maWxlRWxlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmb3JjZVZSUHJvZmlsZScpO1xuICAgIHRoaXMuc2hvd1RhcmdldFJheUVsZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2hvd1RhcmdldFJheScpO1xuXG4gICAgdGhpcy5sb2NhbFByb2ZpbGUgPSBuZXcgTG9jYWxQcm9maWxlKCk7XG4gICAgdGhpcy5sb2NhbFByb2ZpbGUuYWRkRXZlbnRMaXN0ZW5lcignbG9jYWxwcm9maWxlY2hhbmdlJywgKGV2ZW50KSA9PiB7IHRoaXMub25Mb2NhbFByb2ZpbGVDaGFuZ2UoZXZlbnQpOyB9KTtcblxuICAgIHRoaXMucHJvZmlsZXNMaXN0ID0gbnVsbDtcbiAgICB0aGlzLnBvcHVsYXRlUHJvZmlsZVNlbGVjdG9yKCk7XG4gIH1cblxuICAvKipcbiAgICogUmVzZXRzIGFsbCBzZWxlY3RlZCBwcm9maWxlIHN0YXRlXG4gICAqL1xuICBjbGVhclNlbGVjdGVkUHJvZmlsZSgpIHtcbiAgICBBc3NldEVycm9yLmNsZWFyQWxsKCk7XG4gICAgdGhpcy5wcm9maWxlID0gbnVsbDtcbiAgICB0aGlzLmhhbmRlZG5lc3MgPSBudWxsO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHJpZXZlcyB0aGUgZnVsbCBsaXN0IG9mIGF2YWlsYWJsZSBwcm9maWxlcyBhbmQgcG9wdWxhdGVzIHRoZSBkcm9wZG93blxuICAgKi9cbiAgYXN5bmMgcG9wdWxhdGVQcm9maWxlU2VsZWN0b3IoKSB7XG4gICAgdGhpcy5jbGVhclNlbGVjdGVkUHJvZmlsZSgpO1xuICAgIHRoaXMuaGFuZGVkbmVzc1NlbGVjdG9yRWxlbWVudC5pbm5lckhUTUwgPSAnJztcblxuICAgIC8vIExvYWQgYW5kIGNsZWFyIGxvY2FsIHN0b3JhZ2VcbiAgICBjb25zdCBzdG9yZWRQcm9maWxlSWQgPSB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oJ3Byb2ZpbGVJZCcpO1xuICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbSgncHJvZmlsZUlkJyk7XG5cbiAgICAvLyBMb2FkIHRoZSBsaXN0IG9mIHByb2ZpbGVzXG4gICAgaWYgKCF0aGlzLnByb2ZpbGVzTGlzdCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgdGhpcy5wcm9maWxlSWRTZWxlY3RvckVsZW1lbnQuaW5uZXJIVE1MID0gJzxvcHRpb24gdmFsdWU9XCJsb2FkaW5nXCI+TG9hZGluZy4uLjwvb3B0aW9uPic7XG4gICAgICAgIHRoaXMucHJvZmlsZXNMaXN0ID0gYXdhaXQgZmV0Y2hQcm9maWxlc0xpc3QocHJvZmlsZXNCYXNlUGF0aCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICB0aGlzLnByb2ZpbGVJZFNlbGVjdG9yRWxlbWVudC5pbm5lckhUTUwgPSAnRmFpbGVkIHRvIGxvYWQgbGlzdCc7XG4gICAgICAgIEFzc2V0RXJyb3IubG9nKGVycm9yLm1lc3NhZ2UpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBBZGQgZWFjaCBwcm9maWxlIHRvIHRoZSBkcm9wZG93blxuICAgIHRoaXMucHJvZmlsZUlkU2VsZWN0b3JFbGVtZW50LmlubmVySFRNTCA9ICcnO1xuICAgIE9iamVjdC5rZXlzKHRoaXMucHJvZmlsZXNMaXN0KS5mb3JFYWNoKChwcm9maWxlSWQpID0+IHtcbiAgICAgIGNvbnN0IHByb2ZpbGUgPSB0aGlzLnByb2ZpbGVzTGlzdFtwcm9maWxlSWRdO1xuICAgICAgaWYgKCFwcm9maWxlLmRlcHJlY2F0ZWQpIHtcbiAgICAgICAgdGhpcy5wcm9maWxlSWRTZWxlY3RvckVsZW1lbnQuaW5uZXJIVE1MICs9IGBcbiAgICAgICAgPG9wdGlvbiB2YWx1ZT0nJHtwcm9maWxlSWR9Jz4ke3Byb2ZpbGVJZH08L29wdGlvbj5cbiAgICAgICAgYDtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEFkZCB0aGUgbG9jYWwgcHJvZmlsZSBpZiBpdCBpc24ndCBhbHJlYWR5IGluY2x1ZGVkXG4gICAgaWYgKHRoaXMubG9jYWxQcm9maWxlLnByb2ZpbGVJZFxuICAgICAmJiAhT2JqZWN0LmtleXModGhpcy5wcm9maWxlc0xpc3QpLmluY2x1ZGVzKHRoaXMubG9jYWxQcm9maWxlLnByb2ZpbGVJZCkpIHtcbiAgICAgIHRoaXMucHJvZmlsZUlkU2VsZWN0b3JFbGVtZW50LmlubmVySFRNTCArPSBgXG4gICAgICA8b3B0aW9uIHZhbHVlPScke3RoaXMubG9jYWxQcm9maWxlLnByb2ZpbGVJZH0nPiR7dGhpcy5sb2NhbFByb2ZpbGUucHJvZmlsZUlkfTwvb3B0aW9uPlxuICAgICAgYDtcbiAgICAgIHRoaXMucHJvZmlsZXNMaXN0W3RoaXMubG9jYWxQcm9maWxlLnByb2ZpbGVJZF0gPSB0aGlzLmxvY2FsUHJvZmlsZTtcbiAgICB9XG5cbiAgICAvLyBPdmVycmlkZSB0aGUgZGVmYXVsdCBzZWxlY3Rpb24gaWYgdmFsdWVzIHdlcmUgcHJlc2VudCBpbiBsb2NhbCBzdG9yYWdlXG4gICAgaWYgKHN0b3JlZFByb2ZpbGVJZCkge1xuICAgICAgdGhpcy5wcm9maWxlSWRTZWxlY3RvckVsZW1lbnQudmFsdWUgPSBzdG9yZWRQcm9maWxlSWQ7XG4gICAgfVxuXG4gICAgLy8gTWFudWFsbHkgdHJpZ2dlciBzZWxlY3RlZCBwcm9maWxlIHRvIGxvYWRcbiAgICB0aGlzLm9uUHJvZmlsZUlkQ2hhbmdlKCk7XG4gIH1cblxuICAvKipcbiAgICogSGFuZGxlciBmb3IgdGhlIHByb2ZpbGUgaWQgc2VsZWN0aW9uIGNoYW5nZVxuICAgKi9cbiAgb25Qcm9maWxlSWRDaGFuZ2UoKSB7XG4gICAgdGhpcy5jbGVhclNlbGVjdGVkUHJvZmlsZSgpO1xuICAgIHRoaXMuaGFuZGVkbmVzc1NlbGVjdG9yRWxlbWVudC5pbm5lckhUTUwgPSAnJztcblxuICAgIGNvbnN0IHByb2ZpbGVJZCA9IHRoaXMucHJvZmlsZUlkU2VsZWN0b3JFbGVtZW50LnZhbHVlO1xuICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbSgncHJvZmlsZUlkJywgcHJvZmlsZUlkKTtcblxuICAgIGlmIChwcm9maWxlSWQgPT09IHRoaXMubG9jYWxQcm9maWxlLnByb2ZpbGVJZCkge1xuICAgICAgdGhpcy5wcm9maWxlID0gdGhpcy5sb2NhbFByb2ZpbGUucHJvZmlsZTtcbiAgICAgIHRoaXMucG9wdWxhdGVIYW5kZWRuZXNzU2VsZWN0b3IoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQXR0ZW1wdCB0byBsb2FkIHRoZSBwcm9maWxlXG4gICAgICB0aGlzLnByb2ZpbGVJZFNlbGVjdG9yRWxlbWVudC5kaXNhYmxlZCA9IHRydWU7XG4gICAgICB0aGlzLmhhbmRlZG5lc3NTZWxlY3RvckVsZW1lbnQuZGlzYWJsZWQgPSB0cnVlO1xuICAgICAgZmV0Y2hQcm9maWxlKHsgcHJvZmlsZXM6IFtwcm9maWxlSWRdLCBoYW5kZWRuZXNzOiAnYW55JyB9LCBwcm9maWxlc0Jhc2VQYXRoLCBudWxsLCBmYWxzZSkudGhlbigoeyBwcm9maWxlIH0pID0+IHtcbiAgICAgICAgdGhpcy5wcm9maWxlID0gcHJvZmlsZTtcbiAgICAgICAgdGhpcy5wb3B1bGF0ZUhhbmRlZG5lc3NTZWxlY3RvcigpO1xuICAgICAgfSlcbiAgICAgICAgLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgICAgIEFzc2V0RXJyb3IubG9nKGVycm9yLm1lc3NhZ2UpO1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KVxuICAgICAgICAuZmluYWxseSgoKSA9PiB7XG4gICAgICAgICAgdGhpcy5wcm9maWxlSWRTZWxlY3RvckVsZW1lbnQuZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgICB0aGlzLmhhbmRlZG5lc3NTZWxlY3RvckVsZW1lbnQuZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFBvcHVsYXRlcyB0aGUgaGFuZGVkbmVzcyBkcm9wZG93biB3aXRoIHRob3NlIHN1cHBvcnRlZCBieSB0aGUgc2VsZWN0ZWQgcHJvZmlsZVxuICAgKi9cbiAgcG9wdWxhdGVIYW5kZWRuZXNzU2VsZWN0b3IoKSB7XG4gICAgLy8gTG9hZCBhbmQgY2xlYXIgdGhlIGxhc3Qgc2VsZWN0aW9uIGZvciB0aGlzIHByb2ZpbGUgaWRcbiAgICBjb25zdCBzdG9yZWRIYW5kZWRuZXNzID0gd2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKCdoYW5kZWRuZXNzJyk7XG4gICAgd2luZG93LmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKCdoYW5kZWRuZXNzJyk7XG5cbiAgICAvLyBQb3B1bGF0ZSBoYW5kZWRuZXNzIHNlbGVjdG9yXG4gICAgT2JqZWN0LmtleXModGhpcy5wcm9maWxlLmxheW91dHMpLmZvckVhY2goKGhhbmRlZG5lc3MpID0+IHtcbiAgICAgIHRoaXMuaGFuZGVkbmVzc1NlbGVjdG9yRWxlbWVudC5pbm5lckhUTUwgKz0gYFxuICAgICAgICA8b3B0aW9uIHZhbHVlPScke2hhbmRlZG5lc3N9Jz4ke2hhbmRlZG5lc3N9PC9vcHRpb24+XG4gICAgICBgO1xuICAgIH0pO1xuXG4gICAgLy8gQXBwbHkgc3RvcmVkIGhhbmRlZG5lc3MgaWYgZm91bmRcbiAgICBpZiAoc3RvcmVkSGFuZGVkbmVzcyAmJiB0aGlzLnByb2ZpbGUubGF5b3V0c1tzdG9yZWRIYW5kZWRuZXNzXSkge1xuICAgICAgdGhpcy5oYW5kZWRuZXNzU2VsZWN0b3JFbGVtZW50LnZhbHVlID0gc3RvcmVkSGFuZGVkbmVzcztcbiAgICB9XG5cbiAgICAvLyBNYW51YWxseSB0cmlnZ2VyIHNlbGVjdGVkIGhhbmRlZG5lc3MgY2hhbmdlXG4gICAgdGhpcy5vbkhhbmRlZG5lc3NDaGFuZ2UoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXNwb25kcyB0byBjaGFuZ2VzIGluIHNlbGVjdGVkIGhhbmRlZG5lc3MuXG4gICAqIENyZWF0ZXMgYSBuZXcgbW90aW9uIGNvbnRyb2xsZXIgZm9yIHRoZSBjb21iaW5hdGlvbiBvZiBwcm9maWxlIGFuZCBoYW5kZWRuZXNzLCBhbmQgZmlyZXMgYW5cbiAgICogZXZlbnQgdG8gc2lnbmFsIHRoZSBjaGFuZ2VcbiAgICovXG4gIG9uSGFuZGVkbmVzc0NoYW5nZSgpIHtcbiAgICBBc3NldEVycm9yLmNsZWFyQWxsKCk7XG4gICAgdGhpcy5oYW5kZWRuZXNzID0gdGhpcy5oYW5kZWRuZXNzU2VsZWN0b3JFbGVtZW50LnZhbHVlO1xuICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnaGFuZGVkbmVzcycsIHRoaXMuaGFuZGVkbmVzcyk7XG4gICAgaWYgKHRoaXMuaGFuZGVkbmVzcykge1xuICAgICAgdGhpcy5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnc2VsZWN0aW9uY2hhbmdlJykpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdzZWxlY3Rpb25jbGVhcicpKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlcyB0aGUgcHJvZmlsZXMgZHJvcGRvd24gdG8gZW5zdXJlIGxvY2FsIHByb2ZpbGUgaXMgaW4gdGhlIGxpc3RcbiAgICovXG4gIG9uTG9jYWxQcm9maWxlQ2hhbmdlKCkge1xuICAgIHRoaXMucG9wdWxhdGVQcm9maWxlU2VsZWN0b3IoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBJbmRpY2F0ZXMgaWYgdGhlIGN1cnJlbnRseSBzZWxlY3RlZCBwcm9maWxlIHNob3VsZCBiZSBzaG93biBpbiBWUiBpbnN0ZWFkXG4gICAqIG9mIHRoZSBwcm9maWxlcyBhZHZlcnRpc2VkIGJ5IHRoZSByZWFsIFhSSW5wdXRTb3VyY2UuXG4gICAqL1xuICBnZXQgZm9yY2VWUlByb2ZpbGUoKSB7XG4gICAgcmV0dXJuIHRoaXMuZm9yY2VWUlByb2ZpbGVFbGVtZW50LmNoZWNrZWQ7XG4gIH1cblxuICAvKipcbiAgICogSW5kaWNhdGVzIGlmIHRoZSB0YXJnZXRSYXlTcGFjZSBmb3IgYW4gaW5wdXQgc291cmNlIHNob3VsZCBiZSB2aXN1YWxpemVkIGluXG4gICAqIFZSLlxuICAgKi9cbiAgZ2V0IHNob3dUYXJnZXRSYXkoKSB7XG4gICAgcmV0dXJuIHRoaXMuc2hvd1RhcmdldFJheUVsZW1lbnQuY2hlY2tlZDtcbiAgfVxuXG4gIC8qKlxuICAgKiBCdWlsZHMgYSBNb3Rpb25Db250cm9sbGVyIGVpdGhlciBiYXNlZCBvbiB0aGUgc3VwcGxpZWQgaW5wdXQgc291cmNlIHVzaW5nIHRoZSBsb2NhbCBwcm9maWxlXG4gICAqIGlmIGl0IGlzIHRoZSBiZXN0IG1hdGNoLCBvdGhlcndpc2UgdXNlcyB0aGUgcmVtb3RlIGFzc2V0c1xuICAgKiBAcGFyYW0ge1hSSW5wdXRTb3VyY2V9IHhySW5wdXRTb3VyY2VcbiAgICovXG4gIGFzeW5jIGNyZWF0ZU1vdGlvbkNvbnRyb2xsZXIoeHJJbnB1dFNvdXJjZSkge1xuICAgIGxldCBwcm9maWxlO1xuICAgIGxldCBhc3NldFBhdGg7XG5cbiAgICAvLyBDaGVjayBpZiBsb2NhbCBvdmVycmlkZSBzaG91bGQgYmUgdXNlZFxuICAgIGxldCB1c2VMb2NhbFByb2ZpbGUgPSBmYWxzZTtcbiAgICBpZiAodGhpcy5sb2NhbFByb2ZpbGUucHJvZmlsZUlkKSB7XG4gICAgICB4cklucHV0U291cmNlLnByb2ZpbGVzLnNvbWUoKHByb2ZpbGVJZCkgPT4ge1xuICAgICAgICBjb25zdCBtYXRjaEZvdW5kID0gT2JqZWN0LmtleXModGhpcy5wcm9maWxlc0xpc3QpLmluY2x1ZGVzKHByb2ZpbGVJZCk7XG4gICAgICAgIHVzZUxvY2FsUHJvZmlsZSA9IG1hdGNoRm91bmQgJiYgKHByb2ZpbGVJZCA9PT0gdGhpcy5sb2NhbFByb2ZpbGUucHJvZmlsZUlkKTtcbiAgICAgICAgcmV0dXJuIG1hdGNoRm91bmQ7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBHZXQgcHJvZmlsZSBhbmQgYXNzZXQgcGF0aFxuICAgIGlmICh1c2VMb2NhbFByb2ZpbGUpIHtcbiAgICAgICh7IHByb2ZpbGUgfSA9IHRoaXMubG9jYWxQcm9maWxlKTtcbiAgICAgIGNvbnN0IGFzc2V0TmFtZSA9IHRoaXMubG9jYWxQcm9maWxlLnByb2ZpbGUubGF5b3V0c1t4cklucHV0U291cmNlLmhhbmRlZG5lc3NdLmFzc2V0UGF0aDtcbiAgICAgIGFzc2V0UGF0aCA9IHRoaXMubG9jYWxQcm9maWxlLmFzc2V0c1thc3NldE5hbWVdIHx8IGFzc2V0TmFtZTtcbiAgICB9IGVsc2Uge1xuICAgICAgKHsgcHJvZmlsZSwgYXNzZXRQYXRoIH0gPSBhd2FpdCBmZXRjaFByb2ZpbGUoeHJJbnB1dFNvdXJjZSwgcHJvZmlsZXNCYXNlUGF0aCkpO1xuICAgIH1cblxuICAgIC8vIEJ1aWxkIG1vdGlvbiBjb250cm9sbGVyXG4gICAgY29uc3QgbW90aW9uQ29udHJvbGxlciA9IG5ldyBNb3Rpb25Db250cm9sbGVyKFxuICAgICAgeHJJbnB1dFNvdXJjZSxcbiAgICAgIHByb2ZpbGUsXG4gICAgICBhc3NldFBhdGhcbiAgICApO1xuXG4gICAgcmV0dXJuIG1vdGlvbkNvbnRyb2xsZXI7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgUHJvZmlsZVNlbGVjdG9yO1xuIiwiY29uc3QgZGVmYXVsdEJhY2tncm91bmQgPSAnZ2VvcmdlbnRvcic7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEJhY2tncm91bmRTZWxlY3RvciBleHRlbmRzIEV2ZW50VGFyZ2V0IHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoKTtcblxuICAgIHRoaXMuYmFja2dyb3VuZFNlbGVjdG9yRWxlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdiYWNrZ3JvdW5kU2VsZWN0b3InKTtcbiAgICB0aGlzLmJhY2tncm91bmRTZWxlY3RvckVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKCkgPT4geyB0aGlzLm9uQmFja2dyb3VuZENoYW5nZSgpOyB9KTtcblxuICAgIHRoaXMuc2VsZWN0ZWRCYWNrZ3JvdW5kID0gd2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKCdiYWNrZ3JvdW5kJykgfHwgZGVmYXVsdEJhY2tncm91bmQ7XG4gICAgdGhpcy5iYWNrZ3JvdW5kTGlzdCA9IHt9O1xuICAgIGZldGNoKCdiYWNrZ3JvdW5kcy9iYWNrZ3JvdW5kcy5qc29uJylcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHJlc3BvbnNlLmpzb24oKSlcbiAgICAgIC50aGVuKChiYWNrZ3JvdW5kcykgPT4ge1xuICAgICAgICB0aGlzLmJhY2tncm91bmRMaXN0ID0gYmFja2dyb3VuZHM7XG4gICAgICAgIE9iamVjdC5rZXlzKGJhY2tncm91bmRzKS5mb3JFYWNoKChiYWNrZ3JvdW5kKSA9PiB7XG4gICAgICAgICAgY29uc3Qgb3B0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnb3B0aW9uJyk7XG4gICAgICAgICAgb3B0aW9uLnZhbHVlID0gYmFja2dyb3VuZDtcbiAgICAgICAgICBvcHRpb24uaW5uZXJUZXh0ID0gYmFja2dyb3VuZDtcbiAgICAgICAgICBpZiAodGhpcy5zZWxlY3RlZEJhY2tncm91bmQgPT09IGJhY2tncm91bmQpIHtcbiAgICAgICAgICAgIG9wdGlvbi5zZWxlY3RlZCA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRoaXMuYmFja2dyb3VuZFNlbGVjdG9yRWxlbWVudC5hcHBlbmRDaGlsZChvcHRpb24pO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnc2VsZWN0aW9uY2hhbmdlJykpO1xuICAgICAgfSk7XG4gIH1cblxuICBvbkJhY2tncm91bmRDaGFuZ2UoKSB7XG4gICAgdGhpcy5zZWxlY3RlZEJhY2tncm91bmQgPSB0aGlzLmJhY2tncm91bmRTZWxlY3RvckVsZW1lbnQudmFsdWU7XG4gICAgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKCdiYWNrZ3JvdW5kJywgdGhpcy5zZWxlY3RlZEJhY2tncm91bmQpO1xuICAgIHRoaXMuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ3NlbGVjdGlvbmNoYW5nZScpKTtcbiAgfVxuXG4gIGdldCBiYWNrZ3JvdW5kUGF0aCgpIHtcbiAgICByZXR1cm4gdGhpcy5iYWNrZ3JvdW5kTGlzdFt0aGlzLnNlbGVjdGVkQmFja2dyb3VuZF07XG4gIH1cbn1cbiIsIi8qIGVzbGludC1kaXNhYmxlIGltcG9ydC9uby11bnJlc29sdmVkICovXG5pbXBvcnQgeyBDb25zdGFudHMgfSBmcm9tICcuLi9tb3Rpb24tY29udHJvbGxlcnMubW9kdWxlLmpzJztcbi8qIGVzbGludC1lbmFibGUgKi9cblxuLyoqXG4gKiBBIGZhbHNlIGdhbWVwYWQgdG8gYmUgdXNlZCBpbiB0ZXN0c1xuICovXG5jbGFzcyBNb2NrR2FtZXBhZCB7XG4gIC8qKlxuICAgKiBAcGFyYW0ge09iamVjdH0gcHJvZmlsZURlc2NyaXB0aW9uIC0gVGhlIHByb2ZpbGUgZGVzY3JpcHRpb24gdG8gcGFyc2UgdG8gZGV0ZXJtaW5lIHRoZSBsZW5ndGhcbiAgICogb2YgdGhlIGJ1dHRvbiBhbmQgYXhlcyBhcnJheXNcbiAgICogQHBhcmFtIHtzdHJpbmd9IGhhbmRlZG5lc3MgLSBUaGUgZ2FtZXBhZCdzIGhhbmRlZG5lc3NcbiAgICovXG4gIGNvbnN0cnVjdG9yKHByb2ZpbGVEZXNjcmlwdGlvbiwgaGFuZGVkbmVzcykge1xuICAgIGlmICghcHJvZmlsZURlc2NyaXB0aW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHByb2ZpbGVEZXNjcmlwdGlvbiBzdXBwbGllZCcpO1xuICAgIH1cblxuICAgIGlmICghaGFuZGVkbmVzcykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBoYW5kZWRuZXNzIHN1cHBsaWVkJyk7XG4gICAgfVxuXG4gICAgdGhpcy5pZCA9IHByb2ZpbGVEZXNjcmlwdGlvbi5wcm9maWxlSWQ7XG5cbiAgICAvLyBMb29wIHRocm91Z2ggdGhlIHByb2ZpbGUgZGVzY3JpcHRpb24gdG8gZGV0ZXJtaW5lIGhvdyBtYW55IGVsZW1lbnRzIHRvIHB1dCBpbiB0aGUgYnV0dG9uc1xuICAgIC8vIGFuZCBheGVzIGFycmF5c1xuICAgIGxldCBtYXhCdXR0b25JbmRleCA9IDA7XG4gICAgbGV0IG1heEF4aXNJbmRleCA9IDA7XG4gICAgY29uc3QgbGF5b3V0ID0gcHJvZmlsZURlc2NyaXB0aW9uLmxheW91dHNbaGFuZGVkbmVzc107XG4gICAgdGhpcy5tYXBwaW5nID0gbGF5b3V0Lm1hcHBpbmc7XG4gICAgT2JqZWN0LnZhbHVlcyhsYXlvdXQuY29tcG9uZW50cykuZm9yRWFjaCgoeyBnYW1lcGFkSW5kaWNlcyB9KSA9PiB7XG4gICAgICBjb25zdCB7XG4gICAgICAgIFtDb25zdGFudHMuQ29tcG9uZW50UHJvcGVydHkuQlVUVE9OXTogYnV0dG9uSW5kZXgsXG4gICAgICAgIFtDb25zdGFudHMuQ29tcG9uZW50UHJvcGVydHkuWF9BWElTXTogeEF4aXNJbmRleCxcbiAgICAgICAgW0NvbnN0YW50cy5Db21wb25lbnRQcm9wZXJ0eS5ZX0FYSVNdOiB5QXhpc0luZGV4XG4gICAgICB9ID0gZ2FtZXBhZEluZGljZXM7XG5cbiAgICAgIGlmIChidXR0b25JbmRleCAhPT0gdW5kZWZpbmVkICYmIGJ1dHRvbkluZGV4ID4gbWF4QnV0dG9uSW5kZXgpIHtcbiAgICAgICAgbWF4QnV0dG9uSW5kZXggPSBidXR0b25JbmRleDtcbiAgICAgIH1cblxuICAgICAgaWYgKHhBeGlzSW5kZXggIT09IHVuZGVmaW5lZCAmJiAoeEF4aXNJbmRleCA+IG1heEF4aXNJbmRleCkpIHtcbiAgICAgICAgbWF4QXhpc0luZGV4ID0geEF4aXNJbmRleDtcbiAgICAgIH1cblxuICAgICAgaWYgKHlBeGlzSW5kZXggIT09IHVuZGVmaW5lZCAmJiAoeUF4aXNJbmRleCA+IG1heEF4aXNJbmRleCkpIHtcbiAgICAgICAgbWF4QXhpc0luZGV4ID0geUF4aXNJbmRleDtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEZpbGwgdGhlIGF4ZXMgYXJyYXlcbiAgICB0aGlzLmF4ZXMgPSBbXTtcbiAgICB3aGlsZSAodGhpcy5heGVzLmxlbmd0aCA8PSBtYXhBeGlzSW5kZXgpIHtcbiAgICAgIHRoaXMuYXhlcy5wdXNoKDApO1xuICAgIH1cblxuICAgIC8vIEZpbGwgdGhlIGJ1dHRvbnMgYXJyYXlcbiAgICB0aGlzLmJ1dHRvbnMgPSBbXTtcbiAgICB3aGlsZSAodGhpcy5idXR0b25zLmxlbmd0aCA8PSBtYXhCdXR0b25JbmRleCkge1xuICAgICAgdGhpcy5idXR0b25zLnB1c2goe1xuICAgICAgICB2YWx1ZTogMCxcbiAgICAgICAgdG91Y2hlZDogZmFsc2UsXG4gICAgICAgIHByZXNzZWQ6IGZhbHNlXG4gICAgICB9KTtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTW9ja0dhbWVwYWQ7XG4iLCIvKipcbiAqIEEgZmFrZSBYUklucHV0U291cmNlIHRoYXQgY2FuIGJlIHVzZWQgdG8gaW5pdGlhbGl6ZSBhIE1vdGlvbkNvbnRyb2xsZXJcbiAqL1xuY2xhc3MgTW9ja1hSSW5wdXRTb3VyY2Uge1xuICAvKipcbiAgICogQHBhcmFtIHtPYmplY3R9IGdhbWVwYWQgLSBUaGUgR2FtZXBhZCBvYmplY3QgdGhhdCBwcm92aWRlcyB0aGUgYnV0dG9uIGFuZCBheGlzIGRhdGFcbiAgICogQHBhcmFtIHtzdHJpbmd9IGhhbmRlZG5lc3MgLSBUaGUgaGFuZGVkbmVzcyB0byByZXBvcnRcbiAgICovXG4gIGNvbnN0cnVjdG9yKHByb2ZpbGVzLCBnYW1lcGFkLCBoYW5kZWRuZXNzKSB7XG4gICAgdGhpcy5nYW1lcGFkID0gZ2FtZXBhZDtcblxuICAgIGlmICghaGFuZGVkbmVzcykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBoYW5kZWRuZXNzIHN1cHBsaWVkJyk7XG4gICAgfVxuXG4gICAgdGhpcy5oYW5kZWRuZXNzID0gaGFuZGVkbmVzcztcbiAgICB0aGlzLnByb2ZpbGVzID0gT2JqZWN0LmZyZWV6ZShwcm9maWxlcyk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTW9ja1hSSW5wdXRTb3VyY2U7XG4iLCIvKiBlc2xpbnQtZGlzYWJsZSBpbXBvcnQvbm8tdW5yZXNvbHZlZCAqL1xuaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAnLi90aHJlZS9idWlsZC90aHJlZS5tb2R1bGUuanMnO1xuaW1wb3J0IHsgT3JiaXRDb250cm9scyB9IGZyb20gJy4vdGhyZWUvZXhhbXBsZXMvanNtL2NvbnRyb2xzL09yYml0Q29udHJvbHMuanMnO1xuaW1wb3J0IHsgUkdCRUxvYWRlciB9IGZyb20gJy4vdGhyZWUvZXhhbXBsZXMvanNtL2xvYWRlcnMvUkdCRUxvYWRlci5qcyc7XG5pbXBvcnQgeyBWUkJ1dHRvbiB9IGZyb20gJy4vdGhyZWUvZXhhbXBsZXMvanNtL3dlYnhyL1ZSQnV0dG9uLmpzJztcbi8qIGVzbGludC1lbmFibGUgKi9cblxuaW1wb3J0IE1hbnVhbENvbnRyb2xzIGZyb20gJy4vbWFudWFsQ29udHJvbHMuanMnO1xuaW1wb3J0IENvbnRyb2xsZXJNb2RlbCBmcm9tICcuL2NvbnRyb2xsZXJNb2RlbC5qcyc7XG5pbXBvcnQgUHJvZmlsZVNlbGVjdG9yIGZyb20gJy4vcHJvZmlsZVNlbGVjdG9yLmpzJztcbmltcG9ydCBCYWNrZ3JvdW5kU2VsZWN0b3IgZnJvbSAnLi9iYWNrZ3JvdW5kU2VsZWN0b3IuanMnO1xuaW1wb3J0IEFzc2V0RXJyb3IgZnJvbSAnLi9hc3NldEVycm9yLmpzJztcbmltcG9ydCBNb2NrR2FtZXBhZCBmcm9tICcuL21vY2tzL21vY2tHYW1lcGFkLmpzJztcbmltcG9ydCBNb2NrWFJJbnB1dFNvdXJjZSBmcm9tICcuL21vY2tzL21vY2tYUklucHV0U291cmNlLmpzJztcblxuY29uc3QgdGhyZWUgPSB7fTtcbmxldCBjYW52YXNQYXJlbnRFbGVtZW50O1xubGV0IHZyUHJvZmlsZXNFbGVtZW50O1xubGV0IHZyUHJvZmlsZXNMaXN0RWxlbWVudDtcblxubGV0IHByb2ZpbGVTZWxlY3RvcjtcbmxldCBiYWNrZ3JvdW5kU2VsZWN0b3I7XG5sZXQgbW9ja0NvbnRyb2xsZXJNb2RlbDtcbmxldCBpc0ltbWVyc2l2ZSA9IGZhbHNlO1xuXG4vKipcbiAqIEFkZHMgdGhlIGV2ZW50IGhhbmRsZXJzIGZvciBWUiBtb3Rpb24gY29udHJvbGxlcnMgdG8gbG9hZCB0aGUgYXNzZXRzIG9uIGNvbm5lY3Rpb25cbiAqIGFuZCByZW1vdmUgdGhlbSBvbiBkaXNjb25uZWN0aW9uXG4gKiBAcGFyYW0ge251bWJlcn0gaW5kZXhcbiAqL1xuZnVuY3Rpb24gaW5pdGlhbGl6ZVZSQ29udHJvbGxlcihpbmRleCkge1xuICBjb25zdCB2ckNvbnRyb2xsZXJHcmlwID0gdGhyZWUucmVuZGVyZXIueHIuZ2V0Q29udHJvbGxlckdyaXAoaW5kZXgpO1xuXG4gIHZyQ29udHJvbGxlckdyaXAuYWRkRXZlbnRMaXN0ZW5lcignY29ubmVjdGVkJywgYXN5bmMgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgY29udHJvbGxlck1vZGVsID0gbmV3IENvbnRyb2xsZXJNb2RlbCgpO1xuICAgIHZyQ29udHJvbGxlckdyaXAuYWRkKGNvbnRyb2xsZXJNb2RlbCk7XG5cbiAgICBsZXQgeHJJbnB1dFNvdXJjZSA9IGV2ZW50LmRhdGE7XG5cbiAgICB2clByb2ZpbGVzTGlzdEVsZW1lbnQuaW5uZXJIVE1MICs9IGA8bGk+PGI+JHt4cklucHV0U291cmNlLmhhbmRlZG5lc3N9OjwvYj4gWyR7eHJJbnB1dFNvdXJjZS5wcm9maWxlc31dPC9saT5gO1xuXG4gICAgaWYgKHByb2ZpbGVTZWxlY3Rvci5mb3JjZVZSUHJvZmlsZSkge1xuICAgICAgeHJJbnB1dFNvdXJjZSA9IG5ldyBNb2NrWFJJbnB1dFNvdXJjZShcbiAgICAgICAgW3Byb2ZpbGVTZWxlY3Rvci5wcm9maWxlLnByb2ZpbGVJZF0sIGV2ZW50LmRhdGEuZ2FtZXBhZCwgZXZlbnQuZGF0YS5oYW5kZWRuZXNzXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IG1vdGlvbkNvbnRyb2xsZXIgPSBhd2FpdCBwcm9maWxlU2VsZWN0b3IuY3JlYXRlTW90aW9uQ29udHJvbGxlcih4cklucHV0U291cmNlKTtcbiAgICBhd2FpdCBjb250cm9sbGVyTW9kZWwuaW5pdGlhbGl6ZShtb3Rpb25Db250cm9sbGVyKTtcblxuICAgIGlmICh0aHJlZS5lbnZpcm9ubWVudE1hcCkge1xuICAgICAgY29udHJvbGxlck1vZGVsLmVudmlyb25tZW50TWFwID0gdGhyZWUuZW52aXJvbm1lbnRNYXA7XG4gICAgfVxuICB9KTtcblxuICB2ckNvbnRyb2xsZXJHcmlwLmFkZEV2ZW50TGlzdGVuZXIoJ2Rpc2Nvbm5lY3RlZCcsICgpID0+IHtcbiAgICB2ckNvbnRyb2xsZXJHcmlwLnJlbW92ZSh2ckNvbnRyb2xsZXJHcmlwLmNoaWxkcmVuWzBdKTtcbiAgfSk7XG5cbiAgdGhyZWUuc2NlbmUuYWRkKHZyQ29udHJvbGxlckdyaXApO1xuXG4gIGNvbnN0IHZyQ29udHJvbGxlclRhcmdldCA9IHRocmVlLnJlbmRlcmVyLnhyLmdldENvbnRyb2xsZXIoaW5kZXgpO1xuXG4gIHZyQ29udHJvbGxlclRhcmdldC5hZGRFdmVudExpc3RlbmVyKCdjb25uZWN0ZWQnLCAoKSA9PiB7XG4gICAgaWYgKHByb2ZpbGVTZWxlY3Rvci5zaG93VGFyZ2V0UmF5KSB7XG4gICAgICBjb25zdCBnZW9tZXRyeSA9IG5ldyBUSFJFRS5CdWZmZXJHZW9tZXRyeSgpO1xuICAgICAgZ2VvbWV0cnkuc2V0QXR0cmlidXRlKCdwb3NpdGlvbicsIG5ldyBUSFJFRS5GbG9hdDMyQnVmZmVyQXR0cmlidXRlKFswLCAwLCAwLCAwLCAwLCAtMV0sIDMpKTtcbiAgICAgIGdlb21ldHJ5LnNldEF0dHJpYnV0ZSgnY29sb3InLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShbMC41LCAwLjUsIDAuNSwgMCwgMCwgMF0sIDMpKTtcblxuICAgICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTGluZUJhc2ljTWF0ZXJpYWwoe1xuICAgICAgICB2ZXJ0ZXhDb2xvcnM6IFRIUkVFLlZlcnRleENvbG9ycyxcbiAgICAgICAgYmxlbmRpbmc6IFRIUkVFLkFkZGl0aXZlQmxlbmRpbmdcbiAgICAgIH0pO1xuXG4gICAgICB2ckNvbnRyb2xsZXJUYXJnZXQuYWRkKG5ldyBUSFJFRS5MaW5lKGdlb21ldHJ5LCBtYXRlcmlhbCkpO1xuICAgIH1cbiAgfSk7XG5cbiAgdnJDb250cm9sbGVyVGFyZ2V0LmFkZEV2ZW50TGlzdGVuZXIoJ2Rpc2Nvbm5lY3RlZCcsICgpID0+IHtcbiAgICBpZiAodnJDb250cm9sbGVyVGFyZ2V0LmNoaWxkcmVuLmxlbmd0aCkge1xuICAgICAgdnJDb250cm9sbGVyVGFyZ2V0LnJlbW92ZSh2ckNvbnRyb2xsZXJUYXJnZXQuY2hpbGRyZW5bMF0pO1xuICAgIH1cbiAgfSk7XG5cbiAgdGhyZWUuc2NlbmUuYWRkKHZyQ29udHJvbGxlclRhcmdldCk7XG59XG5cbi8qKlxuICogVGhlIHRocmVlLmpzIHJlbmRlciBsb29wICh1c2VkIGluc3RlYWQgb2YgcmVxdWVzdEFuaW1hdGlvbkZyYW1lIHRvIHN1cHBvcnQgWFIpXG4gKi9cbmZ1bmN0aW9uIHJlbmRlcigpIHtcbiAgaWYgKG1vY2tDb250cm9sbGVyTW9kZWwpIHtcbiAgICBpZiAoaXNJbW1lcnNpdmUpIHtcbiAgICAgIHRocmVlLnNjZW5lLnJlbW92ZShtb2NrQ29udHJvbGxlck1vZGVsKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyZWUuc2NlbmUuYWRkKG1vY2tDb250cm9sbGVyTW9kZWwpO1xuICAgICAgTWFudWFsQ29udHJvbHMudXBkYXRlVGV4dCgpO1xuICAgIH1cbiAgfVxuXG4gIHRocmVlLmNhbWVyYUNvbnRyb2xzLnVwZGF0ZSgpO1xuXG4gIHRocmVlLnJlbmRlcmVyLnJlbmRlcih0aHJlZS5zY2VuZSwgdGhyZWUuY2FtZXJhKTtcbn1cblxuLyoqXG4gKiBAZGVzY3JpcHRpb24gRXZlbnQgaGFuZGxlciBmb3Igd2luZG93IHJlc2l6aW5nLlxuICovXG5mdW5jdGlvbiBvblJlc2l6ZSgpIHtcbiAgY29uc3Qgd2lkdGggPSBjYW52YXNQYXJlbnRFbGVtZW50LmNsaWVudFdpZHRoO1xuICBjb25zdCBoZWlnaHQgPSBjYW52YXNQYXJlbnRFbGVtZW50LmNsaWVudEhlaWdodDtcbiAgdGhyZWUuY2FtZXJhLmFzcGVjdCA9IHdpZHRoIC8gaGVpZ2h0O1xuICB0aHJlZS5jYW1lcmEudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuICB0aHJlZS5yZW5kZXJlci5zZXRTaXplKHdpZHRoLCBoZWlnaHQpO1xuICB0aHJlZS5jYW1lcmFDb250cm9scy51cGRhdGUoKTtcbn1cblxuLyoqXG4gKiBJbml0aWFsaXplcyB0aGUgdGhyZWUuanMgcmVzb3VyY2VzIG5lZWRlZCBmb3IgdGhpcyBwYWdlXG4gKi9cbmZ1bmN0aW9uIGluaXRpYWxpemVUaHJlZSgpIHtcbiAgY2FudmFzUGFyZW50RWxlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb2RlbFZpZXdlcicpO1xuICBjb25zdCB3aWR0aCA9IGNhbnZhc1BhcmVudEVsZW1lbnQuY2xpZW50V2lkdGg7XG4gIGNvbnN0IGhlaWdodCA9IGNhbnZhc1BhcmVudEVsZW1lbnQuY2xpZW50SGVpZ2h0O1xuXG4gIHZyUHJvZmlsZXNFbGVtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3ZyUHJvZmlsZXMnKTtcbiAgdnJQcm9maWxlc0xpc3RFbGVtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3ZyUHJvZmlsZXNMaXN0Jyk7XG5cbiAgLy8gU2V0IHVwIHRoZSBUSFJFRS5qcyBpbmZyYXN0cnVjdHVyZVxuICB0aHJlZS5jYW1lcmEgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEoNzUsIHdpZHRoIC8gaGVpZ2h0LCAwLjAxLCAxMDAwKTtcbiAgdGhyZWUuY2FtZXJhLnBvc2l0aW9uLnkgPSAwLjU7XG4gIHRocmVlLnNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XG4gIHRocmVlLnNjZW5lLmJhY2tncm91bmQgPSBuZXcgVEhSRUUuQ29sb3IoMHgwMGFhNDQpO1xuICB0aHJlZS5yZW5kZXJlciA9IG5ldyBUSFJFRS5XZWJHTFJlbmRlcmVyKHsgYW50aWFsaWFzOiB0cnVlIH0pO1xuICB0aHJlZS5yZW5kZXJlci5zZXRTaXplKHdpZHRoLCBoZWlnaHQpO1xuICB0aHJlZS5yZW5kZXJlci5nYW1tYU91dHB1dCA9IHRydWU7XG5cbiAgLy8gU2V0IHVwIHRoZSBjb250cm9scyBmb3IgbW92aW5nIHRoZSBzY2VuZSBhcm91bmRcbiAgdGhyZWUuY2FtZXJhQ29udHJvbHMgPSBuZXcgT3JiaXRDb250cm9scyh0aHJlZS5jYW1lcmEsIHRocmVlLnJlbmRlcmVyLmRvbUVsZW1lbnQpO1xuICB0aHJlZS5jYW1lcmFDb250cm9scy5lbmFibGVEYW1waW5nID0gdHJ1ZTtcbiAgdGhyZWUuY2FtZXJhQ29udHJvbHMubWluRGlzdGFuY2UgPSAwLjA1O1xuICB0aHJlZS5jYW1lcmFDb250cm9scy5tYXhEaXN0YW5jZSA9IDAuMztcbiAgdGhyZWUuY2FtZXJhQ29udHJvbHMuZW5hYmxlUGFuID0gZmFsc2U7XG4gIHRocmVlLmNhbWVyYUNvbnRyb2xzLnVwZGF0ZSgpO1xuXG4gIC8vIEFkZCBWUlxuICBjYW52YXNQYXJlbnRFbGVtZW50LmFwcGVuZENoaWxkKFZSQnV0dG9uLmNyZWF0ZUJ1dHRvbih0aHJlZS5yZW5kZXJlcikpO1xuICB0aHJlZS5yZW5kZXJlci54ci5lbmFibGVkID0gdHJ1ZTtcbiAgdGhyZWUucmVuZGVyZXIueHIuYWRkRXZlbnRMaXN0ZW5lcignc2Vzc2lvbnN0YXJ0JywgKCkgPT4ge1xuICAgIHZyUHJvZmlsZXNFbGVtZW50LmhpZGRlbiA9IGZhbHNlO1xuICAgIHZyUHJvZmlsZXNMaXN0RWxlbWVudC5pbm5lckhUTUwgPSAnJztcbiAgICBpc0ltbWVyc2l2ZSA9IHRydWU7XG4gIH0pO1xuICB0aHJlZS5yZW5kZXJlci54ci5hZGRFdmVudExpc3RlbmVyKCdzZXNzaW9uZW5kJywgKCkgPT4geyBpc0ltbWVyc2l2ZSA9IGZhbHNlOyB9KTtcbiAgaW5pdGlhbGl6ZVZSQ29udHJvbGxlcigwKTtcbiAgaW5pdGlhbGl6ZVZSQ29udHJvbGxlcigxKTtcblxuICAvLyBBZGQgdGhlIFRIUkVFLmpzIGNhbnZhcyB0byB0aGUgcGFnZVxuICBjYW52YXNQYXJlbnRFbGVtZW50LmFwcGVuZENoaWxkKHRocmVlLnJlbmRlcmVyLmRvbUVsZW1lbnQpO1xuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgb25SZXNpemUsIGZhbHNlKTtcblxuICAvLyBTdGFydCBwdW1waW5nIGZyYW1lc1xuICB0aHJlZS5yZW5kZXJlci5zZXRBbmltYXRpb25Mb29wKHJlbmRlcik7XG59XG5cbmZ1bmN0aW9uIG9uU2VsZWN0aW9uQ2xlYXIoKSB7XG4gIE1hbnVhbENvbnRyb2xzLmNsZWFyKCk7XG4gIGlmIChtb2NrQ29udHJvbGxlck1vZGVsKSB7XG4gICAgdGhyZWUuc2NlbmUucmVtb3ZlKG1vY2tDb250cm9sbGVyTW9kZWwpO1xuICAgIG1vY2tDb250cm9sbGVyTW9kZWwgPSBudWxsO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIG9uU2VsZWN0aW9uQ2hhbmdlKCkge1xuICBvblNlbGVjdGlvbkNsZWFyKCk7XG4gIGNvbnN0IG1vY2tHYW1lcGFkID0gbmV3IE1vY2tHYW1lcGFkKHByb2ZpbGVTZWxlY3Rvci5wcm9maWxlLCBwcm9maWxlU2VsZWN0b3IuaGFuZGVkbmVzcyk7XG4gIGNvbnN0IG1vY2tYUklucHV0U291cmNlID0gbmV3IE1vY2tYUklucHV0U291cmNlKFxuICAgIFtwcm9maWxlU2VsZWN0b3IucHJvZmlsZS5wcm9maWxlSWRdLCBtb2NrR2FtZXBhZCwgcHJvZmlsZVNlbGVjdG9yLmhhbmRlZG5lc3NcbiAgKTtcbiAgbW9ja0NvbnRyb2xsZXJNb2RlbCA9IG5ldyBDb250cm9sbGVyTW9kZWwobW9ja1hSSW5wdXRTb3VyY2UpO1xuICB0aHJlZS5zY2VuZS5hZGQobW9ja0NvbnRyb2xsZXJNb2RlbCk7XG5cbiAgY29uc3QgbW90aW9uQ29udHJvbGxlciA9IGF3YWl0IHByb2ZpbGVTZWxlY3Rvci5jcmVhdGVNb3Rpb25Db250cm9sbGVyKG1vY2tYUklucHV0U291cmNlKTtcbiAgTWFudWFsQ29udHJvbHMuYnVpbGQobW90aW9uQ29udHJvbGxlcik7XG4gIGF3YWl0IG1vY2tDb250cm9sbGVyTW9kZWwuaW5pdGlhbGl6ZShtb3Rpb25Db250cm9sbGVyKTtcblxuICBpZiAodGhyZWUuZW52aXJvbm1lbnRNYXApIHtcbiAgICBtb2NrQ29udHJvbGxlck1vZGVsLmVudmlyb25tZW50TWFwID0gdGhyZWUuZW52aXJvbm1lbnRNYXA7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gb25CYWNrZ3JvdW5kQ2hhbmdlKCkge1xuICBjb25zdCBwbXJlbUdlbmVyYXRvciA9IG5ldyBUSFJFRS5QTVJFTUdlbmVyYXRvcih0aHJlZS5yZW5kZXJlcik7XG4gIHBtcmVtR2VuZXJhdG9yLmNvbXBpbGVFcXVpcmVjdGFuZ3VsYXJTaGFkZXIoKTtcblxuICBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNvbnN0IHJnYmVMb2FkZXIgPSBuZXcgUkdCRUxvYWRlcigpO1xuICAgIHJnYmVMb2FkZXIuc2V0RGF0YVR5cGUoVEhSRUUuVW5zaWduZWRCeXRlVHlwZSk7XG4gICAgcmdiZUxvYWRlci5zZXRQYXRoKCdiYWNrZ3JvdW5kcy8nKTtcbiAgICByZ2JlTG9hZGVyLmxvYWQoYmFja2dyb3VuZFNlbGVjdG9yLmJhY2tncm91bmRQYXRoLCAodGV4dHVyZSkgPT4ge1xuICAgICAgdGhyZWUuZW52aXJvbm1lbnRNYXAgPSBwbXJlbUdlbmVyYXRvci5mcm9tRXF1aXJlY3Rhbmd1bGFyKHRleHR1cmUpLnRleHR1cmU7XG4gICAgICB0aHJlZS5zY2VuZS5iYWNrZ3JvdW5kID0gdGhyZWUuZW52aXJvbm1lbnRNYXA7XG5cbiAgICAgIGlmIChtb2NrQ29udHJvbGxlck1vZGVsKSB7XG4gICAgICAgIG1vY2tDb250cm9sbGVyTW9kZWwuZW52aXJvbm1lbnRNYXAgPSB0aHJlZS5lbnZpcm9ubWVudE1hcDtcbiAgICAgIH1cblxuICAgICAgcG1yZW1HZW5lcmF0b3IuZGlzcG9zZSgpO1xuICAgICAgcmVzb2x2ZSh0aHJlZS5lbnZpcm9ubWVudE1hcCk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG4vKipcbiAqIFBhZ2UgbG9hZCBoYW5kbGVyIGZvciBpbml0aWFsemluZyB0aGluZ3MgdGhhdCBkZXBlbmQgb24gdGhlIERPTSB0byBiZSByZWFkeVxuICovXG5mdW5jdGlvbiBvbkxvYWQoKSB7XG4gIEFzc2V0RXJyb3IuaW5pdGlhbGl6ZSgpO1xuICBwcm9maWxlU2VsZWN0b3IgPSBuZXcgUHJvZmlsZVNlbGVjdG9yKCk7XG4gIGluaXRpYWxpemVUaHJlZSgpO1xuXG4gIHByb2ZpbGVTZWxlY3Rvci5hZGRFdmVudExpc3RlbmVyKCdzZWxlY3Rpb25jbGVhcicsIG9uU2VsZWN0aW9uQ2xlYXIpO1xuICBwcm9maWxlU2VsZWN0b3IuYWRkRXZlbnRMaXN0ZW5lcignc2VsZWN0aW9uY2hhbmdlJywgb25TZWxlY3Rpb25DaGFuZ2UpO1xuXG4gIGJhY2tncm91bmRTZWxlY3RvciA9IG5ldyBCYWNrZ3JvdW5kU2VsZWN0b3IoKTtcbiAgYmFja2dyb3VuZFNlbGVjdG9yLmFkZEV2ZW50TGlzdGVuZXIoJ3NlbGVjdGlvbmNoYW5nZScsIG9uQmFja2dyb3VuZENoYW5nZSk7XG59XG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbG9hZCcsIG9uTG9hZCk7XG4iXSwibmFtZXMiOlsiVEhSRUUuT2JqZWN0M0QiLCJUSFJFRS5RdWF0ZXJuaW9uIiwiVEhSRUUuU3BoZXJlR2VvbWV0cnkiLCJUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCIsIlRIUkVFLk1lc2giLCJUSFJFRS5CdWZmZXJHZW9tZXRyeSIsIlRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUiLCJUSFJFRS5MaW5lQmFzaWNNYXRlcmlhbCIsIlRIUkVFLlZlcnRleENvbG9ycyIsIlRIUkVFLkFkZGl0aXZlQmxlbmRpbmciLCJUSFJFRS5MaW5lIiwiVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEiLCJUSFJFRS5TY2VuZSIsIlRIUkVFLkNvbG9yIiwiVEhSRUUuV2ViR0xSZW5kZXJlciIsIlRIUkVFLlBNUkVNR2VuZXJhdG9yIiwiVEhSRUUuVW5zaWduZWRCeXRlVHlwZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7QUFBQSxJQUFJLGdCQUFnQixDQUFDO0FBQ3JCLElBQUksV0FBVyxDQUFDO0FBQ2hCLElBQUksbUJBQW1CLENBQUM7O0FBRXhCLFNBQVMsVUFBVSxHQUFHO0VBQ3BCLElBQUksZ0JBQWdCLEVBQUU7SUFDcEIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsQ0FBQyxPQUFPLENBQUMs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
