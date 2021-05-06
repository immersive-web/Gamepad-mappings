/* eslint-disable import/no-unresolved */
import * as THREE from './three/build/three.module.js';
import { GLTFLoader } from './three/examples/jsm/loaders/GLTFLoader.js';
import { Constants } from './motion-controllers.module.js';
/* eslint-enable */

import AssetError from './assetError.js';

const gltfLoader = new GLTFLoader();

class ControllerModel extends THREE.Object3D {
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
          THREE.Quaternion.slerp(
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
          const sphereGeometry = new THREE.SphereGeometry(0.001);
          const material = new THREE.MeshBasicMaterial({ color: 0x0000FF });
          const sphere = new THREE.Mesh(sphereGeometry, material);
          touchPointRoot.add(sphere);
        }
      }
    });
  }
}

export default ControllerModel;
