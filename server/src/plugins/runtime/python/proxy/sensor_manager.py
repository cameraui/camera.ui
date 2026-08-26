from __future__ import annotations

import contextlib
from typing import TYPE_CHECKING, Any, cast

from _camera_ui_tools.camera_ui_common import TaskSet
from _camera_ui_tools.camera_ui_sdk import (
    BasePlugin,
    RegisteredSensorInfo,
    Sensor,
    SensorHistoryEntry,
    SensorLike,
    SensorType,
)
from plugins.runtime.python.namespaces import NamespaceManager
from plugins.runtime.python.proxy.limiter import registration_slot
from plugins.runtime.python.proxy.sensor import (
    DetectionCoordinatorRPC,
    SensorProxy,
    SensorRegistryInterface,
)

if TYPE_CHECKING:
    from _camera_ui_tools.camera_ui_common import LoggerService
    from _camera_ui_tools.camera_ui_rpc import CloseHandler, RPCClient
    from plugins.runtime.python.storage_controller import StorageController
    from plugins.runtime.python.typings import (
        PluginInfo,
        SensorAddedEvent,
        SensorAssignmentChangedEvent,
        SensorConnectedChangedEvent,
        SensorDeletedEvent,
        SensorEventMessage,
        SensorExposedChangedEvent,
        StoredSensorData,
    )

DETECTION_SENSOR_TYPES: frozenset[SensorType] = frozenset(
    {
        SensorType.Motion,
        SensorType.Audio,
        SensorType.Object,
        SensorType.ObjectAssist,
        SensorType.Face,
        SensorType.LicensePlate,
        SensorType.Classifier,
        SensorType.Clip,
    }
)


class SensorManagerProxy:
    def __init__(
        self,
        proxy: RPCClient,
        storage_controller: StorageController,
        plugin: PluginInfo,
        logger: LoggerService,
    ) -> None:
        self._proxy = proxy
        self._storage_controller = storage_controller
        self._plugin = plugin
        self._logger = logger
        self._plugin_instance: BasePlugin | None = None

        self._owned: dict[str, Sensor[Any, Any, Any]] = {}
        self._cleanups: dict[str, CloseHandler] = {}
        self._external: dict[str, Sensor[Any, Any, Any]] = {}
        self._consumed: dict[str, SensorProxy] = {}
        self._global_unsubscribe: CloseHandler | None = None
        self._closed = False

        self._tasks = TaskSet(name=f"SensorManager:{plugin['id']}")

    def set_plugin(self, plugin: BasePlugin) -> None:
        self._plugin_instance = plugin

    @property
    def _registry_proxy(self) -> SensorRegistryInterface:
        ns = NamespaceManager.sensor_registry_namespaces()
        return self._proxy.create_proxy(ns.sensors_rpc)

    @property
    def _consumes_something(self) -> bool:
        return len(self._plugin["contract"].get("consumes", [])) > 0

    async def init(self) -> None:
        if not self._consumes_something:
            return

        await self._ensure_global_subscription()

        try:
            sensors = await self._registry_proxy.getSensors(self._plugin["id"])
            for data in sensors:
                if not self._is_consumable(data):
                    continue
                self._add_consumed(data)
        except Exception:
            # registry not reachable yet, sensors arrive via events
            pass

        for sensor_proxy in self._consumed.values():
            await sensor_proxy._subscribe_to_events()  # pyright: ignore[reportPrivateUsage]

        if self._plugin_instance:
            await self._plugin_instance.configureSensors(
                cast("list[SensorLike]", list(self._consumed.values()))
            )

    async def addSensor(self, sensor: Sensor[Any, Any, Any]) -> None:
        async with registration_slot():
            await self._addSensorInner(sensor)

    async def _addSensorInner(self, sensor: Sensor[Any, Any, Any]) -> None:
        # producers need the global stream too: assignment changes must reach
        # owned sensors, their detection fan-out reads assignedCameraIds
        await self._ensure_global_subscription()

        plugin_id = self._plugin["id"]
        sensor._setPluginId(plugin_id)  # pyright: ignore[reportPrivateUsage]

        sensor_json = sensor.toJSON()
        sensor_json["requiresFrames"] = getattr(sensor, "_requires_frames", False) is True

        # resolve the durable id first and wire storage with it, so registration
        # data (modelSpec) can read sensor storage
        sensor_id = await self._registry_proxy.resolveSensor(sensor_json, plugin_id)
        sensor._setId(sensor_id)  # pyright: ignore[reportPrivateUsage]
        sensor_json["id"] = sensor_id

        storage = self._storage_controller.createSensorStorage(plugin_id, sensor.id, sensor.storage_schema)
        await storage.register_storage()
        sensor._setStorage(storage)  # pyright: ignore[reportPrivateUsage]

        model_spec = getattr(sensor, "modelSpec", None)
        if model_spec:
            sensor_json["modelSpec"] = model_spec

        registration = await self._registry_proxy.registerSensor(sensor_json, plugin_id)
        sensor._setAssignedCameras(registration["assignedCameraIds"])  # pyright: ignore[reportPrivateUsage]

        sensor_namespace = NamespaceManager.sensor_provider_namespaces(plugin_id, sensor.id).sensor_rpc

        sensor_type = sensor.type
        sensor._init(  # pyright: ignore[reportPrivateUsage]
            lambda properties: self._on_sensor_state_write(sensor, sensor_type, properties)
        )
        sensor._initCapabilities(lambda caps: self._on_sensor_capabilities_changed(sensor.id, caps))  # pyright: ignore[reportPrivateUsage]

        rpc_cleanup = await self._proxy.register_handler(sensor_namespace, sensor, without_decorators=True)

        event_ns = NamespaceManager.sensor_event_namespaces(sensor.id)

        async def handle_backend_event(event: dict[str, Any]) -> None:
            if event.get("type") == "property:changed":
                change_data = event.get("data", {})
                prop = change_data.get("property")
                if prop is not None:
                    sensor._onBackendPropertyChanged(  # pyright: ignore[reportPrivateUsage]
                        prop, change_data.get("value"), change_data.get("timestamp")
                    )

        unsubscribe_events = await self._proxy.subscribe(event_ns.sensor_subject, handle_backend_event)

        async def cleanup() -> None:
            await unsubscribe_events()
            await rpc_cleanup()

        self._owned[sensor.id] = sensor
        self._cleanups[sensor.id] = cleanup

        sensor._setActive(True)  # pyright: ignore[reportPrivateUsage]

    async def removeSensor(self, sensor: Sensor[Any, Any, Any]) -> None:
        try:
            await self._registry_proxy.unregisterSensor(sensor.id)
        except Exception as e:
            self._logger.warn(f"Failed to unregister sensor {sensor.id}: {e}")

        cleanup = self._cleanups.pop(sensor.id, None)
        if cleanup:
            await cleanup()

        self._owned.pop(sensor.id, None)
        sensor._cleanup()  # pyright: ignore[reportPrivateUsage]

    def getSensors(self) -> list[Sensor[Any, Any, Any]]:
        return list(self._owned.values())

    async def getRegisteredSensors(self) -> list[RegisteredSensorInfo]:
        plugin_id = self._plugin["id"]
        stored = await self._registry_proxy.getSensors(plugin_id)
        result: list[RegisteredSensorInfo] = []
        for data in stored:
            if data.get("pluginId") != plugin_id:
                continue
            info: RegisteredSensorInfo = {
                "id": data["id"],
                "type": data["type"],
                "name": data["name"],
                "connected": data["connected"],
            }
            native_id = data.get("nativeId")
            if native_id is not None:
                info["nativeId"] = native_id
            result.append(info)
        return result

    async def getSensorHistory(self, sensorIds: list[str], start: int, end: int) -> list[SensorHistoryEntry]:
        return await self._registry_proxy.getSensorHistory(sensorIds, start, end)

    # keeps a camera-registered sensor's assignedCameraIds in sync with the global stream
    async def track_camera_sensor(self, sensor: Sensor[Any, Any, Any]) -> None:
        await self._ensure_global_subscription()
        self._external[sensor.id] = sensor

    def untrack_camera_sensor(self, sensor_id: str) -> None:
        self._external.pop(sensor_id, None)

    def on_rpc_reconnected(self) -> None:
        if self._closed:
            return
        self._tasks.add(self._resync_all_consumed())

    async def close(self) -> None:
        self._closed = True

        if self._global_unsubscribe:
            with contextlib.suppress(Exception):
                await self._global_unsubscribe()
            self._global_unsubscribe = None

        for sensor_proxy in self._consumed.values():
            with contextlib.suppress(Exception):
                await sensor_proxy._unsubscribe_from_events()  # pyright: ignore[reportPrivateUsage]
        self._consumed.clear()
        self._external.clear()

        for cleanup in list(self._cleanups.values()):
            with contextlib.suppress(Exception):
                await cleanup()
        self._cleanups.clear()

        for sensor in self._owned.values():
            sensor._cleanup()  # pyright: ignore[reportPrivateUsage]
        self._owned.clear()

        self._tasks.remove_all()

    async def _ensure_global_subscription(self) -> None:
        if self._global_unsubscribe is not None:
            return

        ns = NamespaceManager.sensor_registry_namespaces()
        self._global_unsubscribe = await self._proxy.subscribe(
            ns.sensors_subject, self._on_global_sensor_event
        )

    async def _resync_all_consumed(self) -> None:
        for sensor_id in list(self._consumed):
            await self._resync_consumed(sensor_id)

    async def _resync_consumed(self, sensor_id: str) -> None:
        sensor_proxy = self._consumed.get(sensor_id)
        if not sensor_proxy:
            return

        try:
            state = await self._registry_proxy.getSensorState(sensor_id)
        except Exception:
            # owner or registry unreachable, the next re-announce carries the state
            return

        if state:
            sensor_proxy._apply_refreshed_state(state)  # pyright: ignore[reportPrivateUsage]

    def _is_consumable(self, data: StoredSensorData) -> bool:
        if data["id"] in self._owned or data["pluginId"] == self._plugin["id"]:
            return False
        if not data.get("exposed", False):
            return False
        return data["type"] in self._plugin["contract"].get("consumes", [])

    def _add_consumed(self, data: StoredSensorData) -> SensorProxy:
        owner_namespace = NamespaceManager.sensor_provider_namespaces(data["pluginId"], data["id"]).sensor_rpc
        sensor_proxy = SensorProxy(data, self._proxy, owner_namespace)
        self._consumed[data["id"]] = sensor_proxy
        return sensor_proxy

    async def _release_consumed(self, sensor_id: str) -> None:
        sensor_proxy = self._consumed.pop(sensor_id, None)
        if not sensor_proxy:
            return

        with contextlib.suppress(Exception):
            await sensor_proxy._unsubscribe_from_events()  # pyright: ignore[reportPrivateUsage]

        if self._plugin_instance:
            with contextlib.suppress(Exception):
                await self._plugin_instance.onSensorReleased(sensor_id)

    def _on_global_sensor_event(self, message: SensorEventMessage) -> None:
        async def handle() -> None:
            try:
                await self._handle_global_sensor_event(message)
            except Exception as e:
                self._logger.warn(f"Sensor event handling failed: {e}")

        self._tasks.add(handle())

    async def _handle_global_sensor_event(self, message: SensorEventMessage) -> None:
        event_type = message.get("type")

        if event_type == "sensor:added":
            added = cast("SensorAddedEvent", message.get("data"))
            data = added["sensor"]
            for owned in (self._owned.get(data["id"]), self._external.get(data["id"])):
                if owned:
                    owned._setAssignedCameras(data["assignedCameraIds"])  # pyright: ignore[reportPrivateUsage]
            consumed = self._consumed.get(data["id"])
            if consumed is not None:
                # re-announced while we already hold it: the payload is authoritative, our cache may be stale
                consumed._apply_refreshed_state(added["state"])  # pyright: ignore[reportPrivateUsage]
                return
            if not self._is_consumable(data):
                return
            sensor_proxy = self._add_consumed(data)
            await sensor_proxy._subscribe_to_events()  # pyright: ignore[reportPrivateUsage]
            if self._plugin_instance:
                await self._plugin_instance.onSensorAdded(sensor_proxy)

        elif event_type == "sensor:deleted":
            deleted = cast("SensorDeletedEvent", message.get("data"))
            await self._release_consumed(deleted["sensorId"])

        elif event_type == "sensor:connected:changed":
            connected = cast("SensorConnectedChangedEvent", message.get("data"))
            consumed = self._consumed.get(connected["sensorId"])
            if consumed:
                consumed._set_connected(connected["connected"])  # pyright: ignore[reportPrivateUsage]
                if connected["connected"]:
                    # the owner was away, whatever it published in the meantime never reached us
                    self._tasks.add(self._resync_consumed(connected["sensorId"]))

        elif event_type == "sensor:exposed:changed":
            exposed = cast("SensorExposedChangedEvent", message.get("data"))
            if not exposed["exposed"]:
                await self._release_consumed(exposed["sensorId"])
                return
            if exposed["sensorId"] in self._consumed:
                return
            fetched = await self._registry_proxy.getSensorRpc(exposed["sensorId"], self._plugin["id"])
            if not fetched or not self._is_consumable(fetched):
                return
            sensor_proxy = self._add_consumed(fetched)
            await sensor_proxy._subscribe_to_events()  # pyright: ignore[reportPrivateUsage]
            if self._plugin_instance:
                await self._plugin_instance.onSensorAdded(sensor_proxy)

        elif event_type == "sensor:assignment:changed":
            assignment = cast("SensorAssignmentChangedEvent", message.get("data"))
            targets: list[Sensor[Any, Any, Any] | SensorProxy] = []
            for candidate in (
                self._owned.get(assignment["sensorId"]),
                self._external.get(assignment["sensorId"]),
                self._consumed.get(assignment["sensorId"]),
            ):
                if candidate is not None:
                    targets.append(candidate)
            for target in targets:
                cameras = set(target.assignedCameraIds)
                if assignment["assigned"]:
                    cameras.add(assignment["cameraId"])
                else:
                    cameras.discard(assignment["cameraId"])
                if isinstance(target, SensorProxy):
                    target._set_assigned_cameras(list(cameras))  # pyright: ignore[reportPrivateUsage]
                else:
                    target._setAssignedCameras(list(cameras))  # pyright: ignore[reportPrivateUsage]

    def _on_sensor_state_write(
        self,
        sensor: Sensor[Any, Any, Any],
        sensor_type: SensorType,
        properties: dict[str, Any],
    ) -> None:
        if sensor_type in DETECTION_SENSOR_TYPES:
            # the spec belongs to the registry, it reaches the coordinators from there
            model_spec = properties.get("modelSpec")
            if model_spec is not None:
                properties = {k: v for k, v in properties.items() if k != "modelSpec"}

                async def notify_spec() -> None:
                    with contextlib.suppress(Exception):
                        await self._registry_proxy.updateModelSpec(sensor.id, model_spec)

                self._tasks.add(notify_spec())
                if not properties:
                    return

            # external detection provider: fan the write into every assigned camera's coordinator
            async def notify_coordinators() -> None:
                for camera_id in sensor.assignedCameraIds:
                    detection_ns = NamespaceManager.frame_worker_detection_namespaces(camera_id)
                    coordinator: DetectionCoordinatorRPC = self._proxy.create_proxy(
                        detection_ns.detection_rpc
                    )
                    with contextlib.suppress(Exception):
                        await coordinator.reportSensorWrite(sensor.id, sensor_type, properties)

            self._tasks.add(notify_coordinators())
            return

        async def notify_registry() -> None:
            with contextlib.suppress(Exception):
                await self._registry_proxy.updatePropertyValues(sensor.id, properties)

        self._tasks.add(notify_registry())

    def _on_sensor_capabilities_changed(self, sensor_id: str, capabilities: list[str]) -> None:
        async def notify() -> None:
            with contextlib.suppress(Exception):
                await self._registry_proxy.updateCapabilities(sensor_id, capabilities)

        self._tasks.add(notify())
