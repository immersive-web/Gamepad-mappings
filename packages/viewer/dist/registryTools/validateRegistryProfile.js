class RegistryProfileError extends Error {
  constructor(profileId, handedness, ...params) {
    super(...params);

    this.name = 'RegistryProfileError';

    this.profileId = profileId;
    this.handedness = handedness;

    this.message = `[${profileId}] [${handedness}] ${this.message}`;
  }
}

function validateComponents(registryInfo, handedness) {
  if (registryInfo.layouts[handedness].gamepad.mapping === 'xr-standard') {
    const { profileId } = registryInfo;
    const { components } = registryInfo.layouts[handedness];
    const XR_STANDARD_COMPONENTS = {
      'xr-standard-trigger': { type: 'trigger' },
      'xr-standard-squeeze': { type: 'squeeze' },
      'xr-standard-touchpad': { type: 'touchpad' },
      'xr-standard-thumbstick': { type: 'thumbstick' }
    };

    // Ensure that at least the trigger is present
    if (!components['xr-standard-trigger']) {
      throw new RegistryProfileError(profileId, handedness, '\'xr-standard\' requres the presence of the \'xr-standard-trigger\'');
    }

    // Ensure that the selection component is the trigger
    if (registryInfo.layouts[handedness].selectComponentId !== 'xr-standard-trigger') {
      throw new RegistryProfileError(profileId, handedness, '\'xr-standard\' requires the selectComponentId to be the \'xr-standard-trigger\'');
    }

    // Validate all xr-standard components are of the correct type
    Object.keys(components).forEach((componentId) => {
      const standardComponent = XR_STANDARD_COMPONENTS[componentId];
      if (standardComponent) {
        const component = components[componentId];
        if (component.type !== standardComponent.type) {
          throw new RegistryProfileError(profileId, handedness, `'xr-standard' component ${componentId} must be type ${standardComponent.type}`);
        }
      }
    });
  }
}

function validateGamepadButtons(registryInfo, handedness) {
  const { profileId } = registryInfo;
  const { components } = registryInfo.layouts[handedness];
  const { buttons } = registryInfo.layouts[handedness].gamepad;
  const XR_STANDARD_BUTTONS_MAPPING = [
    'xr-standard-trigger',
    'xr-standard-squeeze',
    'xr-standard-touchpad',
    'xr-standard-thumbstick'
  ];

  buttons.forEach((componentId, index) => {
    if (componentId !== null) {
      // Validate gamepad buttons match a component
      if (!components[componentId]) {
        throw new RegistryProfileError(profileId, handedness, `Component id ${componentId} at gamepad.buttons[${index}] does not match a defined component`);
      }

      // Validate mapping order, if applicable
      if (registryInfo.layouts[handedness].gamepad.mapping === 'xr-standard' && index < XR_STANDARD_BUTTONS_MAPPING.length) {
        const standardComponentId = XR_STANDARD_BUTTONS_MAPPING[index];
        if (componentId !== standardComponentId) {
          throw new RegistryProfileError(profileId, handedness, `The 'xr-standard' mapping requires button index ${index} to match the ${standardComponentId} component`);
        }
      }
    }
  });

  // Validate no duplicates exist
  const noNulls = buttons.filter(item => item !== null);
  const noDuplicates = new Set(noNulls);
  if (noNulls.length !== noDuplicates.size) {
    throw new RegistryProfileError(profileId, handedness, 'Buttons array contains duplicate componentIds');
  }
}

function validateGamepadAxes(registryInfo, handedness) {
  const { profileId } = registryInfo;
  const { components } = registryInfo.layouts[handedness];
  const { axes } = registryInfo.layouts[handedness].gamepad;
  const XR_STANDARD_AXES_MAPPING = [
    { componentId: 'xr-standard-touchpad', axis: 'x-axis' },
    { componentId: 'xr-standard-touchpad', axis: 'y-axis' },
    { componentId: 'xr-standard-thumbstick', axis: 'x-axis' },
    { componentId: 'xr-standard-thumbstick', axis: 'y-axis' }
  ];

  // Validate no duplicates exist
  const noNulls = axes.filter(item => item !== null).map(item => JSON.stringify(item));
  const noDuplicates = new Set(noNulls);
  if (noNulls.length !== noDuplicates.size) {
    throw new RegistryProfileError(profileId, handedness, 'Axes array contains duplicates');
  }

  // Validate each axis description
  axes.forEach((axisInfo, index) => {
    if (axisInfo !== null) {
      const component = components[axisInfo.componentId];

      // Validate gamepad axes match a component
      if (!component) {
        throw new RegistryProfileError(profileId, handedness, `No matching component for gamepad.axes[${index}]`);
      }

      // Validate the matching component can report axes
      if (component.type !== 'thumbstick' && component.type !== 'touchpad') {
        throw new RegistryProfileError(profileId, handedness, `gamepad.axes[${index}] maps to ${axisInfo.componentId} which cannot report axis data`);
      }

      // Validate that axes are in x,y,z order, if present, for each component
      if (index > 0) {
        const previousAxisInfo = axes[index - 1];
        if (previousAxisInfo && previousAxisInfo.componentId === axisInfo.componentId) {
          if (axisInfo.axis === 'x-axis' || (axisInfo.axis === 'y-axis' && previousAxisInfo.axis !== 'x-axis')) {
            throw new RegistryProfileError(profileId, handedness, `Axes must be in x, y, z order for ${axisInfo.componentId}`);
          }
        }
      }

      // If applicable, validate the order matches the xr-standard
      if (registryInfo.layouts[handedness].gamepad.mapping === 'xr-standard' && index < XR_STANDARD_AXES_MAPPING.length) {
        const standardAxisInfo = XR_STANDARD_AXES_MAPPING[index];

        if (axisInfo.componentId !== standardAxisInfo.componentId) {
          throw new RegistryProfileError(profileId, handedness, `The 'xr-standard' mapping requires axis index ${index} to match the ${standardAxisInfo.componentId} component`);
        }

        if (axisInfo.axis !== standardAxisInfo.axis) {
          throw new RegistryProfileError(profileId, handedness, `The 'xr-standard' mapping requires axis index ${index} to match the ${standardAxisInfo.axis}`);
        }
      }
    }
  });
}

// Validate the layouts conform with requirements not expressable in schema validation
function validateProfile(registryInfo) {
  Object.keys(registryInfo.layouts).forEach((layoutId) => {
    validateComponents(registryInfo, layoutId);
    validateGamepadButtons(registryInfo, layoutId);
    validateGamepadAxes(registryInfo, layoutId);
  });
}

export default validateProfile;
