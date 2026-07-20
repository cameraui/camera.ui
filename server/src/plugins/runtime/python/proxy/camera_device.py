from __future__ import annotations

import contextlib
from copy import deepcopy
from typing import TYPE_CHECKING, Any, Protocol, cast

from deepdiff.diff import DeepDiff

from _camera_ui_tools.camera_ui_common import Subscribed, TaskSet
from _camera_ui_tools.camera_ui_rpc import CloseHandler, RPCClient
from _camera_ui_tools.camera_ui_sdk import (
    BehaviorSubject,
    Camera,
    CameraDetectionSettings,
    CameraDeviceSource,
    CameraFrameWorkerSettings,
    CameraImplementation,
    CameraInformation,
    CameraInput,
    CameraPluginInfo,
    CameraPropertyObservableObject,
    CameraPublicProperties,
    CameraRecordingSettings,
    CameraRole,
    CameraSource,
    CameraType,
    CameraUiSettings,
    DetectionEventPayload,
    DetectionLine,
    DetectionZone,
    Disposable,
    LoggerService,
    Observable,
    PluginContract,
    ProbeConfig,
    ProbeStream,
    PtzAutotrackSettings,
    RTSPUrlOptions,
    Sensor,
    SensorEventData,
    SensorLike,
    SensorType,
    SnapshotSettings,
    SnapshotUrlOptions,
    StreamUrls,
    Subject,
    distinct_until_changed,
    filter_op,
    merge_map,
    pairwise,
    share,
)
from _camera_ui_tools.camera_ui_sdk import CameraDevice as CameraDeviceInterface
from _camera_ui_tools.camera_ui_sdk.internal import SensorJSON
from plugins.runtime.python.camera.utils import build_snapshot_url, build_target_url
from plugins.runtime.python.namespaces import (
    CameraNamespaces,
    FrameWorkerDetectionNamespaces,
    FrameWorkerNamespaces,
    NamespaceManager,
    PluginCameraNamespaces,
    SensorControllerNamespaces,
)
from plugins.runtime.python.proxy.sensor import (
    DetectionCoordinatorRPC,
    SensorControllerInterface,
    SensorProxy,
)
from plugins.runtime.python.remote_urls import rewrite_source_urls_for_remote
from plugins.runtime.python.typings import (
    CameraEventMessage,
    PluginInfo,
    SensorAddedEvent,
    SensorAssignmentChangedEvent,
    SensorEventMessage,
    SensorRemovedEvent,
    StoredSensorData,
)

if TYPE_CHECKING:
    from plugins.runtime.python.storage_controller import StorageController


DETECTION_SENSOR_TYPES: frozenset[SensorType] = frozenset(
    {
        SensorType.Motion,
        SensorType.Audio,
        SensorType.Object,
        SensorType.Face,
        SensorType.LicensePlate,
        SensorType.Classifier,
    }
)


class CameraControllerInterface(Protocol):
    async def connect(self) -> None: ...
    async def disconnect(self) -> None: ...
    async def snapshot(self, source_id: str, force_new: bool | None = None) -> bytes | None: ...
    async def probeStream(
        self,
        source_id: str,
        probe_config: ProbeConfig | None = None,
        refresh: bool | None = False,
    ) -> ProbeStream | None: ...
    async def refreshStates(self) -> dict[str, Any]: ...
    async def registerSensor(self, sensor: SensorJSON, plugin_id: str) -> bool: ...
    async def unregisterSensor(self, sensor_id: str) -> None: ...
    async def streamUrl(self, source_id: str) -> str | None: ...
    async def getStreamStatus(self, source_id: str) -> str: ...


class CameraSourceImpl(CameraSource):
    def __init__(self, source: CameraInput, parent: CameraDeviceProxy) -> None:
        self._parent = parent
        self._id: str = source["_id"]
        self.name: str = source["name"]
        self.role: CameraRole = source["role"]
        self.useForSnapshot: bool = source["useForSnapshot"]
        self.hotMode: bool = source["hotMode"]
        self.preload: bool = source["preload"]
        self.muted: bool | None = source.get("muted")
        self.urls: StreamUrls = source["urls"]
        self.childSourceId: str | None = source.get("childSourceId")

    async def snapshot(self, forceNew: bool | None = None) -> bytes | None:
        return await self._parent._snapshot(self._id, forceNew)  # pyright: ignore[reportPrivateUsage]

    async def probeStream(
        self, probeConfig: ProbeConfig | None = None, refresh: bool | None = False
    ) -> ProbeStream | None:
        return await self._parent._probe_stream(self._id, probeConfig, refresh)  # pyright: ignore[reportPrivateUsage]

    async def getStreamStatus(self) -> str:
        return await self._parent._get_stream_status(self._id)  # pyright: ignore[reportPrivateUsage]


class CameraDeviceSourceImpl(CameraSourceImpl, CameraDeviceSource):
    def generateRTSPUrl(self, options: RTSPUrlOptions | None = None) -> str:
        return build_target_url(self.urls["rtsp"]["base"], options)

    def generateSnapshotUrl(self, options: SnapshotUrlOptions | None = None) -> str:
        return build_snapshot_url(self._parent.name, self.name, self.urls["snapshot"]["jpeg"], options)


class CameraDeviceProxy(Subscribed, CameraDeviceInterface):
    def __init__(
        self,
        proxy: RPCClient,
        storage_controller: StorageController,
        camera: Camera,
        plugin: PluginInfo,
        logger: LoggerService,
    ) -> None:
        super().__init__()

        self._camera_subject = BehaviorSubject(camera)
        self._camera_state = BehaviorSubject[bool](False)
        self._frame_worker_state = BehaviorSubject[bool](False)
        self._initialized = BehaviorSubject[bool](False)

        self._onConnected: Observable[bool] = self._create_state_observable(self._camera_state)
        self._onFrameworkerConnected: Observable[bool] = self._create_state_observable(
            self._frame_worker_state
        )

        self._logger = logger
        self._proxy = proxy
        self._plugin = plugin
        self._contract: PluginContract = plugin["contract"]
        self._storage_controller: StorageController = storage_controller

        self._sensor_added_subject: Subject[SensorEventData] = Subject()
        self._sensor_removed_subject: Subject[SensorEventData] = Subject()
        self._detection_event_subject: Subject[DetectionEventPayload] = Subject()

        self._close_subscription: CloseHandler | None = None
        self._close_sensor_subscription: CloseHandler | None = None
        self._close_detection_subscription: CloseHandler | None = None

        self._sensors: dict[str, SensorProxy] = {}
        self._owned_sensors: dict[str, tuple[Sensor[Any, Any, Any], SensorType]] = {}
        self._sensor_cleanup_functions: dict[str, CloseHandler] = {}

        self._impl_cleanup_function: CloseHandler | None = None

        self._tasks = TaskSet(name=f"CameraDevice:{camera['_id']}")

        self._namespaces: tuple[
            CameraNamespaces,
            FrameWorkerNamespaces,
            PluginCameraNamespaces,
            SensorControllerNamespaces,
            FrameWorkerDetectionNamespaces,
        ] = (
            NamespaceManager.camera_namespaces(self.id),
            NamespaceManager.frame_worker_namespaces(self.id),
            NamespaceManager.plugin_camera_namespaces(self._plugin["id"], self.id),
            NamespaceManager.sensor_controller_namespaces(self.id),
            NamespaceManager.frame_worker_detection_namespaces(self.id),
        )

    @property
    def _cameraObject(self) -> Camera:
        return deepcopy(self._camera_subject.value)

    @property
    def logger(self) -> LoggerService:
        return self._logger

    @property
    def id(self) -> str:
        return self._camera_subject.value["_id"]

    @property
    def nativeId(self) -> str | None:
        return self._camera_subject.value.get("nativeId")

    @property
    def pluginInfo(self) -> CameraPluginInfo | None:
        plugin_info = self._camera_subject.value.get("pluginInfo")
        if not plugin_info:
            return None

        return deepcopy(self._camera_subject.value.get("pluginInfo"))

    @property
    def connected(self) -> bool:
        return self._camera_state.value or False

    @property
    def frameWorkerConnected(self) -> bool:
        return self._frame_worker_state.value or False

    @property
    def onConnected(self) -> Observable[bool]:
        return self._onConnected

    @property
    def onFrameWorkerConnected(self) -> Observable[bool]:
        return self._onFrameworkerConnected

    @property
    def disabled(self) -> bool:
        return self._camera_subject.value["disabled"]

    @property
    def name(self) -> str:
        return self._camera_subject.value["name"]

    @property
    def room(self) -> str:
        return self._camera_subject.value.get("room", "Default")

    @property
    def type(self) -> CameraType:
        return self._camera_subject.value["type"]

    @property
    def info(self) -> CameraInformation:
        return deepcopy(self._camera_subject.value["info"])

    @property
    def isCloud(self) -> bool:
        return self._camera_subject.value["isCloud"]

    @property
    def snapshotSettings(self) -> SnapshotSettings:
        return deepcopy(self._camera_subject.value["snapshotSettings"])

    @property
    def detectionZones(self) -> list[DetectionZone]:
        return deepcopy(self._camera_subject.value["detectionZones"])

    @property
    def detectionLines(self) -> list[DetectionLine]:
        return deepcopy(self._camera_subject.value["detectionLines"])

    @property
    def detectionSettings(self) -> CameraDetectionSettings:
        return deepcopy(self._camera_subject.value["detectionSettings"])

    @property
    def ptzAutotrack(self) -> PtzAutotrackSettings:
        return deepcopy(self._camera_subject.value["ptzAutotrack"])

    @property
    def recordingSettings(self) -> CameraRecordingSettings:
        return deepcopy(self._camera_subject.value["recordingSettings"])

    @property
    def snooze(self) -> bool:
        return bool(self._camera_subject.value["detectionSettings"].get("snooze", False))

    @property
    def frameWorkerSettings(self) -> CameraFrameWorkerSettings:
        return deepcopy(self._camera_subject.value["frameWorkerSettings"])

    @property
    def interfaceSettings(self) -> CameraUiSettings:
        return deepcopy(self._camera_subject.value["interfaceSettings"])

    @property
    def sources(self) -> list[CameraDeviceSource]:
        sources = deepcopy(self._camera_subject.value["sources"])
        # Single funnel for all URL consumers - remote-hosted plugins get
        # reachable URLs (see remote_urls.py).
        for source in sources:
            source["urls"] = rewrite_source_urls_for_remote(source["urls"])
        return [CameraDeviceSourceImpl(source, self) for source in sources]

    @property
    def streamSource(self) -> CameraDeviceSource:
        return cast(
            CameraDeviceSource,
            self.highResolutionSource or self.midResolutionSource or self.lowResolutionSource,
        )

    @property
    def highResolutionSource(self) -> CameraDeviceSource | None:
        return next((s for s in self.sources if s.role == "high-resolution"), None)

    @property
    def midResolutionSource(self) -> CameraDeviceSource | None:
        return next((s for s in self.sources if s.role == "mid-resolution"), None)

    @property
    def lowResolutionSource(self) -> CameraDeviceSource | None:
        return next((s for s in self.sources if s.role == "low-resolution"), None)

    @property
    def snapshotSource(self) -> CameraDeviceSource | None:
        snapshot_source = next((s for s in self.sources if s.role == "snapshot"), None)
        if not snapshot_source:
            snapshot_source = next((s for s in self.sources if s.useForSnapshot), None)
        return snapshot_source

    @property
    def _camera_controller_proxy(self) -> CameraControllerInterface:
        return self._proxy.create_proxy(self._namespaces[0].camera_controller_rpc)

    @property
    def _sensor_controller_proxy(self) -> SensorControllerInterface:
        return self._proxy.create_proxy(self._namespaces[3].sensor_rpc)

    @property
    def _detection_coordinator_proxy(self) -> DetectionCoordinatorRPC:
        return self._proxy.create_proxy(self._namespaces[4].detection_rpc)

    def getSourceById(self, id: str) -> CameraDeviceSource | None:
        return next((s for s in self.sources if s._id == id), None)  # pyright: ignore[reportPrivateUsage]

    def _can_access_sensor(self, sensor: StoredSensorData) -> bool:
        # Own sensors are always accessible
        if sensor.get("pluginId") == self._plugin["id"]:
            return True

        # Foreign sensors require consumes declaration
        return "consumes" in self._contract and sensor["type"] in self._contract["consumes"]

    async def init(self) -> None:
        if self._initialized.value:
            return

        self._initialized.next(True)

        self._close_subscription = await self._proxy.subscribe(
            self._namespaces[0].camera_subject, self._on_event_message
        )

        self._close_sensor_subscription = await self._proxy.subscribe(
            self._namespaces[3].sensor_subject, self._on_global_sensor_event
        )

        ns = NamespaceManager.detection_event_namespaces(self.id)

        def _handle_detection_msg(msg: dict[str, Any]) -> None:
            self._detection_event_subject.next({"type": msg["type"], "event": msg["data"]})

        self._close_detection_subscription = await self._proxy.subscribe(
            ns.detection_event_subject, _handle_detection_msg
        )

        await self._refresh_states()
        await self._initialize_sensors()

    async def connect(self) -> None:
        if not self.pluginInfo or self.pluginInfo["id"] != self._plugin["id"]:
            return

        await self._camera_controller_proxy.connect()

    async def disconnect(self) -> None:
        if not self.pluginInfo or self.pluginInfo["id"] != self._plugin["id"]:
            return

        await self._camera_controller_proxy.disconnect()

    def onPropertyChange(
        self, property: CameraPublicProperties | list[CameraPublicProperties]
    ) -> Observable[CameraPropertyObservableObject]:
        def map_fn(
            cameras: tuple[Camera, Camera],
        ) -> list[Any]:
            properties: list[Any] = property if isinstance(property, list) else [property]

            return [
                {
                    "property": prop,
                    "old_state": cameras[0].get(prop),
                    "new_state": cameras[1].get(prop),
                }
                for prop in properties
            ]

        def filter_fn(
            camera: CameraPropertyObservableObject,
        ) -> bool:
            return (
                DeepDiff(
                    camera["old_state"],
                    camera["new_state"],
                    ignore_order=True,
                )
                != {}
            )

        return self._camera_subject.pipe(
            pairwise(),
            merge_map(lambda cameras, _idx: map_fn(cameras)),
            filter_op(filter_fn),
            share(),
        )

    def createStorage(self, schemas: list[Any]) -> Any:
        return self._storage_controller.createCameraStorage(self.id, schemas)

    def getSensors(self) -> list[SensorLike]:
        owned_sensors = [entry[0] for entry in self._owned_sensors.values()]
        proxy_sensors = list(self._sensors.values())
        return [*owned_sensors, *proxy_sensors]

    def getSensor(self, sensorId: str) -> SensorLike | None:
        # Check if we own this sensor - return the real sensor
        owned = self._owned_sensors.get(sensorId)
        if owned:
            return owned[0]
        # Return proxy for foreign sensors
        return self._sensors.get(sensorId)

    def getSensorsByType(self, sensorType: SensorType) -> list[SensorLike]:
        return [s for s in self.getSensors() if s.type == sensorType]

    async def addSensor(self, sensor: Sensor[Any, Any, Any]) -> None:
        plugin_id = self._plugin["id"]

        sensor._setCameraId(self.id)  # pyright: ignore[reportPrivateUsage]
        sensor._setPluginId(plugin_id)  # pyright: ignore[reportPrivateUsage]

        sensor_type = sensor.type
        sensor._init(  # pyright: ignore[reportPrivateUsage]
            lambda properties: self._on_sensor_state_write(sensor.id, sensor_type, properties)
        )

        sensor._initCapabilities(lambda caps: self._on_sensor_capabilities_changed(sensor.id, caps))  # pyright: ignore[reportPrivateUsage]

        schemas = sensor.storage_schema
        storage = self._storage_controller.createSensorStorage(
            self.id,
            sensor.type,
            plugin_id,
            sensor.name,
            sensor.id,
            schemas,
        )
        await storage.register_storage()

        saved_display_name = storage.values.get("_displayName")
        sensor.displayName = saved_display_name if saved_display_name else sensor.name

        sensor._setStorage(storage)  # pyright: ignore[reportPrivateUsage]

        sensor_namespace = NamespaceManager.sensor_provider_namespaces(
            plugin_id, self.id, sensor.id
        ).sensor_rpc

        requires_frames = getattr(sensor, "_requires_frames", False)
        model_spec = getattr(sensor, "modelSpec", None)

        cleanup = await self._proxy.register_handler(sensor_namespace, sensor, without_decorators=True)
        self._sensor_cleanup_functions[sensor.id] = cleanup

        sensor_json = sensor.toJSON()
        sensor_json["requiresFrames"] = requires_frames
        if model_spec:
            sensor_json["modelSpec"] = model_spec

        is_assigned = await self._camera_controller_proxy.registerSensor(sensor_json, plugin_id)
        sensor._setAssigned(is_assigned)  # pyright: ignore[reportPrivateUsage]
        self._owned_sensors[sensor.id] = (sensor, sensor.type)

        sensor_event_ns = NamespaceManager.sensor_event_namespaces(self.id, sensor.id)

        async def handle_backend_event(event: dict[str, Any]) -> None:
            if event.get("type") == "property:changed":
                change_data = event.get("data", {})
                prop = change_data.get("property")
                value = change_data.get("value")
                timestamp = change_data.get("timestamp")
                if prop is not None:
                    sensor._onBackendPropertyChanged(prop, value, timestamp)  # pyright: ignore[reportPrivateUsage]

        unsubscribe_backend = await self._proxy.subscribe(
            sensor_event_ns.sensor_subject, handle_backend_event
        )

        existing_cleanup = self._sensor_cleanup_functions.get(sensor.id)
        if existing_cleanup:

            async def combined_cleanup() -> None:
                await unsubscribe_backend()
                await existing_cleanup()

            self._sensor_cleanup_functions[sensor.id] = combined_cleanup
        else:
            self._sensor_cleanup_functions[sensor.id] = unsubscribe_backend

    async def removeSensor(self, sensorId: str) -> None:
        await self._camera_controller_proxy.unregisterSensor(sensorId)

        cleanup = self._sensor_cleanup_functions.pop(sensorId, None)
        if cleanup:
            await cleanup()

        owned = self._owned_sensors.pop(sensorId, None)
        if owned:
            owned[0]._cleanup()  # pyright: ignore[reportPrivateUsage]

        proxy = self._sensors.get(sensorId)
        if proxy:
            await proxy._unsubscribe_from_events()  # pyright: ignore[reportPrivateUsage]
            self._sensors.pop(sensorId, None)

    @property
    def onSensorAdded(self) -> Observable[SensorEventData]:
        return self._sensor_added_subject.as_observable()

    @property
    def onSensorRemoved(self) -> Observable[SensorEventData]:
        return self._sensor_removed_subject.as_observable()

    def onSensorProperty(
        self,
        sensor_type: SensorType,
        property: str,
        callback: Any,
    ) -> Disposable:
        property_sub: Disposable | None = None

        def subscribe_to(sensor: SensorLike) -> None:
            nonlocal property_sub
            if property_sub is not None:
                property_sub.dispose()
            property_sub = sensor.onPropertyChanged.subscribe(
                lambda e: callback(e["value"], e["timestamp"], sensor) if e["property"] == property else None
            )

        existing = self.getSensorsByType(sensor_type)
        if existing:
            subscribe_to(existing[0])

        added_sub = self.onSensorAdded.subscribe(
            lambda e: (
                subscribe_to(self.getSensorsByType(sensor_type)[0])
                if e["sensorType"] == sensor_type and self.getSensorsByType(sensor_type)
                else None
            )
        )

        def on_removed(e: SensorEventData) -> None:
            nonlocal property_sub
            if e["sensorType"] == sensor_type and property_sub is not None:
                property_sub.dispose()
                property_sub = None

        removed_sub = self.onSensorRemoved.subscribe(on_removed)

        def teardown() -> None:
            nonlocal property_sub
            if property_sub is not None:
                property_sub.dispose()
            added_sub.dispose()
            removed_sub.dispose()

        return Disposable(teardown)

    @property
    def onDetectionEvent(self) -> Observable[DetectionEventPayload]:
        return self._detection_event_subject.as_observable()

    async def implement(self, impl: CameraImplementation) -> None:
        plugin_id = self._plugin["id"]
        namespace = NamespaceManager.plugin_camera_namespaces(plugin_id, self.id)
        self._impl_cleanup_function = await self._proxy.register_handler(
            namespace.camera_impl_rpc, impl, without_decorators=True
        )

    async def streamUrl(self, source_id: str) -> str | None:
        return await self._camera_controller_proxy.streamUrl(source_id)

    async def _snapshot(self, source_id: str, force_new: bool | None = None) -> bytes | None:
        return await self._camera_controller_proxy.snapshot(source_id, force_new)

    async def _probe_stream(
        self,
        source_id: str,
        probe_config: ProbeConfig | None = None,
        refresh: bool | None = False,
    ) -> ProbeStream | None:
        return await self._camera_controller_proxy.probeStream(source_id, probe_config, refresh)

    async def _get_stream_status(self, source_id: str) -> str:
        try:
            return await self._camera_controller_proxy.getStreamStatus(source_id)
        except Exception:
            return "idle"

    async def cleanup(self) -> None:
        self._initialized.next(False)

        self.unsubscribe()

        self._tasks.remove_all()

        if self._close_subscription:
            await self._close_subscription()
            self._close_subscription = None

        if self._close_sensor_subscription:
            await self._close_sensor_subscription()
            self._close_sensor_subscription = None

        if self._close_detection_subscription:
            await self._close_detection_subscription()
            self._close_detection_subscription = None

        if self._impl_cleanup_function:
            with contextlib.suppress(Exception):
                await self._impl_cleanup_function()
            self._impl_cleanup_function = None

        for cleanup in list(self._sensor_cleanup_functions.values()):
            with contextlib.suppress(Exception):
                await cleanup()
        self._sensor_cleanup_functions.clear()

        for sensor_proxy in list(self._sensors.values()):
            await sensor_proxy._unsubscribe_from_events()  # pyright: ignore[reportPrivateUsage]

        for owned_sensor, _ in list(self._owned_sensors.values()):
            owned_sensor._cleanup()  # pyright: ignore[reportPrivateUsage]

        self._sensors.clear()
        self._owned_sensors.clear()

        self._camera_subject.complete()
        self._camera_state.complete()
        self._frame_worker_state.complete()
        self._initialized.complete()
        self._sensor_added_subject.complete()
        self._sensor_removed_subject.complete()
        self._detection_event_subject.complete()

    async def _refresh_states(self) -> None:
        response = await self._camera_controller_proxy.refreshStates()

        self._camera_subject.next(response["camera"])
        self._camera_state.next(response["cameraState"])
        self._frame_worker_state.next(response["frameWorkerState"])

    async def _initialize_sensors(self) -> None:
        try:
            sensors = await self._sensor_controller_proxy.getSensors(self._plugin["id"])
            newly_added: list[SensorProxy] = []

            for sensor_data in sensors:
                if sensor_data["id"] in self._sensors:
                    continue

                if sensor_data["id"] in self._owned_sensors:
                    continue

                plugin_id = sensor_data.get("pluginId", self._plugin["id"])
                owner_ns = NamespaceManager.sensor_provider_namespaces(
                    plugin_id, self.id, sensor_data["id"]
                ).sensor_rpc
                proxy = SensorProxy(sensor_data, self._proxy, owner_ns, self.id)
                self._sensors[sensor_data["id"]] = proxy
                newly_added.append(proxy)

            current_ids = {s["id"] for s in sensors}
            for sensor_id in list(self._sensors.keys()):
                if sensor_id not in current_ids:
                    sensor = self._sensors.get(sensor_id)
                    if sensor:
                        await sensor._unsubscribe_from_events()  # pyright: ignore[reportPrivateUsage]
                    self._sensors.pop(sensor_id, None)

            if newly_added:
                await self._get_sensor_states(newly_added)
                # Subscribe each sensor to its own per-sensor namespace
                for sensor in newly_added:
                    await sensor._subscribe_to_events()  # pyright: ignore[reportPrivateUsage]

        except Exception:
            # SensorController not available yet
            pass

    async def _get_sensor_states(self, sensors: list[SensorProxy]) -> None:
        try:
            states = await self._sensor_controller_proxy.getSensorStates()
            for sensor in sensors:
                state = states.get(sensor.id)
                if state:
                    sensor._apply_refreshed_state(state)  # pyright: ignore[reportPrivateUsage]
        except Exception:
            pass

    async def _on_event_message(self, event: CameraEventMessage) -> None:
        if not self._initialized.value:
            return

        event_type = event.get("type")
        data = event.get("data")

        if event_type == "removed":
            await self.cleanup()
        elif event_type == "updated" and data is not None:
            self._camera_subject.next(cast(Camera, data))
        elif event_type == "cameraState" and data is not None:
            self._camera_state.next(cast(bool, data))
        elif event_type == "frameWorkerState" and data is not None:
            self._frame_worker_state.next(cast(bool, data))

    async def _on_global_sensor_event(self, event: SensorEventMessage) -> None:
        if not self._initialized.value:
            return

        event_type = event.get("type")

        if event_type == "sensor:added":
            added_data = cast(SensorAddedEvent, event.get("data"))
            sensor_data = added_data["sensor"]
            # Only add if not already in cache and not our own sensor
            if sensor_data["id"] not in self._sensors and sensor_data["id"] not in self._owned_sensors:
                # Check if plugin can access this sensor based on contract.consumes
                if not self._can_access_sensor(sensor_data):
                    return  # Skip - sensor type not in contract.consumes
                plugin_id = sensor_data.get("pluginId", self._plugin["id"])
                owner_ns = NamespaceManager.sensor_provider_namespaces(
                    plugin_id, self.id, sensor_data["id"]
                ).sensor_rpc
                proxy = SensorProxy(sensor_data, self._proxy, owner_ns, self.id)
                await proxy._subscribe_to_events()  # pyright: ignore[reportPrivateUsage]
                self._sensors[sensor_data["id"]] = proxy

            self._sensor_added_subject.next(
                {"sensorId": sensor_data["id"], "sensorType": sensor_data["type"]}
            )

        elif event_type == "sensor:removed":
            removed_data = cast(SensorRemovedEvent, event.get("data"))
            sensor = self._sensors.get(removed_data["sensorId"])
            if sensor:
                await sensor._unsubscribe_from_events()  # pyright: ignore[reportPrivateUsage]
            self._sensors.pop(removed_data["sensorId"], None)

            self._sensor_removed_subject.next(
                {
                    "sensorId": removed_data["sensorId"],
                    "sensorType": removed_data["sensorType"],
                }
            )

        elif event_type == "sensor:assignment:changed":
            assign_data = cast(SensorAssignmentChangedEvent, event.get("data"))
            sensor_type = assign_data["sensorType"]
            is_assigned = assign_data["assigned"]

            if assign_data["pluginId"] == self._plugin["id"]:
                for _, (owned_sensor, s_type) in self._owned_sensors.items():
                    if s_type == sensor_type:
                        owned_sensor._setAssigned(is_assigned)  # pyright: ignore[reportPrivateUsage]

    def _on_sensor_state_write(
        self, sensor_id: str, sensor_type: SensorType, properties: dict[str, Any]
    ) -> None:
        if sensor_type in DETECTION_SENSOR_TYPES:
            if not (self._frame_worker_state.value or False):
                return

            async def notify_coordinator() -> None:
                try:
                    await self._detection_coordinator_proxy.reportSensorWrite(
                        sensor_id, sensor_type, properties
                    )
                except Exception as e:
                    self._logger.warn(f"Failed to forward sensor write to coordinator for {sensor_id}: {e}")

            self._tasks.add(notify_coordinator())
            return

        async def notify_controller() -> None:
            with contextlib.suppress(Exception):
                await self._sensor_controller_proxy.updatePropertyValues(sensor_id, properties)

        self._tasks.add(notify_controller())

    def _on_sensor_capabilities_changed(self, sensor_id: str, capabilities: list[str]) -> None:
        async def notify() -> None:
            with contextlib.suppress(Exception):
                await self._sensor_controller_proxy.updateCapabilities(sensor_id, capabilities)

        self._tasks.add(notify())

    def _create_state_observable(self, state_subject: BehaviorSubject[Any]) -> Observable[Any]:
        return state_subject.pipe(distinct_until_changed(), share())
