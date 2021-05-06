# WebXR Input Profiles

[![Build Status](https://travis-ci.com/immersive-web/webxr-input-profiles.svg?branch=master)](https://travis-ci.org/immersive-web/webxr-input-profiles)

## Repository

This repository contains information necessary for User Agents to have conformance in WebXR `XRInputSource` objects for all known hardware devices.  It also contains assets and a helper library for developers to visualize motion controllers reported though `XRInputSource` objects.  A preview page is also included to allow end-to-end validation of new hardware.  The master branch of this preview page is hosted on Github here:

**[Profile Validator and Viewer](https://immersive-web.github.io/webxr-input-profiles/packages/viewer/dist/index.html)**

## Packages
* The [registry](./packages/registry/README.md) package contains JSON files which define the intrinsic values for each type of `XRInputSource` hardware to ensure User Agent conformity.
* The [assets](./packages/assets/README.md) package contains 3D assets and JSON files to describe the relationship between those assets and the associated `XRInputSource` profiles defined in the [registry](./packages/assets/README.md).  The build step of this package merges its content with the JSON files in the [registry](./packages/registry/README.md) package.
* The [motion-controllers](./packages/motion-controllers/README.md) package contains a javascript library able to load the JSON descriptions published from the [assets](./packages/assets/README.md) package and create component-style representations of the `XRInputSource` data. This library is 3D engine agnostic.
* The [viewer](./packages/viewer/README.md) package contains a webpage that uses the [motion-controllers](./packages/motion-controllers/README.md) library to load and view the profiles and assets from the [assets](./packages/assets/README.md) package.

## Versioning
Packages will be published to npm as changes occur, with version numbers formatted as `<Major>.<Minor>.<Patch>` and updated according to the following guildlines:

### Major
  - Significant design changes

### Minor
  - Additional features added
  - Small breaking changes to schema
  - Breaking changes in source code or test code
  
### Patch
  - Adds new mapping and/or asset files
  - Fixes to existing mapping and/or asset files
  - Critical, non-breaking security fixes
  - Occasional non-breaking fixes to schema, source code, or test code

Packages from this repo may update their `Minor` and `Patch` versions at a different cadence. Changes to `Major` versions are expected to be large enough that all packages will update in tandem.
