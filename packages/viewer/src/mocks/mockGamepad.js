/* eslint-disable import/no-unresolved */
import { Constants } from '../motion-controllers.module.js';
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

export default MockGamepad;
