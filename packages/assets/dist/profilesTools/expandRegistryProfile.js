function expandRegistryProfile(registryProfile) {
  const expandedProfile = {
    profileId: registryProfile.profileId,
    fallbackProfileIds: registryProfile.fallbackProfileIds,
    layouts: {}
  };

  Object.keys(registryProfile.layouts).forEach((layoutId) => {
    // Split the layoutId string so a layout exists for each handedness separately
    (layoutId.split('-')).forEach((handedness) => {
      const layoutInfo = registryProfile.layouts[layoutId];
      const layout = {
        selectComponentId: layoutInfo.selectComponentId,
        components: {}
      };

      if (layoutInfo.gamepad) {
        layout.gamepadMapping = layoutInfo.gamepad.mapping;
      }

      Object.keys(layoutInfo.components).forEach((componentId) => {
        const component = {
          type: layoutInfo.components[componentId].type
        };

        if (layoutInfo.gamepad) {
          component.gamepadIndices = {};

          // Add button index to component
          const buttonIndex = layoutInfo.gamepad.buttons.indexOf(componentId);
          if (buttonIndex !== -1) {
            component.gamepadIndices.button = buttonIndex;
          }

          // Add axes indices to component
          layoutInfo.gamepad.axes.forEach((axisInfo, index) => {
            if (axisInfo !== null && axisInfo.componentId === componentId) {
              const axisIndexName = {
                'x-axis': 'xAxis',
                'y-axis': 'yAxis',
                'z-axis': 'zAxis'
              }[axisInfo.axis];

              component.gamepadIndices[axisIndexName] = index;
            }
          });

          if (Object.keys(component.gamepadIndices).length > 0) {
            layout.components[componentId] = component;
          }
        }
      });

      expandedProfile.layouts[handedness] = layout;
    });
  });

  return expandedProfile;
}

export default expandRegistryProfile;
