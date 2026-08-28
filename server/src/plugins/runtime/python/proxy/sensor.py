import time
from typing import Any, Protocol

from _camera_ui_tools.camera_ui_rpc import CloseHandler, RPCClient
from _camera_ui_tools.camera_ui_sdk import (
    Observable,
    SensorHistoryEntry,
    SensorLike,
    SensorPropertyChangeData,
    SensorType,
    Subject,
)
from _camera_ui_tools.camera_ui_sdk.internal import SensorJSON, SensorSourcePatch
from plugins.runtime.python.namespaces import NamespaceManager
from plugins.runtime.python.typings import (
    SensorRefreshedState,
    SensorRegistration,
    StoredSensorData,
)


# Cross-process consumer proxy: caches sensor state from broadcasts, forwards Control writes via RPC.
class SensorProxy(SensorLike):
    def __init__(self, data: StoredSensorData, proxy: RPCClient, owner_namespace: str) -> None:
        self._id = data["id"]
        self._type = data["type"]
        self._name = data["name"]
        self._display_name = data.get("displayName", data["name"])
        self._native_id = data.get("nativeId")
        self._owner_id = data["pluginId"]
        self._assigned_camera_ids: list[str] = list(data.get("assignedCameraIds", []))
        self._assignment_locked = data.get("boundCameraId") is not None
        self._exposed = data.get("exposed", False)
        self._connected = data.get("connected", False)
        self._proxy = proxy
        self._properties: dict[str, Any] = dict(data.get("properties", {}))
        self._capabilities: list[str] = list(data.get("capabilities", []))
        self._rpc_proxy = proxy.create_proxy(owner_namespace)
        self._property_changed_subject: Subject[SensorPropertyChangeData] = Subject()
        self._capabilities_changed_subject: Subject[list[str]] = Subject()
        self._connected_changed_subject: Subject[bool] = Subject()
        self._assignment_changed_subject: Subject[list[str]] = Subject()
        self._event_subscription: CloseHandler | None = None

    @property
    def id(self) -> str:
        return self._id

    @property
    def type(self) -> SensorType:
        return self._type

    @property
    def name(self) -> str:
        return self._name

    @property
    def displayName(self) -> str:
        return self._display_name

    @displayName.setter
    def displayName(self, value: str) -> None:
        self._display_name = value

    @property
    def nativeId(self) -> str | None:
        return self._native_id

    @property
    def pluginId(self) -> str:
        return self._owner_id

    @property
    def assignedCameraIds(self) -> list[str]:
        return self._assigned_camera_ids.copy()

    @property
    def assignmentLocked(self) -> bool:
        return self._assignment_locked

    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def exposed(self) -> bool:
        return self._exposed

    @property
    def capabilities(self) -> list[str]:
        return self._capabilities.copy()

    def hasCapability(self, capability: str) -> bool:
        return capability in self._capabilities

    def getValue(self, property: str) -> Any | None:
        return self._properties.get(property)

    def getValues(self) -> dict[str, Any]:
        return self._properties.copy()

    async def updateValue(self, property: str, value: Any) -> None:
        await self._rpc_proxy.updateValue(property, value)

    @property
    def onPropertyChanged(self) -> Observable[SensorPropertyChangeData]:
        return self._property_changed_subject.as_observable()

    @property
    def onCapabilitiesChanged(self) -> Observable[list[str]]:
        return self._capabilities_changed_subject.as_observable()

    @property
    def onConnectedChanged(self) -> Observable[bool]:
        return self._connected_changed_subject.as_observable()

    @property
    def onAssignmentChanged(self) -> Observable[list[str]]:
        return self._assignment_changed_subject.as_observable()

    def _update_cached_value(self, property: str, value: Any, timestamp: int | None = None) -> None:
        if self._properties.get(property) == value:
            return
        self._properties[property] = value
        self._property_changed_subject.next(
            {
                "property": property,
                "value": value,
                "timestamp": timestamp or int(time.time() * 1000),
            }
        )

    def _set_display_name(self, display_name: str) -> None:
        self._display_name = display_name

    def _update_capabilities(self, capabilities: list[str]) -> None:
        self._capabilities = capabilities
        self._capabilities_changed_subject.next(capabilities)

    def _set_connected(self, connected: bool) -> None:
        if self._connected == connected:
            return
        self._connected = connected
        self._connected_changed_subject.next(connected)

    def _set_assigned_cameras(self, camera_ids: list[str]) -> None:
        self._assigned_camera_ids = list(camera_ids)
        self._assignment_changed_subject.next(self._assigned_camera_ids.copy())

    def _set_exposed(self, exposed: bool) -> None:
        self._exposed = exposed

    def _apply_refreshed_state(self, state: SensorRefreshedState) -> None:
        display_name = state.get("displayName")
        if display_name:
            self._set_display_name(display_name)

        capabilities = list(state.get("capabilities", []))
        if sorted(capabilities) != sorted(self._capabilities):
            self._update_capabilities(capabilities)

        for property, value in state.get("properties", {}).items():
            self._update_cached_value(property, value)

    async def _subscribe_to_events(self) -> None:
        if self._event_subscription is not None:
            return  # Already subscribed

        namespace = NamespaceManager.sensor_event_namespaces(self._id)
        self._event_subscription = await self._proxy.subscribe(
            namespace.sensor_subject, self._handle_sensor_event
        )

    async def _unsubscribe_from_events(self) -> None:
        if self._event_subscription is not None:
            await self._event_subscription()
            self._event_subscription = None

    def _handle_sensor_event(self, event: dict[str, Any]) -> None:
        event_type = event.get("type")
        data = event.get("data", {})

        if event_type == "property:changed":
            self._update_cached_value(data.get("property"), data.get("value"), data.get("timestamp"))

        elif event_type == "sensor:capabilities:changed":
            self._update_capabilities(data.get("capabilities", []))

        elif event_type == "sensor:displayName:changed":
            self._set_display_name(data.get("displayName", self._name))

    def to_stored_data(self) -> StoredSensorData:
        data: StoredSensorData = {
            "id": self._id,
            "type": self._type,
            "name": self._name,
            "displayName": self._display_name,
            "pluginId": self._owner_id,
            "assignedCameraIds": self.assignedCameraIds,
            "exposed": self._exposed,
            "connected": self._connected,
            "properties": self.getValues(),
            "capabilities": self._capabilities,
        }
        if self._native_id:
            data["nativeId"] = self._native_id

        return data

    @property
    def is_available(self) -> bool:
        return self._id != ""


class SensorRegistryInterface(Protocol):
    async def registerSensor(
        self, sensor: SensorJSON, plugin_id: str, options: dict[str, Any] | None = None
    ) -> SensorRegistration: ...
    async def resolveSensor(
        self, sensor: SensorJSON, plugin_id: str, options: dict[str, Any] | None = None
    ) -> str: ...
    async def unregisterSensor(self, sensor_id: str) -> None: ...
    async def updatePropertyValues(self, sensor_id: str, properties: dict[str, Any]) -> None: ...
    async def updateCapabilities(self, sensor_id: str, capabilities: list[str]) -> None: ...
    async def updateModelSpec(self, sensor_id: str, model_spec: dict[str, Any]) -> None: ...
    async def updateSource(self, sensor_id: str, patch: SensorSourcePatch) -> None: ...
    async def getPropertyValue(self, sensor_id: str, property: str) -> Any: ...
    async def getAllPropertyValues(self, sensor_id: str) -> dict[str, Any]: ...
    async def getSensorState(self, sensor_id: str) -> SensorRefreshedState | None: ...
    async def getSensorStates(self) -> dict[str, SensorRefreshedState]: ...
    async def getSensors(self, plugin_id: str | None = None) -> list[StoredSensorData]: ...
    async def getSensorRpc(self, sensor_id: str, plugin_id: str | None = None) -> StoredSensorData | None: ...
    async def setDisplayName(self, sensor_id: str, display_name: str) -> None: ...
    async def getSensorHistory(
        self, sensor_ids: list[str], start: int, end: int
    ) -> list[SensorHistoryEntry]: ...


class DetectionCoordinatorRPC(Protocol):
    async def reportSensorWrite(
        self, sensor_id: str, sensor_type: SensorType, properties: dict[str, Any]
    ) -> None: ...
