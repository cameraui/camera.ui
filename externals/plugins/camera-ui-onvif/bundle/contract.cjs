"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// contract.ts
var contract_exports = {};
__export(contract_exports, {
  contract: () => contract,
  default: () => contract_default
});
module.exports = __toCommonJS(contract_exports);

// node_modules/@camera.ui/sdk/dist/plugin/api.js
var API_EVENT;
(function(API_EVENT2) {
  API_EVENT2["FINISH_LAUNCHING"] = "finishLaunching";
  API_EVENT2["SHUTDOWN"] = "shutdown";
})(API_EVENT || (API_EVENT = {}));

// node_modules/@camera.ui/sdk/dist/plugin/contract.js
var PluginRole;
(function(PluginRole2) {
  PluginRole2["Hub"] = "hub";
  PluginRole2["SensorProvider"] = "sensorProvider";
  PluginRole2["CameraController"] = "cameraController";
  PluginRole2["CameraAndSensorProvider"] = "cameraAndSensorProvider";
})(PluginRole || (PluginRole = {}));
var PluginInterface;
(function(PluginInterface2) {
  PluginInterface2["MotionDetection"] = "MotionDetection";
  PluginInterface2["ObjectDetection"] = "ObjectDetection";
  PluginInterface2["AudioDetection"] = "AudioDetection";
  PluginInterface2["FaceDetection"] = "FaceDetection";
  PluginInterface2["LicensePlateDetection"] = "LicensePlateDetection";
  PluginInterface2["ClassifierDetection"] = "ClassifierDetection";
  PluginInterface2["ClipDetection"] = "ClipDetection";
  PluginInterface2["DiscoveryProvider"] = "DiscoveryProvider";
  PluginInterface2["NVR"] = "NVR";
  PluginInterface2["Notifier"] = "Notifier";
  PluginInterface2["OAuthCapable"] = "OAuthCapable";
  PluginInterface2["OAuthDeviceFlow"] = "OAuthDeviceFlow";
  PluginInterface2["OAuthAuthCodeFlow"] = "OAuthAuthCodeFlow";
  PluginInterface2["OAuthClientCredentials"] = "OAuthClientCredentials";
})(PluginInterface || (PluginInterface = {}));
var PluginCapability;
(function(PluginCapability2) {
  PluginCapability2["PublishNotifications"] = "publishNotifications";
})(PluginCapability || (PluginCapability = {}));

// node_modules/@camera.ui/sdk/dist/plugin/notifier.js
var Severity;
(function(Severity2) {
  Severity2["Info"] = "info";
  Severity2["Warn"] = "warn";
  Severity2["Error"] = "error";
  Severity2["Critical"] = "critical";
})(Severity || (Severity = {}));

// node_modules/@camera.ui/sdk/dist/sensor/base.js
var SensorType;
(function(SensorType2) {
  SensorType2["Motion"] = "motion";
  SensorType2["Object"] = "object";
  SensorType2["Audio"] = "audio";
  SensorType2["Face"] = "face";
  SensorType2["LicensePlate"] = "licensePlate";
  SensorType2["Classifier"] = "classifier";
  SensorType2["Clip"] = "clip";
  SensorType2["Contact"] = "contact";
  SensorType2["Temperature"] = "temperature";
  SensorType2["Humidity"] = "humidity";
  SensorType2["Occupancy"] = "occupancy";
  SensorType2["Smoke"] = "smoke";
  SensorType2["Leak"] = "leak";
  SensorType2["Light"] = "light";
  SensorType2["Siren"] = "siren";
  SensorType2["Switch"] = "switch";
  SensorType2["Lock"] = "lock";
  SensorType2["PTZ"] = "ptz";
  SensorType2["SecuritySystem"] = "securitySystem";
  SensorType2["Garage"] = "garage";
  SensorType2["Doorbell"] = "doorbell";
  SensorType2["Battery"] = "battery";
})(SensorType || (SensorType = {}));
var SensorCategory;
(function(SensorCategory2) {
  SensorCategory2["Sensor"] = "sensor";
  SensorCategory2["Control"] = "control";
  SensorCategory2["Trigger"] = "trigger";
  SensorCategory2["Info"] = "info";
})(SensorCategory || (SensorCategory = {}));

// node_modules/@camera.ui/sdk/dist/sensor/audio.js
var AudioProperty;
(function(AudioProperty2) {
  AudioProperty2["Detected"] = "detected";
  AudioProperty2["Detections"] = "detections";
  AudioProperty2["Decibels"] = "decibels";
  AudioProperty2["LastTriggered"] = "lastTriggered";
})(AudioProperty || (AudioProperty = {}));

// node_modules/@camera.ui/sdk/dist/sensor/battery.js
var BatteryCapability;
(function(BatteryCapability2) {
  BatteryCapability2["LowBattery"] = "lowBattery";
  BatteryCapability2["Charging"] = "charging";
})(BatteryCapability || (BatteryCapability = {}));
var BatteryProperty;
(function(BatteryProperty2) {
  BatteryProperty2["Level"] = "level";
  BatteryProperty2["Charging"] = "charging";
  BatteryProperty2["Low"] = "low";
})(BatteryProperty || (BatteryProperty = {}));
var ChargingState;
(function(ChargingState2) {
  ChargingState2["NotChargeable"] = "NOT_CHARGEABLE";
  ChargingState2["NotCharging"] = "NOT_CHARGING";
  ChargingState2["Charging"] = "CHARGING";
  ChargingState2["Full"] = "FULL";
})(ChargingState || (ChargingState = {}));

// node_modules/@camera.ui/sdk/dist/sensor/classifier.js
var ClassifierProperty;
(function(ClassifierProperty2) {
  ClassifierProperty2["Detected"] = "detected";
  ClassifierProperty2["Detections"] = "detections";
  ClassifierProperty2["Labels"] = "labels";
})(ClassifierProperty || (ClassifierProperty = {}));

// node_modules/@camera.ui/sdk/dist/sensor/contact.js
var ContactProperty;
(function(ContactProperty2) {
  ContactProperty2["Detected"] = "detected";
})(ContactProperty || (ContactProperty = {}));

// node_modules/@camera.ui/sdk/dist/sensor/doorbell.js
var DoorbellProperty;
(function(DoorbellProperty2) {
  DoorbellProperty2["Ring"] = "ring";
})(DoorbellProperty || (DoorbellProperty = {}));

// node_modules/@camera.ui/sdk/dist/sensor/face.js
var FaceProperty;
(function(FaceProperty2) {
  FaceProperty2["Detected"] = "detected";
  FaceProperty2["Detections"] = "detections";
})(FaceProperty || (FaceProperty = {}));

// node_modules/@camera.ui/sdk/dist/sensor/garage.js
var GarageState;
(function(GarageState2) {
  GarageState2[GarageState2["Open"] = 0] = "Open";
  GarageState2[GarageState2["Closed"] = 1] = "Closed";
  GarageState2[GarageState2["Opening"] = 2] = "Opening";
  GarageState2[GarageState2["Closing"] = 3] = "Closing";
  GarageState2[GarageState2["Stopped"] = 4] = "Stopped";
})(GarageState || (GarageState = {}));
var GarageProperty;
(function(GarageProperty2) {
  GarageProperty2["CurrentState"] = "currentState";
  GarageProperty2["TargetState"] = "targetState";
  GarageProperty2["ObstructionDetected"] = "obstructionDetected";
})(GarageProperty || (GarageProperty = {}));

// node_modules/@camera.ui/sdk/dist/sensor/humidity.js
var HumidityProperty;
(function(HumidityProperty2) {
  HumidityProperty2["Current"] = "current";
})(HumidityProperty || (HumidityProperty = {}));

// node_modules/@camera.ui/sdk/dist/sensor/leak.js
var LeakProperty;
(function(LeakProperty2) {
  LeakProperty2["Detected"] = "detected";
})(LeakProperty || (LeakProperty = {}));

// node_modules/@camera.ui/sdk/dist/sensor/licensePlate.js
var LicensePlateProperty;
(function(LicensePlateProperty2) {
  LicensePlateProperty2["Detected"] = "detected";
  LicensePlateProperty2["Detections"] = "detections";
})(LicensePlateProperty || (LicensePlateProperty = {}));

// node_modules/@camera.ui/sdk/dist/sensor/light.js
var LightCapability;
(function(LightCapability2) {
  LightCapability2["Brightness"] = "brightness";
})(LightCapability || (LightCapability = {}));
var LightProperty;
(function(LightProperty2) {
  LightProperty2["On"] = "on";
  LightProperty2["Brightness"] = "brightness";
})(LightProperty || (LightProperty = {}));

// node_modules/@camera.ui/sdk/dist/sensor/lock.js
var LockState;
(function(LockState2) {
  LockState2[LockState2["Secured"] = 0] = "Secured";
  LockState2[LockState2["Unsecured"] = 1] = "Unsecured";
  LockState2[LockState2["Unknown"] = 2] = "Unknown";
})(LockState || (LockState = {}));
var LockProperty;
(function(LockProperty2) {
  LockProperty2["CurrentState"] = "currentState";
  LockProperty2["TargetState"] = "targetState";
})(LockProperty || (LockProperty = {}));

// node_modules/@camera.ui/sdk/dist/sensor/motion.js
var MotionProperty;
(function(MotionProperty2) {
  MotionProperty2["Detected"] = "detected";
  MotionProperty2["Detections"] = "detections";
  MotionProperty2["Blocked"] = "blocked";
  MotionProperty2["LastTriggered"] = "lastTriggered";
})(MotionProperty || (MotionProperty = {}));

// node_modules/@camera.ui/sdk/dist/sensor/object.js
var ObjectProperty;
(function(ObjectProperty2) {
  ObjectProperty2["Detected"] = "detected";
  ObjectProperty2["Detections"] = "detections";
  ObjectProperty2["Labels"] = "labels";
})(ObjectProperty || (ObjectProperty = {}));

// node_modules/@camera.ui/sdk/dist/sensor/occupancy.js
var OccupancyProperty;
(function(OccupancyProperty2) {
  OccupancyProperty2["Detected"] = "detected";
})(OccupancyProperty || (OccupancyProperty = {}));

// node_modules/@camera.ui/sdk/dist/sensor/ptz.js
var PTZCapability;
(function(PTZCapability2) {
  PTZCapability2["Pan"] = "pan";
  PTZCapability2["Tilt"] = "tilt";
  PTZCapability2["Zoom"] = "zoom";
  PTZCapability2["Presets"] = "presets";
  PTZCapability2["Home"] = "home";
})(PTZCapability || (PTZCapability = {}));
var PTZProperty;
(function(PTZProperty2) {
  PTZProperty2["Position"] = "position";
  PTZProperty2["Moving"] = "moving";
  PTZProperty2["Presets"] = "presets";
  PTZProperty2["Velocity"] = "velocity";
  PTZProperty2["TargetPreset"] = "targetPreset";
})(PTZProperty || (PTZProperty = {}));

// node_modules/@camera.ui/sdk/dist/sensor/securitySystem.js
var SecuritySystemState;
(function(SecuritySystemState2) {
  SecuritySystemState2[SecuritySystemState2["StayArm"] = 0] = "StayArm";
  SecuritySystemState2[SecuritySystemState2["AwayArm"] = 1] = "AwayArm";
  SecuritySystemState2[SecuritySystemState2["NightArm"] = 2] = "NightArm";
  SecuritySystemState2[SecuritySystemState2["Disarmed"] = 3] = "Disarmed";
  SecuritySystemState2[SecuritySystemState2["AlarmTriggered"] = 4] = "AlarmTriggered";
})(SecuritySystemState || (SecuritySystemState = {}));
var SecuritySystemProperty;
(function(SecuritySystemProperty2) {
  SecuritySystemProperty2["CurrentState"] = "currentState";
  SecuritySystemProperty2["TargetState"] = "targetState";
})(SecuritySystemProperty || (SecuritySystemProperty = {}));

// node_modules/@camera.ui/sdk/dist/sensor/siren.js
var SirenCapability;
(function(SirenCapability2) {
  SirenCapability2["Volume"] = "volume";
})(SirenCapability || (SirenCapability = {}));
var SirenProperty;
(function(SirenProperty2) {
  SirenProperty2["Active"] = "active";
  SirenProperty2["Volume"] = "volume";
})(SirenProperty || (SirenProperty = {}));

// node_modules/@camera.ui/sdk/dist/sensor/smoke.js
var SmokeProperty;
(function(SmokeProperty2) {
  SmokeProperty2["Detected"] = "detected";
})(SmokeProperty || (SmokeProperty = {}));

// node_modules/@camera.ui/sdk/dist/sensor/switch.js
var SwitchProperty;
(function(SwitchProperty2) {
  SwitchProperty2["On"] = "on";
})(SwitchProperty || (SwitchProperty = {}));

// node_modules/@camera.ui/sdk/dist/sensor/temperature.js
var TemperatureProperty;
(function(TemperatureProperty2) {
  TemperatureProperty2["Current"] = "current";
})(TemperatureProperty || (TemperatureProperty = {}));

// contract.ts
var contract = {
  name: "Onvif",
  role: PluginRole.CameraAndSensorProvider,
  provides: [SensorType.PTZ, SensorType.Motion, SensorType.Object, SensorType.Audio, SensorType.Face],
  consumes: [],
  interfaces: [PluginInterface.DiscoveryProvider]
};
var contract_default = contract;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  contract
});
//# sourceMappingURL=contract.cjs.map
