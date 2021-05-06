# WebXR Input Profiles - Viewer

[![Build Status](https://travis-ci.com/immersive-web/webxr-input-profiles.svg?branch=master)](https://travis-ci.org/immersive-web/webxr-input-profiles)

## Overview
This package builds a test page that allows for easy testing and viewing of the devices described by each profile in this repository. It renders the assets described by the profile and allows emulated manipulation of each of the inputs in order to see the rendered response.

The latest state of the master branch can be tried out in the hosted [Profile Viewer](https://immersive-web.github.io/webxr-input-profiles/packages/viewer/dist/index.html)

## Contributing

### Filing a bug
To file bugs, use this [issue template](https://github.com/immersive-web/webxr-input-profiles/issues/new?assignees=&labels=viewer&template=viewer-bug-report.md&title=)

### Development
In general, this package should be built and tested from the root of the repository using the following command:
> npm run test

To build just this package without running tests, invoke the following command from the root of the repository:
> npm run build -- --scope @webxr-input-profiles/viewer

### Licence
See the [LICENSE.md](LICENSE.md).

## Usage

### Getting started
To install this library:
```
npm install @webxr-input-profiles/viewer
```
