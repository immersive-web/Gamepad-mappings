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

export default MockXRInputSource;
