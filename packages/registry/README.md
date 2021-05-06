# WebXR Input Profiles Registry

This package contains information for User Agents to ensure they expose consistent intrinsic values for all WebXR `XRInputSource` objects. For each hardware device, this information currently includes:
* The profile id
* The ordered list of fallback profile ids as specified in the [WebXR Device API](https:www.w3.org/tr/webxr)
* The allowable `XRInputSource.handedness` values
* The component layouts for each `handedness` value
* The component responsible for causing `select`, `selectstart`, and `selectend` events to fire
* The presence of a non-null `XRInputSource.gamepad`. When non-null:
  * The appropriate `Gamepad.mapping` value
  * The relationship between physical hardware components (e.g. trigger, squeeze, button, touchpad, and thumbstick) to indices in the `XRInputSource.gamepad.buttons` array.
  * The relationship between physical touchpads and thumbsticks to indices in the `XRInputSource.gamepad.axes` array.

## Contributing

### Adding a vendor prefix
To reserve a new vendor prefix, submit a pull request that adds the vendor to the list in the in the [vendor prefixes](#vendor-prefixes) section of this document.

### Adding a profile
First ensure that the desired vendor prefix has been [reserved](#adding-a-vendor-prefix), and then add a profile JSON file that represents the new device in the prefix's subfolder. This file must conform with the [schema](#schema) and the package must [build](#development) successfully before submitting a pull request. If adding an associated 3D asset in the same pull request, please also follow the instructions in the [asset package](../assets).

### Filing a bug
Bugs with existing profiles can be filed using this [issue template](https://github.com/immersive-web/webxr-input-profiles/issues/new?assignees=&labels=registry&template=registry-change-request.md&title=).  New profiles should added via [pull requests](#adding-a-profile) to ensure the fastest turnaround.

### Development
In general, this package should be built and tested from the root of the repository using the following command:
> npm run test

To build just this package without running tests, invoke the following command from the root of the repository:
> npm run build -- --scope @webxr-input-profiles/registry

### Licence
See the [LICENSE.md](LICENSE.md).

## Usage

### Getting started
In most cases is it not necessary to install this package. It is only intended for use by User Agents and as an input to the [assets](../assets) package build. However, when necessary, the package can be installed from npm by the following command.

```
npm install @webxr-input-profiles/registry.
```

## Profile prefixes
Each profile has a [unique id](#profile-id-and-fallback-profile-ids) that must begin with a generic or vendor prefix as described in the [WebXR Device API](https://www.w3.org/tr/webxr). Profile JSON files are found in './profiles/[prefix] folders.

### Generic prefix
The "*generic*" prefix is reserved for all profiles not associated with a specific vendor

### Reserved vendor prefixes
The following prefixes are reserved for companies with XR hardware
* *google* - [Google](https://www.google.com)
* *hp* - [Hewlett-Packard](https://www.hp.com)
* *htc* - [HTC](https://www.htc.com/)
* *magicleap* - [Magic Leap](https://www.magicleap.com/)
* *microsoft* - [Microsoft Corp](https://www.microsoft.com/)
* *oculus* - [Oculus](https://www.oculus.com/)
* *samsung* - [Samsung](https://www.samsung.com)
* *valve* - [Valve Corporation](https://www.valvesoftware.com/en/)
* *pico* - [Pico Interactive](https://www.pico-interactive.com/)

## Schema

### Profile id and fallback profile ids
Profiles are required to have a `profileId` that uniquely identifies the profile and must conform to the format specified by the [WebXR Device API](http://www.w3.org/tr/webxr). A `profileId` cannot be changed once added to the registry; if changes are necessary a new `profileId` must be defined. Profiles are also required to have a `fallbackProfileIds` array containing profile ids defined in the registry that are considered acceptable fallback substitutes for the profile. The contents of this array may be modified after the profile has been added to the repository, however changes should be avoided if at all possible due to the potential for conformance mismatches.  Profiles with the `generic` prefix may leave the `fallbackProfileIds` array empty.  All other profiles must have at least one fallback profile id, and the last entry in the array must have the `generic` vendor prefix.

For example
```json
{
    "profileId" : "vendorprefix-profileId",
    "fallbackProfileIds" : ["vendorprefix-otherProfileId", "generic-trigger"]
}
```

The `XRInputSource.profiles` array is comprised of these two properties; the `profileId` is the first element followed by the elements in the `fallbackProfileIds` property.

### Deprecated profile ids
In some cases an input source may have been identified by a non-standard profile id in the past or in some user agents. These can be listed in the `deprecatedProfileIds` array, which will cause those ids to be associated with the correct profile and assets so that user agents advertising the non-standard id still provide users with the right resources.

```json
{
    "profileId" : "vendorprefix-profileid",
    "deprecatedProfileIds" : ["vendorprefix-oldprofileid"]
}
```

User agents should always prefer reporting the standard profile ids, and should not intentionally report deprecated ids, even as a fallback profile. User agents that currently report a deprecated profile id should make an effort to change to the standard profile id instead.

### Layouts
Profiles are required to have a `layouts` property which contains the layouts for each supported `handedness`. The `layouts` property must have one, and only one, of the following arrangements of keys to be considered valid:
* `none`
* `left` and `right`
* `left` and `right` and `none`
* `left-right`
* `left-right` and `none`
* `left-right-none`

For example:
```json
{
    "layouts": {
        "none" : {},
        "left-right": {}
    }
}
```

### Components
Each layout is required to have a `components` property which contains information about all the individual parts of an `XRInputSource`. Components are comprised of a key which uniquely identifies them and a type which describes their behavior. Component keys must not contain spaces at the beginning or end. Currently, the valid types are: `trigger`, `squeeze`, `touchpad`, `thumbstick`, and `button`

Each layout is also required to have a `selectComponentId` property which refers to an entry in the `components` object. This component will cause the WebXR `select`, `selectStart`, and `selectEnd` events to fire.

For example:
```json
{
    "layouts": {
        "left-right": {
            "selectComponentId": "my-hardware-trigger-name",
            "components": {
                "my-hardware-trigger-name": { "type": "trigger" },
                "my-hardware-touchpad-name": { "type": "touchpad" }
            }
        }
    }
}
```

### Gamepads
If an `XRInputSource` will have a non-null `XRInputSource.gamepad`, the profile must contain information which allows all User Agents to report identical data in `Gamepad.mapping`, `Gamepad.buttons`, and `Gamepad.axes`.  These details are enumerated in the layout's `gamepad` property.

The `gamepad.mapping` string must follow the rules laid out in the [WebXR Gamepads Module](https://www.w3.org/tr/webxr-gamepads-module). The `gamepad.buttons` property is an array which matches index-for-index with the web platform's `Gamepad.buttons` array. Each index contains either null or the id of the component from which the data must be populated. The `gamepad.axes` property is an array which matches index-for-index with the web platform's `Gamepad.axes` array. Each index contains either null or the combination of component id and axis from which the data must be populated.

For example:
```json
{
    "layouts": {
        "left-right": {
            "components": {
                "my-hardware-trigger-name": { "type": "trigger" },
                "my-hardware-touchpad-name": { "type": "touchpad" }
            },
            "gamepad" : {
                "mapping" : "xr-standard",
                "buttons" : [
                    "my-hardware-trigger-name",
                    null,
                    "my-hardware-touchpad-name"
                ],
                "axes" : [
                    { "componentId": "my-hardware-touchpad-name", "axis":"xAxis"},
                    { "componentId": "my-hardware-touchpad-name", "axis":"yAxis"}
                ]
            }
        }
    }
}
