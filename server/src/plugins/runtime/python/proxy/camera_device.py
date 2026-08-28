from __future__ import annotations

import contextlib
from collections.abc import Callable
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
    CameraZones,
    DetectionEventPayload,
    Disposable,
    LoggerService,
    Observable,
    ProbeConfig,
    ProbeStream,
    PtzAutotrackSettings,
    RTSPUrlOptions,
    Sensor,
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
from plugins.runtime.python.camera.utils import build_snapshot_url, build_target_url
from plugins.runtime.python.namespaces import (
    CameraNamespaces,
    FrameWorkerDetectionNamespaces,
    FrameWorkerNamespaces,
    NamespaceManager,
    PluginCameraNamespaces,
    SensorRegistryNamespaces,
)
from plugins.runtime.python.proxy.limiter import registration_slot
from plugins.runtime.python.proxy.sensor import (
    DetectionCoordinatorRPC,
    SensorRegistryInterface,
)
from plugins.runtime.python.remote_urls import rewrite_source_urls_for_remote
from plugins.runtime.python.typings import (
    CameraEventMessage,
    PluginInfo,
)

if TYPE_CHECKING:
    from _camera_ui_tools.camera_ui_sdk.internal import SensorSourcePatch
    from plugins.runtime.python.proxy.sensor_manager import SensorManagerProxy
    from plugins.runtime.python.storage_controller import StorageController


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
        sensor_manager: SensorManagerProxy,
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
        self._storage_controller: StorageController = storage_controller
        self._sensor_manager = sensor_manager

        self._detection_event_subject: Subject[DetectionEventPayload] = Subject()

        self._close_subscription: CloseHandler | None = None
        self._detection_wire: CloseHandler | None = None
        self._detection_wire_pending = False
        self._detection_subscriber_count = 0

        self._owned_sensors: dict[str, tuple[Sensor[Any, Any, Any], SensorType]] = {}
        self._sensor_cleanup_functions: dict[str, CloseHandler] = {}

        self._impl_cleanup_function: CloseHandler | None = None

        self._tasks = TaskSet(name=f"CameraDevice:{camera['_id']}")

        self._namespaces: tuple[
            CameraNamespaces,
            FrameWorkerNamespaces,
            PluginCameraNamespaces,
            SensorRegistryNamespaces,
            FrameWorkerDetectionNamespaces,
        ] = (
            NamespaceManager.camera_namespaces(self.id),
            NamespaceManager.frame_worker_namespaces(self.id),
            NamespaceManager.plugin_camera_namespaces(self._plugin["id"], self.id),
            NamespaceManager.sensor_registry_namespaces(),
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
    def zones(self) -> CameraZones:
        return deepcopy(
            self._camera_subject.value.get(
                "zones",
                CameraZones(motion=[], object=[], privacy=[], alert=[], lines=[]),
            )
        )

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
    def _sensor_registry_proxy(self) -> SensorRegistryInterface:
        return self._proxy.create_proxy(self._namespaces[3].sensors_rpc)

    @property
    def _detection_coordinator_proxy(self) -> DetectionCoordinatorRPC:
        return self._proxy.create_proxy(self._namespaces[4].detection_rpc)

    def getSourceById(self, id: str) -> CameraDeviceSource | None:
        return next((s for s in self.sources if s._id == id), None)  # pyright: ignore[reportPrivateUsage]

    async def init(self) -> None:
        if self._initialized.value:
            return

        self._initialized.next(True)

        self._close_subscription = await self._proxy.subscribe(
            self._namespaces[0].camera_subject, self._on_event_message
        )

        await self._refresh_states()

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

    async def addSensor(self, sensor: Sensor[Any, Any, Any]) -> None:
        async with registration_slot():
            await self._addSensorInner(sensor)

    async def _addSensorInner(self, sensor: Sensor[Any, Any, Any]) -> None:
        plugin_id = self._plugin["id"]
        sensor._setPluginId(plugin_id)  # pyright: ignore[reportPrivateUsage]

        sensor_json = sensor.toJSON()
        sensor_json["requiresFrames"] = getattr(sensor, "_requires_frames", False) is True
        # derived nativeId keeps per-camera instances of same-named sensors distinct
        if not sensor_json.get("nativeId"):
            sensor_json["nativeId"] = f"{self.id}:{sensor.type}:{sensor.name}"

        # resolve the durable id first and wire storage with it, so registration
        # data (modelSpec) can read sensor storage
        sensor_id = await self._sensor_registry_proxy.resolveSensor(
            sensor_json, plugin_id, {"assignCameraId": self.id}
        )
        sensor._setId(sensor_id)  # pyright: ignore[reportPrivateUsage]
        sensor_json["id"] = sensor_id

        storage = self._storage_controller.createSensorStorage(plugin_id, sensor.id, sensor.storage_schema)
        await storage.register_storage()
        sensor._setStorage(storage)  # pyright: ignore[reportPrivateUsage]

        model_spec = getattr(sensor, "modelSpec", None)
        if model_spec:
            sensor_json["modelSpec"] = model_spec

        registration = await self._sensor_registry_proxy.registerSensor(
            sensor_json, plugin_id, {"assignCameraId": self.id}
        )
        sensor._setAssignedCameras(registration["assignedCameraIds"])  # pyright: ignore[reportPrivateUsage]
        set_locked = getattr(sensor, "_setAssignmentLocked", None)
        if callable(set_locked):
            set_locked()

        # assignment changes arrive on the global stream the sensor manager owns
        await self._sensor_manager.track_camera_sensor(sensor)

        sensor_namespace = NamespaceManager.sensor_provider_namespaces(plugin_id, sensor.id).sensor_rpc

        sensor_type = sensor.type
        sensor._init(  # pyright: ignore[reportPrivateUsage]
            lambda properties: self._on_sensor_state_write(sensor.id, sensor_type, properties)
        )
        sensor._initCapabilities(lambda caps: self._on_sensor_capabilities_changed(sensor.id, caps))  # pyright: ignore[reportPrivateUsage]
        sensor._initSource(lambda patch: self._on_sensor_source_changed(sensor.id, patch))  # pyright: ignore[reportPrivateUsage]

        rpc_cleanup = await self._proxy.register_handler(sensor_namespace, sensor, without_decorators=True)

        self._owned_sensors[sensor.id] = (sensor, sensor.type)

        # Subscribe to backend-initiated property changes for the owned sensor so that
        # backend updates (e.g., motion dwell timer) sync into the local sensor state.
        sensor_event_ns = NamespaceManager.sensor_event_namespaces(sensor.id)

        async def handle_backend_event(event: dict[str, Any]) -> None:
            if event.get("type") == "property:changed":
                change_data = event.get("data", {})
                prop = change_data.get("property")
                if prop is not None:
                    sensor._onBackendPropertyChanged(  # pyright: ignore[reportPrivateUsage]
                        prop, change_data.get("value"), change_data.get("timestamp")
                    )

        unsubscribe_backend = await self._proxy.subscribe(
            sensor_event_ns.sensor_subject, handle_backend_event
        )

        async def combined_cleanup() -> None:
            await unsubscribe_backend()
            await rpc_cleanup()

        self._sensor_cleanup_functions[sensor.id] = combined_cleanup

        sensor._setActive(True)  # pyright: ignore[reportPrivateUsage]

    async def removeSensor(self, sensorId: str) -> None:
        self._sensor_manager.untrack_camera_sensor(sensorId)
        await self._sensor_registry_proxy.unregisterSensor(sensorId)

        cleanup = self._sensor_cleanup_functions.pop(sensorId, None)
        if cleanup:
            await cleanup()

        owned = self._owned_sensors.pop(sensorId, None)
        if owned:
            owned[0]._cleanup()  # pyright: ignore[reportPrivateUsage]

    @property
    def onDetectionEvent(self) -> Observable[DetectionEventPayload]:
        def _subscribe(callback: Callable[[DetectionEventPayload], None]) -> Disposable:
            if self._detection_event_subject.closed:
                return Disposable(lambda: None)

            sub = self._detection_event_subject.subscribe(callback)
            self._detection_subscriber_count += 1
            self._ensure_detection_wire()

            def _teardown() -> None:
                sub.dispose()
                self._detection_subscriber_count -= 1
                if self._detection_subscriber_count == 0:
                    self._drop_detection_wire()

            return Disposable(_teardown)

        return Observable(_subscribe)

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

        if self._detection_wire:
            await self._detection_wire()
            self._detection_wire = None

        if self._impl_cleanup_function:
            with contextlib.suppress(Exception):
                await self._impl_cleanup_function()
            self._impl_cleanup_function = None

        for cleanup in list(self._sensor_cleanup_functions.values()):
            with contextlib.suppress(Exception):
                await cleanup()
        self._sensor_cleanup_functions.clear()

        for owned_sensor, _ in list(self._owned_sensors.values()):
            self._sensor_manager.untrack_camera_sensor(owned_sensor.id)
            owned_sensor._cleanup()  # pyright: ignore[reportPrivateUsage]

        self._owned_sensors.clear()

        self._camera_subject.complete()
        self._camera_state.complete()
        self._frame_worker_state.complete()
        self._initialized.complete()
        self._detection_event_subject.complete()

    def _handle_detection_msg(self, msg: dict[str, Any]) -> None:
        self._detection_event_subject.next({"type": msg["type"], "event": msg["data"]})

    def _ensure_detection_wire(self) -> None:
        if self._detection_wire or self._detection_wire_pending:
            return

        self._detection_wire_pending = True

        async def _subscribe() -> None:
            try:
                ns = NamespaceManager.detection_event_namespaces(self.id)
                close = await self._proxy.subscribe(ns.detection_event_subject, self._handle_detection_msg)
            except Exception as error:
                self._logger.error(f"Failed to subscribe to detection events: {error}")
                self._detection_wire_pending = False
                return

            self._detection_wire_pending = False
            if self._detection_subscriber_count == 0:
                # last consumer left while the subscribe was in flight
                self._tasks.add(close())
                return

            self._detection_wire = close

        self._tasks.add(_subscribe())

    def _drop_detection_wire(self) -> None:
        close = self._detection_wire
        self._detection_wire = None
        if close:
            self._tasks.add(close())

    async def _refresh_states(self) -> None:
        response = await self._camera_controller_proxy.refreshStates()

        # a resync must not wake subscribers for state they already hold
        if response["camera"] != self._camera_subject.value:
            self._camera_subject.next(response["camera"])
        if response["cameraState"] != self._camera_state.value:
            self._camera_state.next(response["cameraState"])
        if response["frameWorkerState"] != self._frame_worker_state.value:
            self._frame_worker_state.next(response["frameWorkerState"])

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

    def _on_sensor_state_write(
        self, sensor_id: str, sensor_type: SensorType, properties: dict[str, Any]
    ) -> None:
        if sensor_type in DETECTION_SENSOR_TYPES:
            # the spec belongs to the registry: it survives a frame worker that is
            # not up yet, the coordinator receives it with the next sensor push
            model_spec = properties.get("modelSpec")
            if model_spec is not None:
                properties = {k: v for k, v in properties.items() if k != "modelSpec"}

                async def notify_spec() -> None:
                    with contextlib.suppress(Exception):
                        await self._sensor_registry_proxy.updateModelSpec(sensor_id, model_spec)

                self._tasks.add(notify_spec())
                if not properties:
                    return

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

        async def notify_registry() -> None:
            with contextlib.suppress(Exception):
                await self._sensor_registry_proxy.updatePropertyValues(sensor_id, properties)

        self._tasks.add(notify_registry())

    def _on_sensor_capabilities_changed(self, sensor_id: str, capabilities: list[str]) -> None:
        async def notify() -> None:
            with contextlib.suppress(Exception):
                await self._sensor_registry_proxy.updateCapabilities(sensor_id, capabilities)

        self._tasks.add(notify())

    def _on_sensor_source_changed(self, sensor_id: str, patch: SensorSourcePatch) -> None:
        async def notify() -> None:
            with contextlib.suppress(Exception):
                await self._sensor_registry_proxy.updateSource(sensor_id, patch)

        self._tasks.add(notify())

    def _create_state_observable(self, state_subject: BehaviorSubject[Any]) -> Observable[Any]:
        return state_subject.pipe(distinct_until_changed(), share())
