from enum import Enum
from typing import Any, Literal, NotRequired, TypedDict

from _camera_ui_tools.camera_ui_sdk import (
    Camera,
    ModelSpec,
    PluginInfo,
    SensorType,
)
from _camera_ui_tools.camera_ui_sdk.internal import PropertyChangedEvent


class ProcessLoadMessage(TypedDict):
    cameras: list[Camera]
    plugin: PluginInfo
    storage: "PluginStorage"


class ProcessMessage(TypedDict):
    type: str
    data: ProcessLoadMessage | None


class ProcessResponse(TypedDict):
    type: str
    error: NotRequired[str | None]


class PLUGIN_STATUS(Enum):
    READY = "ready"
    STARTING = "starting"
    STARTED = "started"
    STOPPING = "stopping"
    STOPPED = "stopped"
    ERROR = "error"
    UNKNOWN = "unknown"
    DISABLED = "disabled"


class PLUGIN_COMMAND(Enum):
    START = "start"
    STOP = "stop"


class PluginStorage(TypedDict):
    installPath: str
    storagePath: str


class StoredSensorData(TypedDict):
    id: str
    type: SensorType
    name: str
    displayName: str
    pluginId: str
    properties: dict[str, Any]
    capabilities: NotRequired[list[str]]
    requiresFrames: NotRequired[bool]
    modelSpec: NotRequired[ModelSpec]


class SensorRefreshedState(TypedDict):
    type: SensorType
    properties: dict[str, Any]
    capabilities: list[str]
    displayName: NotRequired[str]


class SensorAddedEvent(TypedDict):
    cameraId: str
    sensor: StoredSensorData
    state: SensorRefreshedState


class SensorRemovedEvent(TypedDict):
    cameraId: str
    sensorId: str
    sensorType: SensorType


class SensorCapabilitiesChangedEvent(TypedDict):
    cameraId: str
    sensorId: str
    capabilities: list[str]


class SensorDisplayNameChangedEvent(TypedDict):
    cameraId: str
    sensorId: str
    displayName: str


class SensorAssignmentChangedEvent(TypedDict):
    cameraId: str
    pluginId: str
    sensorType: SensorType
    assigned: bool


class SensorEventMessage(TypedDict):
    type: Literal[
        "property:changed",
        "sensor:added",
        "sensor:removed",
        "sensor:displayName:changed",
        "sensor:capabilities:changed",
        "sensor:assignment:changed",
    ]
    data: (
        PropertyChangedEvent
        | SensorAddedEvent
        | SensorRemovedEvent
        | SensorDisplayNameChangedEvent
        | SensorCapabilitiesChangedEvent
        | SensorAssignmentChangedEvent
    )


class CameraEventMessage(TypedDict):
    type: Literal["removed", "updated", "cameraState", "frameWorkerState"]
    data: NotRequired[Camera | bool]
