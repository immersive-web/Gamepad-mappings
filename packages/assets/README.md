# WebXR Input Profiles - Assets

[![Build Status](https://travis-ci.com/immersive-web/webxr-input-profiles.svg?branch=master)](https://travis-ci.org/immersive-web/webxr-input-profiles)

## Overview
This package provides 3D assets and JSON descriptions of how to relate those assets to the `XRInputSource` objects with matching profile ids. This package can be used on its own, but may be easier to use with the javascript library in the [@webxr-input-source/motion-controllers](../motion-controllers) package also published by this repository. Assets are available under MIT license in .glTF, or .glb formats.

We also have some [simple statistics about library usage](./stats/);

## Contributing
All profiles are located under the './profiles' folder in subfolders for vendor prefixes. At build time, these profiles are combined with the matching profiles from the [registry](../packages/registry/README.md) package and a merged JSON profile is output for each match.

### Adding an asset
New assets must match a profile id in the [registry](../registry) package. To add an asset, save a JSON file that conforms with the [schema](#schema) in `./profiles/[profile id]/`. In the same `./profiles/[profile id]/` folder, place the `.glb` files for each supported handedness.  The package must [build](#development) successfully before submitting a pull request.

For more details read our tutorial on **[Preparing a WebXR input profile asset with Blender](./tutorial/README.md)**

### Filing a bug
To file bugs on existing assets, use this [issue template](https://github.com/immersive-web/webxr-input-profiles/issues/new?assignees=&labels=assets&template=asset-bug-report.md&title=)

### Development
In general, this package should be built and tested from the root of the repository using the following command:
> npm run test

To build just this package without running tests, invoke the following command from the root of the repository:
> npm run build -- --scope @webxr-input-profiles/assets

To visually validate the asset looks and behaves as expected, follow the [viewer](../viewer) instructions.

### Licence
See the [LICENSE.md](LICENSE.md).

### Trademarks
Please note: Some assets portray registered trademarks of the device manufacturers in the interest of accurately depicting the corresponding physical device. The license _does not_ grant permission to use these trademarks in derivative works (such as alternate controller skins), and they may not be used to endorse or promote products derived from this software without specific prior written permission.

## Usage

### Getting started
To install this package:
```
npm install @webxr-input-profiles/assets
```

## Schema

### Profile id
Profiles are required to have a `profileId` that uniquely identifies the profile and must match an existing profile id in the [registry](../registry/README.md).

```json
{
    "profileId" : "motion-controller-id"
}
```

### Overrides
By default the asset profile is dynamically generated based on the registry profile during the asset package build step.  These values can be overriden through the `overrides` property in the asset configuraiton file.

When supplied, the `overrides` property is required to have a `layouts` child property which contains overrides for a specific `handedness` values. The `layouts` property must each have one, and only one, of the following arrangements of keys to be considered valid.
* At least one of: `none`, `left`, or `right`
* `left-right`
* `left-right` and `none`
* `left-right-none`

For example:
```json
{
    "overrides": {
        "layouts": {
            "left": {}
        }
    },
}
```
Or:
```json
{
    "overrides": {
        "layouts": {
            "none" : {},
            "left-right": {}
        }
    }
}
```

All specified handedness values must be present in the associated registry profile.  For example, if the registry has a defined `left-right` layout, the asset json can override `left` but not `none`.

### Layouts
Within each layout, there must be a `rootNodeName`, `assetPath`, and/or a `components` property. The `rootNodeName` describes the top node in the 3D asset hierarchy representing the motion controller. As Maya files cannot name nodes with "-" characters, the default value for this node name is `<profile id>_<handedness>` with all "-" in the profile id changed to "\_". The `assetPath` is the relative path to the asset for the layout, and is set to `<handedness>.glb` by default.  The `components` property is explained further in the [components](#components) section.
```json
{
    "left" : {
        "rootNodeName": "generic_trigger_left",
        "assetPath": "left.glb",
        "components": {}
    }
}
```

### Components
The `components` property may only contain keys for components defined in the associated registry profile.  When present, a component id key must point to an object which contains `rootNodeName`, `touchPointNodeName`, and/or `visualResponses`. The `rootNodeName` of a component describes the top node of a component within the 3D asset hierarchy. As Maya files cannot name nodes with "-" characters, the default value for this node name is `<component id>` with all "-" in the id changed to "\_". The `touchPointNodeName` is the name of the node in the asset which will be updated to match the user's finger location on a touchpad. This node is named `<rootNodeName>_axes_touched_value` by default and is where developers may attach geometry to indicate a touch point. The `visualResponses` property contains the collection of [visual changes](#visual-responses) the component can apply in response to state changes in the backing `XRInputSource`.

For example
```json
{
    "components": {
        "xr-standard-touchpad": {
            "rootNodeName" : "xr_standard_trigger",
            "touchPointNodeName": "xr_standard_touchpad_axes_touched_value",
            "visualResponses": {}
        }
    }
}
```

### Visual responses
The visual representation of a motion controller in VR must respond to reflect its physical state in the real-world.  For example, when a physical thumbstick is moved to the left, the virtual thumbstick should also move to the left.  The `visualResponses` object contains descriptions of all visual changes that will be applied when the associated controller component is interacted with.

The `visualResponses` object contains children that each uniquely describe a single visual response to be applied to the asset and the key name should reflect that purpose.  The children of `visualResponses` may be null, in which case the key name must match a default visual reponse to be removed from the generate profile.  When non-null, the object contain `componentProperty`, `states`, and `valueNodeProperty` children.

The `componentProperty` property must be set to one of four values: `button`, `xAxis`, `yAxis`, or `state`.  This indicates which component property will be used to drive the visualization.  The `states` array indicates the component states for which the visualization will apply and must contain at least one of the following values: `default`, `touched`, `pressed`.  The `valueNodeProperty` indicates which property of the asset's node will be modified in response the XRInputSource changes.  It must either be set to `transform` or `visibility`.  When set to `visibility`, `componentProperty` must be set to `state`.

```json
{
    "visualResponses" : {
        "pressed": {
            "componentProperty": "button",
            "states": ["touched", "pressed"],
            "valueNodeProperty": "transform"
        }
    }
}
```

In order for `visualResponses` to function, the associated 3D asset must contain a node named `<rootNodeName>_<visual response name>_value` whose `valueNodeProperty` will be modified in response to changes in the XRInputSource.  When the `valueNodeProperty` is a `transform`, the transform value will be interpolated between the transforms of the two nodes named `<rootNodeName>_<visual response name>_min` and `<rootNodeName>_<visual response name>_max`.

Components have the following visual responses by default:

| Type       | Responses       | Component Property | Min                   | Max                 |
| ---------- | --------------- | ------------------ | --------------------- | ------------------- |
| Trigger    | `pressed`       | button value       | Unpressed             | Pressed             |
| Squeeze    | `pressed`       | button value       | Unpressed             | Pressed             |
| Thumbstick | `pressed`       | button value       | Unpressed             | Pressed             |
|            | `xaxis_pressed` | x axis value       | Tipped left           | Tipped right        |
|            | `yaxis_pressed` | y axis value       | Tipped up             | Tipped down         |
| Touchpad   | `pressed`       | button value       | Unpressed             | Pressed             |
|            | `xaxis_pressed` | x axis value       | Tipped left           | Tipped right        |
|            | `yaxis_pressed` | y axis value       | Tipped up             | Tipped down         |
|            | `xaxis_touched` | x axis value       | Touch point left      | Touch point right   |
|            | `yaxis_touched` | y axis value       | Touch point up        | Touch point down    |
|            | `axes_touched`  | button touched     | Touch point invisible | Touch point visible |
| Button     | `pressed`       | button value       | Unpressed             | Pressed             |
