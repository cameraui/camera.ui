from enum import Enum
from typing import Any, Literal, NotRequired, TypedDict

from _camera_ui_tools.camera_ui_sdk import (
    Camera,
    ModelSpec,
    PluginInfo,
    SensorSourceState,
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
    nativeId: NotRequired[str]
    pluginId: str
    assignedCameraIds: list[str]
    boundCameraId: NotRequired[str]
    exposed: bool
    origin: NotRequired[str]
    address: NotRequired[str]
    sourceState: NotRequired[SensorSourceState]
    connected: bool
    properties: dict[str, Any]
    capabilities: NotRequired[list[str]]
    requiresFrames: NotRequired[bool]
    modelSpec: NotRequired[ModelSpec]


class SensorRegistration(TypedDict):
    id: str
    assignedCameraIds: list[str]
    active: bool


class SensorRefreshedState(TypedDict):
    type: SensorType
    properties: dict[str, Any]
    capabilities: list[str]
    displayName: NotRequired[str]


class SensorAddedEvent(TypedDict):
    sensor: StoredSensorData
    state: SensorRefreshedState


class SensorAdoptedEvent(TypedDict):
    sensor: StoredSensorData


class SensorSourceChangedEvent(TypedDict):
    sensorId: str
    sourceState: NotRequired[SensorSourceState]
    address: NotRequired[str]


class SensorDeletedEvent(TypedDict):
    sensorId: str
    sensorType: SensorType


class SensorConnectedChangedEvent(TypedDict):
    sensorId: str
    sensorType: SensorType
    connected: bool


class SensorCapabilitiesChangedEvent(TypedDict):
    sensorId: str
    capabilities: list[str]


class SensorDisplayNameChangedEvent(TypedDict):
    sensorId: str
    displayName: str


class SensorExposedChangedEvent(TypedDict):
    sensorId: str
    sensorType: SensorType
    exposed: bool


class SensorAssignmentChangedEvent(TypedDict):
    sensorId: str
    sensorType: SensorType
    cameraId: str
    assigned: bool


class SensorEventMessage(TypedDict):
    type: Literal[
        "property:changed",
        "sensor:added",
        "sensor:adopted",
        "sensor:source:changed",
        "sensor:deleted",
        "sensor:connected:changed",
        "sensor:displayName:changed",
        "sensor:capabilities:changed",
        "sensor:assignment:changed",
        "sensor:exposed:changed",
    ]
    data: (
        PropertyChangedEvent
        | SensorAddedEvent
        | SensorAdoptedEvent
        | SensorSourceChangedEvent
        | SensorDeletedEvent
        | SensorConnectedChangedEvent
        | SensorDisplayNameChangedEvent
        | SensorCapabilitiesChangedEvent
        | SensorAssignmentChangedEvent
        | SensorExposedChangedEvent
    )


class CameraEventMessage(TypedDict):
    type: Literal["removed", "updated", "cameraState", "frameWorkerState"]
    data: NotRequired[Camera | bool]
