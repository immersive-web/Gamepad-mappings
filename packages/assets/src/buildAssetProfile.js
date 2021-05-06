const STANDARD_VISUAL_RESPONSES = {
  pressed: {
    componentProperty: 'button',
    states: ['default', 'touched', 'pressed'],
    valueNodeProperty: 'transform'
  },
  pressed_mirror: {
    componentProperty: 'button',
    states: ['default', 'touched', 'pressed'],
    valueNodeProperty: 'transform'
  },
  xaxis_pressed: {
    componentProperty: 'xAxis',
    states: ['default', 'touched', 'pressed'],
    valueNodeProperty: 'transform'
  },
  yaxis_pressed: {
    componentProperty: 'yAxis',
    states: ['default', 'touched', 'pressed'],
    valueNodeProperty: 'transform'
  },
  xaxis_touched: {
    componentProperty: 'xAxis',
    states: ['default', 'touched', 'pressed'],
    valueNodeProperty: 'transform'
  },
  yaxis_touched: {
    componentProperty: 'yAxis',
    states: ['default', 'touched', 'pressed'],
    valueNodeProperty: 'transform'
  },
  axes_touched: {
    componentProperty: 'state',
    states: ['touched', 'pressed'],
    valueNodeProperty: 'visibility'
  }
};

const DEFAULT_COMPONENT_VISUAL_RESPONSES = {
  left: {
    trigger: ['pressed'],
    squeeze: ['pressed'],
    touchpad: ['pressed', 'xaxis_pressed', 'yaxis_pressed', 'xaxis_touched', 'yaxis_touched', 'axes_touched'],
    thumbstick: ['pressed', 'xaxis_pressed', 'yaxis_pressed'],
    button: ['pressed']
  },
  right: {
    trigger: ['pressed'],
    squeeze: ['pressed'],
    touchpad: ['pressed', 'xaxis_pressed', 'yaxis_pressed', 'xaxis_touched', 'yaxis_touched', 'axes_touched'],
    thumbstick: ['pressed', 'xaxis_pressed', 'yaxis_pressed'],
    button: ['pressed']
  },
  none: {
    trigger: ['pressed'],
    squeeze: ['pressed', 'pressed_mirror'],
    touchpad: ['pressed', 'xaxis_pressed', 'yaxis_pressed', 'xaxis_touched', 'yaxis_touched', 'axes_touched'],
    thumbstick: ['pressed', 'xaxis_pressed', 'yaxis_pressed'],
    button: ['pressed']
  }
};

class AssetProfileError extends Error {
  constructor(profileId, handedness, ...params) {
    super(...params);

    this.name = 'AssetProfileError';

    this.profileId = profileId;
    this.handedness = handedness;

    this.message = `[${profileId}] [${handedness}] ${this.message}`;
  }
}

/**
 * Build the set of default visual responses for a given component type.  Node names are based
 * on the component's id and the name of the response.
 * @param {Object} component
 * @param {string} component.rootNodeName
 * @param {string} component.type
 * @param {string} handedness
 */
function buildDefaultVisualResponses({ rootNodeName, type }, handedness) {
  const visualResponses = {};
  const componentTypeDefault = DEFAULT_COMPONENT_VISUAL_RESPONSES[handedness][type];
  componentTypeDefault.forEach((responseId) => {
    // Copy the default response definition and add the node names
    const visualResponse = JSON.parse(JSON.stringify(STANDARD_VISUAL_RESPONSES[responseId]));
    const visualResponseName = `${rootNodeName}_${responseId}`;
    visualResponse.valueNodeName = `${visualResponseName}_value`;
    if (visualResponse.valueNodeProperty === 'transform') {
      visualResponse.minNodeName = `${visualResponseName}_min`;
      visualResponse.maxNodeName = `${visualResponseName}_max`;
    }

    visualResponses[visualResponseName] = visualResponse;
  });

  return visualResponses;
}

/**
 * Unpacks the asset JSON and applies any specified overrides to the asset profile passed in
 * @param {Object} profile
 * @param {Object} assetInfo
 */
function applyAssetOverrides(profile, assetInfo) {
  Object.keys(assetInfo.overrides).forEach((layoutId) => {
    // Split the layoutId string so a layout exists for each handedness separately
    (layoutId.split('-')).forEach((handedness) => {
      if (!profile.layouts[handedness]) {
        throw new AssetProfileError(assetInfo.profileId, handedness, 'Cannot apply layout overrides for a layout that isn\'t defined in the registry entry');
      }

      const layout = profile.layouts[handedness];
      const layoutOverrides = assetInfo.overrides[layoutId];

      // Override the asset path and rootNodeName if supplied
      layout.rootNodeName = layoutOverrides.rootNodeName || layout.rootNodeName;
      layout.assetPath = layoutOverrides.assetPath || layout.assetPath;

      // Iterate through components with overrides and apply them
      if (layoutOverrides.components) {
        Object.keys(layoutOverrides.components).forEach((componentId) => {
          if (!layout.components[componentId]) {
            throw new AssetProfileError(assetInfo.profileId, handedness, `Cannot apply component overrides for ${componentId} because it isn't defined in the registry`);
          }

          const component = layout.components[componentId];
          const componentOverrides = layoutOverrides.components[componentId];

          // Override the rootNodeName if supplied
          component.rootNodeName = componentOverrides.rootNodeName || component.rootNodeName;

          // Override the touchPointNodeName, if supplied
          if (componentOverrides.touchPointNodeName) {
            if (component.type !== 'touchpad') {
              throw new AssetProfileError(assetInfo.profileId, handedness, `Cannot set the touchPointNodeName on ${componentId} of type ${component.type}`);
            }

            component.touchPointNodeName = componentOverrides.touchPointNodeName;
          }

          // Iterate through visualResponses with overrides and apply them
          if (componentOverrides.visualResponses) {
            const visualResponseOverrides = componentOverrides.visualResponses;
            component.visualResponses = component.visualResponses || {};

            Object.keys(visualResponseOverrides).forEach((shortResponseName) => {
              const fullResponseName = `${componentId}-${shortResponseName}`;

              // If the overridden response is null, remove it the profile.  Otherwise, update its
              // properties based on the override
              if (visualResponseOverrides[shortResponseName] === null) {
                if (!component.visualResponses[fullResponseName]) {
                  throw new AssetProfileError(assetInfo.profileId, handedness, `Cannot remove visual response ${shortResponseName} from ${componentId} because it is not present`);
                } else {
                  delete component.visualResponses[fullResponseName];
                }
              } else {
                const visualResponseOverride = visualResponseOverrides[shortResponseName];

                const { componentProperty } = visualResponseOverride;
                if (component.gamepadIndices[componentProperty] === undefined) {
                  throw new AssetProfileError(assetInfo.profileId, handedness, `Visual response ${fullResponseName} cannot have a componentProperty of ${componentProperty} because ${componentId} does not have 'gamepadIndices.${componentProperty}'`);
                }

                let visualResponse = component.visualResponses[fullResponseName] || {};
                visualResponse = Object.assign(visualResponse, visualResponseOverride);
                component.visualResponses[fullResponseName] = visualResponse;
              }
            });
          }
        });
      }
    });
  });
}

/**
 * Builds a complete asset profile based on the registry profile applying any asset-specific
 * overrides as defined in the assetInfo object
 * @param {Object} assetInfo
 * @param {Object} expandedRegistryProfile
 */
function buildAssetProfile(assetInfo, expandedRegistryProfile) {
  if (expandedRegistryProfile.profileId !== assetInfo.profileId) {
    throw new Error(
      `Profile id mismatch registry=${expandedRegistryProfile.profileId} asset=${assetInfo.profileId}`
    );
  }

  // Copy the registry profile as a basis for the asset profile
  const profile = JSON.parse(JSON.stringify(expandedRegistryProfile));

  // Add default asset-specific properties
  Object.keys(profile.layouts).forEach((handedness) => {
    const layout = profile.layouts[handedness];
    layout.rootNodeName = `${profile.profileId}-${handedness}`;
    layout.assetPath = `${handedness}.glb`;

    // Add the default node names and visual responses for the components based on their type
    Object.keys(layout.components).forEach((componentId) => {
      const component = layout.components[componentId];
      const rootNodeName = componentId.replace(/-/g, '_');
      component.rootNodeName = rootNodeName;
      component.visualResponses = buildDefaultVisualResponses(component, handedness);
      if (component.type === 'touchpad') {
        component.touchPointNodeName = `${rootNodeName}_axes_touched_value`;
      }
    });
  });

  // Override any properties enumerated in the asset description file
  applyAssetOverrides(profile, assetInfo);

  return profile;
}

module.exports = buildAssetProfile;
